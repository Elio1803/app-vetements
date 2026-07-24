# Dashboard de suivi du développement — Le Dressing

Ce dossier contient le système de suivi du développement de l'application. Il sert de source de vérité sur l'état du projet : fonctionnalités, bugs corrigés, historique des modifications.

## Fichiers

- `tracking.json` — source de vérité, toutes les données (fonctionnalités, bugs, historique).
- `template.html` — gabarit HTML/CSS/JS du dashboard, avec le placeholder `/*__TRACKING_DATA__*/`.
- `build.mjs` — script Node qui injecte `tracking.json` dans `template.html` pour produire `dashboard.html`.
- `dashboard.html` — fragment HTML généré, publié tel quel comme Artifact (conservé dans le repo pour diff/historique git).

## Régénérer le dashboard

```bash
node docs/dev-tracking/build.mjs
```

Puis republier `docs/dev-tracking/dashboard.html` via l'outil Artifact, sur la même URL que la publication précédente (pour garder un lien stable).

## Ajouter une fonctionnalité

Ajouter un objet dans le tableau `features` de `tracking.json` :

```json
{
  "id": "identifiant-kebab-case",
  "name": "Nom affiché",
  "description": "Description courte",
  "status": "a_faire",
  "createdAt": "YYYY-MM-DD",
  "updatedAt": "YYYY-MM-DD",
  "files": ["chemins/relatifs/concernés"],
  "notes": ""
}
```

`status` doit être l'une de : `termine`, `en_cours`, `a_faire`, `bloque`.

## Changer le statut d'une fonctionnalité

Modifier le champ `status` et `updatedAt` de l'entrée correspondante dans `features`.

## Enregistrer une modification (historique)

Ajouter un objet dans le tableau `history` de `tracking.json` :

```json
{
  "date": "YYYY-MM-DD",
  "title": "Titre de la modification",
  "type": "amelioration",
  "description": "Description détaillée de ce qui a été fait",
  "files": ["chemins/relatifs/modifiés"],
  "status": "termine"
}
```

`type` doit être l'une de : `nouvelle_fonctionnalite`, `amelioration`, `correction_bug`, `refactorisation`, `modification_visuelle`, `modification_technique`.

Penser à incrémenter `meta.totalModifications` et mettre à jour `meta.lastUpdated` dans `tracking.json`.

## Enregistrer un bug corrigé

Ajouter un objet dans le tableau `bugs` de `tracking.json` :

```json
{ "id": "bug-NNN", "title": "Titre du bug", "fixedAt": "YYYY-MM-DD", "relatedFeature": "id-de-feature-ou-null" }
```

## Workflow à appliquer à chaque modification du projet

1. Comprendre la demande, analyser le code concerné, identifier les fichiers impactés.
2. Réaliser la modification et la tester.
3. Vérifier l'absence de régression sur les fonctionnalités existantes.
4. Mettre à jour `tracking.json` (statut de fonctionnalité, entrée d'historique, `meta`).
5. Régénérer `dashboard.html` (`node docs/dev-tracking/build.mjs`) et republier l'Artifact.
6. Fournir un résumé de ce qui a été fait, avec le lien vers l'Artifact mis à jour.
