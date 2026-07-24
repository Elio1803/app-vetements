# Cohérence visuelle des tenues générées par l'IA

Date : 2026-07-24

## Contexte et problème

Les tenues proposées par le styliste IA (`generate-outfits`, appel Anthropic
avec images) manquent aujourd'hui de cohérence : couleurs qui ne vont pas
ensemble, pièces au registre incompatible, associations qui donnent
l'impression d'être quasi aléatoires. Confirmé sur un dressing réel de
petite taille (< 15 pièces), donc toutes les pièces reçoivent bien leur
photo dans l'appel IA (`MAX_OUTFIT_IMAGES` par défaut = 10, largement
suffisant ici) — le problème n'est pas un manque de couverture image mais
un manque de consignes de cohérence visuelle dans le prompt lui-même.

Inspection du prompt actuel (`promptContent()` dans
`supabase/functions/generate-outfits/index.ts`) : les consignes couvrent la
structure (couverture haut/bas ou robe, chaussures pour les occasions
habillées, adaptation météo, rotation des pièces peu portées) mais ne disent
rien sur l'harmonie des couleurs ou la cohérence de style entre les pièces
d'une même tenue. La consigne de rotation des pièces oubliées est en outre
placée sur un pied d'égalité avec la cohérence, ce qui peut pousser le
modèle à forcer une pièce qui ne va avec rien juste pour la faire tourner.

Chaque vêtement n'a par ailleurs que deux métadonnées texte (`couleur_dominante`,
un mot, et `nom`) — mais comme l'IA reçoit aussi la photo de chaque pièce
candidate ici, le levier prioritaire est de l'inciter à réellement analyser
ces photos plutôt que de compter uniquement sur le texte.

## Objectifs

- Rendre les tenues générées par `generate-outfits` visuellement cohérentes
  (couleurs, registre de style) sans intervention de l'utilisateur.
- Faire en sorte que la justification affichée (`raison`) reflète cette
  cohérence, pour que l'utilisateur puisse faire confiance à la proposition
  sans avoir à la re-vérifier lui-même.
- Rester dans le périmètre du prompt : aucun changement de schéma DB, aucune
  nouvelle extraction de métadonnées à l'analyse des vêtements.

## Non-objectifs

- Pas d'enrichissement des métadonnées vêtements (couleur secondaire, motif,
  registre de style stocké en base) — chantier plus lourd (migration +
  backfill), mis en réserve si ce changement de prompt s'avère insuffisant
  après test réel.
- Pas de changement du moteur local de secours (`src/lib/outfit-engine.ts`,
  utilisé hors-ligne ou après double échec de l'appel IA) — hors périmètre
  de la plainte initiale, qui concerne l'app connectée.
- Pas de double appel IA (proposition puis critique séparée) — le mécanisme
  d'auto-justification choisi reste dans un seul appel pour ne pas doubler
  coût et latence.

## Architecture

Un seul point de changement : le texte du prompt utilisateur construit par
`promptContent()`, plus un léger ajustement du prompt système et de
`maxTokens`, dans `supabase/functions/generate-outfits/index.ts`.

Trois changements de contenu :

1. **Règles de cohérence explicites**, ajoutées aux consignes, avec un ordre
   de priorité clair :
   1. Cohérence visuelle — analyser les couleurs et le style réellement
      visibles sur chaque photo (le champ `couleur_dominante` est indicatif,
      pas toujours précis), composer une palette harmonieuse (base neutre +
      un ou deux accents maximum), garder un registre homogène (ne pas
      mélanger une pièce sport avec une pièce habillée sans demande
      explicite), éviter plusieurs motifs/imprimés forts dans une même
      tenue.
   2. Adéquation à l'occasion et à la météo réelle si fournie (inchangé sur
      le fond, reformulé pour venir après la cohérence).
   3. Rotation des pièces peu portées — uniquement comme critère de
      départage entre plusieurs combinaisons déjà cohérentes selon 1 et 2.

   Une tenue qui fait tourner une pièce oubliée mais ne va pas avec le reste
   est explicitement qualifiée d'échec dans le prompt, même si elle
   respecte les critères 2 et 3.

2. **Champ de raisonnement `analyse_visuelle`**, ajouté dans le schéma JSON
   demandé pour chaque tenue, positionné *avant* `itemIds` dans l'exemple de
   format. L'ordre des champs dans l'exemple structure l'ordre de génération
   du modèle : le faire décrire et justifier l'accord couleur/style des
   pièces envisagées avant de figer `itemIds` l'oblige à raisonner sur la
   cohérence plutôt que de la déduire après coup. Ce champ n'est ni persisté
   ni affiché à l'utilisateur — uniquement un levier de raisonnement,
   silencieusement ignoré par la validation existante (qui ne lit que
   `nom`, `itemIds`, `raison`).

3. **Reformulation de `raison`** pour exiger qu'elle mentionne explicitement
   l'accord couleur/style retenu, en plus de l'adéquation occasion/météo
   déjà couverte — ce texte est affiché à l'utilisateur, donc ce changement
   rend aussi la justification visible plus convaincante.

Ajustement technique associé : `maxTokens` passe de `1800` à `2200` pour
laisser la place au champ `analyse_visuelle` supplémentaire sur les 3
tenues, sans risquer une troncature JSON.

## Composants touchés

- `supabase/functions/generate-outfits/index.ts`
  - `promptContent()` : texte des consignes et du schéma JSON demandé.
  - Prompt système de l'appel (`callAnthropicJson`) : légère reformulation
    pour mentionner l'expertise en harmonie des couleurs.
  - `maxTokens` de l'appel `callAnthropicJson` : `1800` → `2200`.
- `validateGeneratedOutfits()` : aucun changement — continue de ne lire que
  `nom`, `itemIds`, `raison` par destructuration, donc `analyse_visuelle`
  est naturellement ignoré sans risque de rupture de validation.

## Flux de données

Inchangé — seul le contenu du prompt et la longueur de réponse autorisée
changent :

```
promptContent() → callAnthropicJson({ maxTokens: 2200, system, content, validate })
  → réponse JSON avec { tenues: [{ nom, analyse_visuelle, itemIds, raison }] }
  → validateGeneratedOutfits() lit nom/itemIds/raison (analyse_visuelle ignoré)
  → persistance outfits (ai_name, item_ids, ai_reason) — inchangée
```

## Gestion d'erreurs

Inchangée. `validateGeneratedOutfits()` continue de rejeter toute réponse
structurellement invalide (catégories manquantes, ids inconnus, doublons),
ce qui déclenche déjà le mécanisme de repli existant côté client
(`wardrobe-api.ts`, deux tentatives puis fallback local) — ce chantier ne
touche pas à cette mécanique.

## Tests

Aucun test automatisé possible sur la qualité subjective d'un style
proposé par un LLM. Pas de suite de tests existante sur cette Edge
Function (Deno, pas de fichier `*.test.ts` dans
`supabase/functions/generate-outfits/`).

Vérification manuelle obligatoire avant de considérer ce chantier terminé,
après déploiement manuel (`supabase functions deploy generate-outfits` —
rappel : les Edge Functions ne se déploient pas automatiquement au push) :

- Générer des tenues sur le compte réel de test, pour au moins deux
  occasions différentes (ex. `quotidien` et `travail`), et vérifier
  visuellement que les 3 tenues proposées ont des couleurs et un registre
  cohérents pièce à pièce.
- Vérifier que le texte `raison` affiché à l'utilisateur mentionne bien
  l'accord couleur/style, pas seulement l'occasion/météo.
- Vérifier qu'aucune tenue n'échoue à la validation structurelle existante
  (regénérer plusieurs fois pour repérer une éventuelle instabilité liée au
  nouveau champ `analyse_visuelle`).
