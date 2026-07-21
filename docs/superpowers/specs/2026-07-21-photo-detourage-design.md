# Photo & détourage — fiabiliser et unifier le pipeline de découpe des vêtements

Date : 2026-07-21

## Contexte et problème

Les photos de vêtements ajoutées au dressing ressortent souvent avec des morceaux
coupés (manche, col, bas de vêtement absents) et des contours sales (halos, bords
en escalier). Ce chantier est le premier d'une série de deux visant à améliorer
l'expérience d'ajout d'une pièce ; le second traitera la fiabilité/richesse de
l'analyse IA et un petit doublon d'affichage dans la fiche détail.

L'app dispose aujourd'hui de **deux pipelines de détourage distincts et
divergents** :

1. **remove.bg** (`supabase/functions/remove-background/index.ts`), tenté en
   premier quand l'app est en ligne. Il demande à l'API remove.bg de renvoyer
   directement un JPEG recadré et aplati sur fond blanc (`crop: "true"`,
   `crop_margin: "8%"`, `bg_color: "FFFFFF"`, `format: "jpg"`). Le crop et
   l'aplatissement sont donc décidés par remove.bg lui-même, sans notre
   contrôle.
2. **Modèle local `isnet_quint8`** (`src/lib/product-photo.ts`,
   `@imgly/background-removal`), utilisé en repli silencieux si remove.bg
   échoue. Il applique son propre recadrage par détection de bornes
   (`findVisibleBounds`) et un seuillage d'alpha **binaire**
   (`makeCutoutReadable` force chaque pixel à alpha 0 ou 255), ce qui détruit
   l'anti-aliasing des bords et produit des contours en escalier avec halos.

### Cause racine identifiée : incohérence de taille de fichier

Le front-end (`src/App.tsx`) autorise l'envoi de photos jusqu'à 25 Mo avant même
de tenter remove.bg, alors que la fonction Edge `remove-background` rejette
tout fichier au-delà de 12 Mo (`MAX_IMAGE_BYTES = 12 * 1024 * 1024`), sans
aucune compression côté client en amont. Une photo de téléphone récent (souvent
8 à 20 Mo en haute résolution) tombant entre 12 et 25 Mo échoue donc
**systématiquement** sur remove.bg et bascule vers le modèle local — celui qui
produit précisément les contours sales et coupes signalés. Le `catch` autour de
cet appel (`App.tsx:794-799`) avale en plus l'erreur réelle (pas de log), ce qui
rend la cause indiagnosticable en production.

D'autres causes (quota remove.bg épuisé, clé API invalide, limite de débit
interne à 6/min et 30/h) restent possibles mais ne sont vérifiables que côté
tableaux de bord (Supabase, remove.bg) — hors du périmètre de ce chantier.

## Objectifs

- Un seul comportement de recadrage/composition, prévisible, quelle que soit
  la source du détourage (remove.bg ou modèle local).
- Plus de morceaux de vêtement coupés : les bornes de détection incluent une
  marge de sécurité.
- Des contours propres : préservation de l'anti-aliasing existant au lieu d'un
  seuillage binaire.
- Élimination de la cause principale de bascule silencieuse vers le modèle
  local (incohérence de taille de fichier).
- Les échecs de remove.bg sont désormais journalisés avec leur cause réelle.

## Non-objectifs

- Pas de crop/ajustement manuel côté utilisateur dans l'UI (écarté au profit de
  la correction automatique pour ce chantier ; à reconsidérer plus tard si le
  résultat automatique reste insuffisant).
- Pas de changement du modèle IA de détourage lui-même (on garde remove.bg en
  priorité et `isnet_quint8` en repli).
- La fiabilité/richesse de l'analyse IA (nom, couleur, matière, sous-catégorie)
  et le doublon Rotation / Dernière fois sont traités dans le chantier suivant,
  pas ici.

## Architecture

Nouveau module `src/lib/photo-cutout.ts` regroupant la logique partagée par les
deux pipelines :

- `normalizePhotoForUpload(file: File): Promise<File>` — redimensionne l'image
  à une dimension max raisonnable (~2200 px de long côté) et la recompresse en
  JPEG qualité ~0.9 via canvas. Appelée en tout premier, avant toute tentative
  de détourage, pour garantir un fichier confortablement sous la limite serveur
  quel que soit l'appareil d'origine.
- `removeBackgroundLocally(file: File): Promise<ImageBitmap>` — encapsule
  l'appel à `@imgly/background-removal` (modèle `isnet_quint8`) et retourne le
  bitmap découpé brut, sans aucun recadrage ni composition.
- `findVisibleBounds(pixels, width, height): Bounds` — fonction **pure**
  (buffer de pixels en entrée, pas de dépendance à un `<canvas>` DOM réel) qui
  détecte la zone visible du vêtement. Seuil d'alpha assoupli par rapport à
  aujourd'hui et ajout d'une marge de sécurité (~2 %) autour des bornes
  détectées, pour ne jamais raser un bord.
- `softenCutoutEdges(pixels, width, height): void` — remplace le seuillage
  binaire actuel : seuls les pixels réellement transparents (alpha en dessous
  d'un seuil bas) sont mis à zéro ; les pixels à alpha intermédiaire (bords
  anti-aliasés produits par le modèle de détourage) sont conservés tels quels
  au lieu d'être forcés à 255.
- `composeProductPhoto(bitmap: ImageBitmap): Promise<string>` — pipeline final
  commun : `findVisibleBounds` → `softenCutoutEdges` → composition centrée sur
  canvas blanc (généralisation de la logique actuelle de
  `createProductPhoto`) → export en data URL WebP.

Ce module devient le point de convergence unique : quelle que soit la source du
cutout (remove.bg ou isnet), le résultat final passe par le même traitement et
a donc un rendu visuellement cohérent.

## Composants touchés

- **`supabase/functions/remove-background/index.ts`** : suppression des
  paramètres `crop`, `crop_margin`, `bg_color`, `position` envoyés à remove.bg
  (on ne délègue plus le cadrage à leur API). `format` passe de `jpg` à `png`
  pour récupérer l'alpha brut, non aplati sur blanc. La validation de la
  réponse attend désormais `image/png` au lieu de `image/jpeg`.
- **`src/lib/supabase-client.ts`** (`createRemoveBgProductPhoto`) : décode le
  PNG avec alpha renvoyé par la fonction Edge en `ImageBitmap`, puis appelle
  `composeProductPhoto` — même traitement final que le pipeline local.
- **`src/lib/product-photo.ts`** (`createProductPhoto`) : devient un simple
  enchaînement `removeBackgroundLocally(file)` puis `composeProductPhoto(bitmap)`.
  Les fonctions `findVisibleBounds` / `makeCutoutReadable` actuelles sont
  déplacées et adaptées dans `photo-cutout.ts` (renommée `softenCutoutEdges`
  pour refléter le nouveau comportement non binaire).
- **`src/App.tsx`** (`preparePhotoFile`) :
  - Appelle `normalizePhotoForUpload(file)` avant toute tentative de
    détourage ; le fichier normalisé est utilisé pour les deux branches
    (remove.bg et repli local).
  - Le `catch` autour de l'appel remove.bg logue désormais l'erreur réelle
    (`console.error` avec code/message si disponible) avant d'afficher le
    toast de repli existant. Le toast utilisateur reste inchangé (pas de
    nouveau texte à traduire), seul le diagnostic interne s'améliore.

## Flux de données

```
Sélection photo
  → normalizePhotoForUpload (redimension + recompression JPEG)
  → tentative remove.bg (PNG alpha, sans crop serveur)
      ↳ échec → log de la cause réelle → repli isnet local (bitmap brut)
  → composeProductPhoto (bornes + marge de sécurité + adoucissement des bords
    + composition sur canvas blanc)
  → data URL stockée (comme aujourd'hui)
```

## Gestion d'erreurs

Le comportement de repli existant est conservé à l'identique dans sa
structure (remove.bg échoue → isnet local → sinon `compressPhoto` sans
détourage si isnet échoue aussi) ; seule la fonction appelée après détourage
change, et l'erreur réelle de remove.bg est désormais journalisée
(`console.error`) au lieu d'être avalée silencieusement. Les messages affichés
à l'utilisateur (toasts) restent ceux qui existent déjà.

## Tests

- `findVisibleBounds` et `softenCutoutEdges` sont conçues comme des fonctions
  pures opérant sur des buffers de pixels (`Uint8ClampedArray` + largeur/
  hauteur), constructibles à la main dans des tests vitest sans nécessiter un
  vrai `<canvas>` DOM (non disponible de façon fiable en jsdom). Cas à couvrir :
  - Un pixel semi-transparent isolé (bord anti-aliasé) : doit être préservé
    par `softenCutoutEdges`, pas forcé à opaque ou transparent.
  - Une fine protubérance d'1 px en bord d'image (ex. lanière fine) : doit
    être incluse dans les bornes détectées par `findVisibleBounds`, marge de
    sécurité comprise.
  - Une image entièrement transparente : `findVisibleBounds` retombe sur les
    dimensions complètes (comportement de secours déjà présent aujourd'hui).
- `normalizePhotoForUpload` : test sur la logique de calcul de dimensions
  cibles (fonction pure séparée du dessin canvas si possible) pour vérifier
  qu'une image plus petite que la limite n'est pas agrandie, et qu'une image
  plus grande est redimensionnée proportionnellement.
- Vérification manuelle finale obligatoire dans l'app réelle (via `npm run
  dev`) : ajouter une pièce avec une photo de téléphone réelle (>12 Mo si
  possible) et confirmer visuellement l'absence de coupe et de contours sales,
  sur les deux chemins (remove.bg et repli local, ce dernier testable en
  coupant temporairement la clé remove.bg ou le réseau).
