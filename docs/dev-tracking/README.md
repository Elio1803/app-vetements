# AI Project Manager — Le Dressing

Système de suivi de développement du projet. Source de vérité sur l'état du projet : état général, tâches, bugs, fonctionnalités, historique des modifications.

## Fichiers

- `tracking.json` — source de vérité, toutes les données (`projectState`, `tasks`, `bugs`, `features`, `changelog`).
- `template.html` — gabarit HTML/CSS/JS du dashboard, avec le placeholder `/*__TRACKING_DATA__*/`.
- `build.mjs` — script Node qui valide `tracking.json` puis l'injecte dans `template.html` pour produire `dashboard.html`.
- `dashboard.html` — fragment HTML généré, publié tel quel comme Artifact Claude (conservé dans le repo pour diff/historique git).

## Régénérer le dashboard

```bash
node docs/dev-tracking/build.mjs
```

Le script s'arrête avec une erreur explicite si `tracking.json` est invalide (id dupliqué, statut inconnu, clé manquante) — jamais de dashboard généré depuis des données cassées.

Puis republier `docs/dev-tracking/dashboard.html` via l'outil Artifact, sur la même URL que la publication précédente (pour garder un lien stable).

## Schéma de `tracking.json`

### `projectState`
`projectName`, `description`, `mainObjective`, `currentPhase`, `progress` (0-100, estimation), `lastUpdated`, `currentPriority`, `priorityReason`, `nextAction`.

### `tasks[]`
```json
{ "id": "kebab-case-id", "title": "", "description": "", "status": "todo|in_progress|completed|blocked", "priority": "critical|high|medium|low", "category": "bug|feature|tech-debt|content", "createdAt": "YYYY-MM-DD", "updatedAt": "YYYY-MM-DD", "completedAt": "YYYY-MM-DD ou null" }
```

### `bugs[]`
```json
{ "id": "bug-NNN", "title": "", "description": "", "severity": "critical|high|medium|low", "status": "open|investigating|fixed|ignored", "createdAt": "YYYY-MM-DD", "solution": "string ou null" }
```

### `features[]`
```json
{ "id": "kebab-case-id", "name": "", "description": "", "status": "planned|in_progress|completed|deprecated", "priority": "critical|high|medium|low", "progress": 0, "relatedTasks": ["task-id"], "files": ["chemins/relatifs"], "createdAt": "YYYY-MM-DD", "updatedAt": "YYYY-MM-DD" }
```

### `changelog[]`
```json
{ "id": "chg-NNN", "date": "YYYY-MM-DD", "title": "", "description": "", "filesModified": ["chemins/relatifs"], "feature": "id de feature ou null", "result": "completed|partial", "remainingIssues": ["string"] }
```
`type` (hérité de l'ancien schéma, conservé) doit être l'une de : `nouvelle_fonctionnalite`, `amelioration`, `correction_bug`, `refactorisation`, `modification_visuelle`, `modification_technique`.

## Workflow à appliquer à chaque modification du projet

1. Comprendre la demande, analyser le code concerné, identifier les fichiers impactés.
2. Réaliser la modification et la tester.
3. Vérifier l'absence de régression sur les fonctionnalités existantes.
4. Mettre à jour `tracking.json` (tâche/bug/feature concernée, nouvelle entrée `changelog`, `projectState`).
5. Régénérer `dashboard.html` (`node docs/dev-tracking/build.mjs`) et republier l'Artifact.
6. Fournir un résumé de ce qui a été fait, avec le lien vers l'Artifact mis à jour.

Ne pas enregistrer chaque petite modification inutile dans `changelog` — uniquement les changements ayant un impact réel sur le projet.

## Règles d'analyse et de briefing

Voir la section "AI Project Manager" de `CLAUDE.md` (racine du projet) pour l'ordre de priorisation et le format de réponse attendu quand l'utilisateur demande "analyse mon projet" ou "fais-moi le briefing de mon application".
