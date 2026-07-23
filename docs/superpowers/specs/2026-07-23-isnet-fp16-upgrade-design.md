# Détourage local — passer de isnet_quint8 à isnet_fp16

Date : 2026-07-23

## Contexte et problème

Le détourage local (`@imgly/background-removal`) utilise aujourd'hui le modèle
`isnet_quint8` (quantifié int8), le plus léger et le moins précis des trois
variantes proposées par la librairie. Ce choix avait été fait pour la
taille/vitesse, remove.bg étant alors la voie principale.

Une tentative précédente de bascule vers `isnet_fp16` (commit `549cd1d`,
2026-07-22) avait été annulée le jour même (commit `448b2f6`) suite à un échec
total du détourage local en production, sous l'hypothèse d'un problème
mémoire/ressource sur l'appareil de l'utilisateur — hypothèse jamais confirmée
(« pending memory-failure confirmation »).

Cette session a identifié et corrigé, séparément, deux lacunes de Content-
Security-Policy (`connect-src` sans `blob:`, `script-src` sans
`'unsafe-eval'`) qui faisaient échouer **tout** détourage local, quel que soit
le modèle utilisé, avec exactement la signature d'erreur observée lors de la
tentative `isnet_fp16` (« no available backend found », import de module
échoué). Un test de reproduction direct (WebKit, modèle `isnet_fp16`
auto-hébergé de la même façon que `isnet_quint8`, CSP corrigée) confirme que
`isnet_fp16` fonctionne désormais correctement de bout en bout. L'hypothèse
« problème mémoire » de juillet dernier était très probablement une
identification erronée du même bug CSP.

## Objectifs

- Améliorer la qualité du détourage local (bords plus nets, moins
  d'artefacts) sans dépendance à un service payant ni perte du
  fonctionnement hors-ligne.
- Utiliser `isnet_fp16`, le modèle par défaut documenté de la librairie —
  meilleur compromis qualité/taille que le modèle complet `isnet` (84 Mo
  contre 168 Mo, pour une qualité intermédiaire entre les deux).

## Non-objectifs

- Pas de passage au modèle complet `isnet` (168 Mo, deux fois plus lourd que
  `isnet_fp16`, gain de qualité non mesuré face au coût de données mobile).
- Pas de changement du device d'exécution (`device: 'cpu'`, inchangé) ni de
  l'orchestration remove.bg → local → compression (inchangée).
- Pas de nouveau post-traitement d'image (matting, feathering) — ce chantier
  se limite au changement de modèle ; une amélioration de post-traitement
  reste une piste séparée si la qualité de `isnet_fp16` s'avère encore
  insuffisante après coup.

## Architecture

Deux changements, tous deux déjà validés manuellement par un test de bout en
bout (WebKit + CSP réelle + auto-hébergement) avant ce document :

1. **Vendoring** : ajouter les 22 fragments du modèle `isnet_fp16` (84,1 Mo,
   téléchargés depuis `https://staticimgly.com/@imgly/background-removal-
   data/1.7.0/dist/`, noms de fichiers = leur hash de contenu, format
   identique aux fragments `isnet_quint8` déjà vendorisés) sous
   `public/bg-removal/`, et étendre `public/bg-removal/resources.json` avec
   l'entrée `/models/isnet_fp16` correspondante (même format que l'entrée
   `/models/isnet_quint8` existante). Les fragments WASM/mjs déjà vendorisés
   sont partagés entre les deux modèles et n'ont pas besoin d'être dupliqués.
2. **Changement de modèle** : dans `src/lib/photo-cutout.ts`,
   `removeBackgroundLocally` passe `model: 'isnet_quint8'` à
   `model: 'isnet_fp16'`. Aucun autre paramètre ne change (`device: 'cpu'`,
   `output`, `publicPath` restent identiques).

Le fragment `isnet_quint8` existant n'est pas supprimé dans ce chantier (voir
Non-objectifs implicite : suppression différée, voir section Composants
touchés) — au minimum le changement de modèle doit être vérifié en
conditions réelles avant de retirer l'ancien modèle du dépôt.

## Composants touchés

- `public/bg-removal/` : + 22 nouveaux fichiers (fragments `isnet_fp16`,
  84,1 Mo au total), noms = hash de contenu (voir liste exacte dans le
  manifeste CDN au moment de l'implémentation).
- `public/bg-removal/resources.json` : + entrée `/models/isnet_fp16`.
- `src/lib/photo-cutout.ts` (`removeBackgroundLocally`) : `model:
  'isnet_quint8'` → `model: 'isnet_fp16'`.
- `dist/` (générée au build, pas de changement manuel) reflète automatiquement
  les nouveaux fichiers de `public/`.

Décision explicitement différée à une fois la bascule confirmée stable en
production : suppression des fragments `isnet_quint8` désormais inutilisés
(42,3 Mo) pour ne pas alourdir le dépôt/le déploiement avec deux modèles en
parallèle indéfiniment. Ne pas les supprimer dans ce chantier.

## Flux de données

Inchangé — seul le nom du modèle demandé à `removeBackground` change :

```
removeBackgroundLocally(file)
  → @imgly/background-removal removeBackground(file, { model: 'isnet_fp16', device: 'cpu', publicPath: '.../bg-removal/', ... })
  → ImageBitmap (comme aujourd'hui)
  → composeProductPhoto (inchangé, y compris removeDetachedFragments)
```

## Gestion d'erreurs

Inchangée : le repli existant (remove.bg → local → compression simple si le
local échoue aussi) reste identique. `isnet_fp16` étant plus lourd, un échec
de type mémoire réel (plutôt que le bug CSP déjà corrigé) resterait couvert
par ce repli existant — pas de nouveau cas à gérer.

## Tests

Aucun test unitaire nouveau : ce chantier ne change qu'une chaîne de
configuration (`model: 'isnet_fp16'`) déjà couverte structurellement par les
tests existants de `photo-cutout.ts` qui ne dépendent pas du modèle utilisé.

Vérification manuelle obligatoire avant de considérer ce chantier terminé :
- `npm run build` réussit.
- Ajout réel d'une photo dans l'app (via `npm run dev` ou build déployé),
  confirmant un détourage visuellement au moins aussi bon qu'avant, sans
  régression de temps de traitement perçu comme rédhibitoire.
- Vérifier que le Service Worker met bien en cache les nouveaux fragments
  après un premier chargement (pas de re-téléchargement des 84 Mo à chaque
  photo).
