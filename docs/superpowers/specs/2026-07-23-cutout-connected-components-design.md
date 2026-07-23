# Détourage — supprimer les fragments détachés du vêtement (ex. un pied dans le cadre)

Date : 2026-07-23

## Contexte et problème

Le détourage local (`isnet_quint8` via `@imgly/background-removal`, désormais
fonctionnel sur Safari/iOS depuis la correction CSP du 2026-07-23) fait de la
segmentation « objet saillant vs fond » : il ne connaît pas la notion de
« vêtement » en tant que classe sémantique. Si un élément saillant mais non
désiré apparaît dans le cadre à côté du vêtement — typiquement un bout de pied
de la personne qui a pris la photo — le modèle le garde comme partie du
premier plan, produisant un petit fragment opaque détaché du vêtement
principal sur le fond blanc final (constaté sur une photo de short : un
morceau de pied isolé en bas à droite de l'image).

## Objectifs

- Après détourage (local ou remove.bg), supprimer automatiquement les
  fragments opaques qui ne sont pas connectés à la zone principale du
  vêtement et qui sont nettement plus petits qu'elle (ex. un bout de pied).
- Ne pas supprimer par erreur un élément légitime composé de plusieurs zones
  disjointes de taille comparable (ex. une paire de chaussures photographiée
  côte à côte pour la catégorie « Chaussures »).

## Non-objectifs

- Pas de segmentation sémantique « vêtement vs corps » (nécessiterait un
  modèle différent, plus lourd, hors périmètre).
- Pas de retouche des bords/anti-aliasing du vêtement principal — ce
  chantier ne touche pas `softenCutoutEdges`, qui reste inchangé.
- Ne traite que les fragments **disjoints** du vêtement principal ; un pied
  qui toucherait/chevaucherait directement le vêtement (pixels connectés)
  n'est pas dans le périmètre de cette correction automatique.

## Architecture

Nouvelle fonction pure dans `src/lib/photo-cutout.ts` :

- `removeDetachedFragments(pixels: Uint8ClampedArray, width: number, height: number, minRelativeArea?: number): void`
  - Étiquette les composantes connexes de pixels opaques (alpha strictement
    supérieur à `BOUNDS_ALPHA_THRESHOLD`, la même constante déjà utilisée par
    `findVisibleBounds`, pour une notion de « visible » cohérente entre les
    deux fonctions) via un parcours en largeur (BFS) itératif avec file,
    connexité à 4 voisins (haut/bas/gauche/droite) — pas de récursion, pour
    éviter tout risque de dépassement de pile sur de grandes images (jusqu'à
    2200 px de côté selon `MAX_UPLOAD_DIMENSION`).
  - Calcule l'aire (nombre de pixels) de chaque composante.
  - Détermine l'aire de la plus grande composante.
  - Pour toute composante dont l'aire est strictement inférieure à
    `minRelativeArea * aireDeLaPlusGrande` (constante par défaut : `0.2`,
    soit 20 %), met tous ses pixels à alpha 0 (transparent), en modifiant le
    buffer en place — comportement cohérent avec `softenCutoutEdges` qui
    fait de même.
  - Une image ne comportant qu'une seule composante (cas le plus courant) ne
    déclenche aucune modification.

Intégration dans `composeProductPhoto` : appelée juste après
`softenCutoutEdges` et avant `findVisibleBounds`, pour que le recadrage final
ignore les fragments déjà effacés.

```
softenCutoutEdges(image.data)
removeDetachedFragments(image.data, bitmap.width, bitmap.height)
findVisibleBounds(image.data, bitmap.width, bitmap.height)
```

## Composants touchés

- `src/lib/photo-cutout.ts` : ajout de `removeDetachedFragments` (+ helper de
  BFS interne) ; appel dans `composeProductPhoto`.
- `src/lib/photo-cutout.test.ts` : nouveaux cas de test (voir ci-dessous).

Aucun autre fichier touché : la fonction opère uniquement sur le buffer de
pixels déjà disponible dans `composeProductPhoto`, sans nouvelle dépendance
ni changement d'API publique des fonctions existantes.

## Flux de données

```
removeBackgroundLocally / createRemoveBgProductPhoto (bitmap brut)
  → composeProductPhoto
      → softenCutoutEdges          (existant, inchangé)
      → removeDetachedFragments    (nouveau)
      → findVisibleBounds          (existant, inchangé)
      → composition sur canvas blanc
```

## Gestion d'erreurs

Aucun nouveau cas d'erreur introduit : la fonction est un traitement de
buffer synchrone et pur, sans I/O, qui ne peut pas lever d'exception dans
son usage normal (tableau de pixels de taille cohérente avec
`width * height * 4`, déjà garanti par l'appelant existant).

## Tests

Dans `photo-cutout.test.ts`, construction de buffers de pixels synthétiques
(comme pour `findVisibleBounds`/`softenCutoutEdges` déjà testés) :

- Une grande zone opaque + une petite zone opaque disjointe (ex. 5 % de
  l'aire de la grande) → la petite zone doit être mise à alpha 0, la grande
  zone reste intacte.
- Deux zones opaques disjointes de taille comparable (ex. 45 %/55 %, cas
  « paire de chaussures ») → aucune des deux n'est effacée.
- Une seule zone opaque (cas courant, vêtement seul) → aucune modification,
  fonction sans effet.
- Une image entièrement transparente → aucune erreur, aucune modification.

Vérification manuelle finale dans l'app réelle (`npm run dev` ou build) avec
la photo de short ayant servi de repro (short + bout de pied visible) pour
confirmer visuellement la disparition du fragment.
