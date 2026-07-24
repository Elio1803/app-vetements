# AI Project Manager — suivi de projet augmenté

Date : 2026-07-24

## Contexte et objectif

Le projet dispose déjà d'une ébauche de suivi de développement construite le
2026-07-21 sur la branche `dev-tracking-dashboard` (jamais mergée dans
`main`, qui a depuis avancé de plusieurs dizaines de commits) :
`docs/dev-tracking/tracking.json` (features + historique), un gabarit HTML
(`template.html`) et un script de génération (`build.mjs`) qui produisent
`dashboard.html`, republié en Artifact Claude. Cette base couvre 23
fonctionnalités inventoriées et un historique simple, mais n'a ni tâches, ni
bugs structurés, ni priorité du jour, ni règle d'agent.

L'utilisateur veut un système plus complet : un vrai copilote de suivi qui
répond à "analyse mon projet" / "fais-moi le briefing", gère tâches et bugs
avec statuts/priorités, et détermine une priorité du jour selon un ordre de
priorisation fixe. Décisions prises pendant le brainstorming :

- **Portée : outil dev interne**, pas une fonctionnalité livrée aux
  utilisateurs de l'app. Pas de nouvelle route React, pas de nouvelle table
  Supabase, pas de clé API exposée en runtime.
- **Consultation : Artifact Claude republié** sur un lien stable (comme
  l'existant), plus le fichier `dashboard.html` versionné dans le repo.
- **Déclenchement : langage naturel**, pas de slash command dédiée. Quand
  l'utilisateur demande "analyse mon projet" ou "fais-moi le briefing",
  Claude Code applique les règles documentées dans `CLAUDE.md` — pas
  d'appel IA runtime depuis l'app, c'est Claude Code qui joue le rôle de
  l'agent au moment où la question est posée.
- **Décision ajoutée en cours de brainstorming** : l'utilisateur veut aussi
  (a) un recap automatique à l'ouverture d'une session Claude Code sur ce
  projet, et (b) un agent planifié qui avance de façon autonome sur le
  backlog 3 fois par jour (matin/midi/soir), sur une branche dédiée à
  valider (jamais commit direct sur `main`), avec notification push à
  chaque passage. "Pas d'IA runtime" garde son sens initial : pas de
  fonctionnalité IA exposée aux utilisateurs de l'app via une route ou une
  Edge Function. L'automatisation ci-dessous est un agent Claude Code
  planifié (outil de dev), pas une fonctionnalité de l'app.

## Architecture

### 1. Source de vérité — `docs/dev-tracking/tracking.json` (schéma étendu)

Le fichier existant (`features` + `history`) est repris et fusionné avec le
schéma demandé :

```json
{
  "projectState": {
    "projectName": "Le Dressing",
    "description": "PWA de gestion de dressing avec suggestions de tenues par IA",
    "mainObjective": "Application prête pour un lancement public (utilisateurs réels au-delà du cercle perso)",
    "currentPhase": "Development",
    "progress": 0,
    "lastUpdated": "YYYY-MM-DD",
    "currentPriority": "",
    "nextAction": ""
  },
  "tasks": [
    {
      "id": "kebab-case-id",
      "title": "string",
      "description": "string",
      "status": "todo | in_progress | completed | blocked",
      "priority": "critical | high | medium | low",
      "category": "bug | feature | tech-debt | content",
      "createdAt": "YYYY-MM-DD",
      "updatedAt": "YYYY-MM-DD",
      "completedAt": "YYYY-MM-DD | null"
    }
  ],
  "bugs": [
    {
      "id": "bug-NNN",
      "title": "string",
      "description": "string",
      "severity": "critical | high | medium | low",
      "status": "open | investigating | fixed | ignored",
      "createdAt": "YYYY-MM-DD",
      "solution": "string | null"
    }
  ],
  "features": [
    {
      "id": "kebab-case-id",
      "name": "string",
      "description": "string",
      "status": "planned | in_progress | completed | deprecated",
      "priority": "critical | high | medium | low",
      "progress": 0,
      "relatedTasks": ["task-id"],
      "files": ["chemins/relatifs"],
      "createdAt": "YYYY-MM-DD",
      "updatedAt": "YYYY-MM-DD"
    }
  ],
  "changelog": [
    {
      "id": "chg-NNN",
      "date": "YYYY-MM-DD",
      "title": "string",
      "description": "string",
      "filesModified": ["chemins/relatifs"],
      "feature": "id de feature ou null",
      "result": "completed | partial",
      "remainingIssues": ["string"]
    }
  ]
}
```

Changements par rapport à l'existant :
- `history` → `changelog`, entrées enrichies (`feature`, `result`,
  `remainingIssues` en plus de `filesModified`).
- `features` : ajout de `priority`, `progress`, `relatedTasks`,
  `createdAt`/`updatedAt` (remplace le champ `notes` libre). Les statuts
  `termine`/`en_cours`/`a_faire`/`bloque` migrent vers
  `completed`/`in_progress`/`planned`/`deprecated` (pas d'équivalent direct
  à `bloque` pour une feature — un blocage se modélise via une tâche
  `blocked` liée, pas via le statut de la feature elle-même).
- Nouveau : `projectState`, `tasks`, `bugs` structurés.

**Migration des données existantes :**
- Les 23 fonctionnalités déjà inventoriées (annexe de la spec du
  2026-07-21) migrent telles quelles avec le nouveau schéma de statut.
- Le chantier en cours (unification détourage photo) reste `in_progress`.
- Le backlog transmis le 2026-07-23 (mémoire `le-dressing-backlog`) est
  reclassé ligne par ligne en `tasks` ou `bugs` au moment de
  l'implémentation, en croisant chaque point avec le code actuel plutôt
  qu'en le recopiant tel quel (ex. "se connecter avec son compte Google" —
  déjà listé comme fonctionnalité `completed` dans l'inventaire du
  2026-07-21 : à vérifier dans le code avant de le rouvrir comme tâche
  plutôt que de dupliquer une fonctionnalité existante). Les points trop
  vagues pour être actionnables tels quels (ex. "fonctionnalité à ajouter
  en plus") ne sont pas migrés — ils resteront dans la mémoire backlog
  jusqu'à clarification.
- `progress` (`projectState` et par feature) est une estimation que Claude
  Code renseigne à chaque analyse, pas une valeur calculée par une formule
  fixe (ex. ratio de tâches terminées) — le jugement contextuel (gravité des
  bugs ouverts, ampleur du chantier en cours) prime sur un pourcentage
  mécanique.

### 2. Présentation — `template.html` / `build.mjs` (étendus, pas réécrits)

Le gabarit existant sait déjà rendre des cartes filtrables par statut avec
recherche, thème clair/sombre auto, et est injecté via le même mécanisme
(`/*__TRACKING_DATA__*/`). Sections ajoutées, dans le même style visuel :

- **Header** : nom du projet, phase actuelle, dernière mise à jour. Pas de
  bouton fonctionnel "Analyser mon projet" (pas de JS runtime possible sans
  backend) — un texte indique "Pour relancer une analyse, demande à Claude
  Code".
- **Carte progression** : barre globale (`projectState.progress`) + compteurs
  tâches par statut.
- **Priorité du jour** + **Pourquoi** + **Prochaine action** : lus depuis
  `projectState.currentPriority` / `nextAction`, avec le texte
  d'explication généré par Claude Code au moment de l'analyse (stocké dans
  `projectState`, pas de champ séparé nécessaire).
- **Problèmes actuels** : bugs `open`/`investigating`, triés par gravité,
  `critical`/`high` mis en avant visuellement.
- **Activité récente** : dernières entrées de `changelog` (remplace la
  section "historique" actuelle, même composant).
- **Tâches** : 4 colonnes par statut (todo / in_progress / completed /
  blocked), même mécanique de filtre/recherche que les features.

`build.mjs` ne change pas de logique (injection JSON dans le placeholder),
seul `template.html` grandit pour ces nouvelles sections.

### 3. Documentation — `docs/dev-tracking/README.md` (mise à jour)

Ajoute aux instructions existantes (ajouter une feature, changer un statut,
enregistrer une modification) : comment ajouter une tâche, comment ajouter
un bug, structure complète du schéma étendu.

### 4. Règles d'agent — nouvelle section dans `CLAUDE.md`

Section "AI Project Manager" ajoutée à `CLAUDE.md`, avec :

**Ordre de priorisation fixe** (recopié du besoin utilisateur) : bugs
critiques > problèmes de sécurité > blocages de l'usage principal > bugs
importants > features nécessaires au produit > améliorations UX >
nouvelles fonctionnalités. Ne jamais proposer de nouvelle fonctionnalité
tant que des problèmes plus prioritaires existent.

**Sur "analyse mon projet"** : lire `tracking.json` + `git log` récent +
les specs/plans non implémentés dans `docs/superpowers/`, identifier
problèmes et tâches bloquantes, appliquer l'ordre de priorisation,
répondre avec : état du projet, résumé, changements récents, problèmes
détectés, priorité principale + pourquoi, prochaine action,
recommandations. Mettre à jour `projectState` en conséquence.

**Sur "fais-moi le briefing de mon application"** : même lecture, formatée
en briefing (état du projet, ce qui a été fait, problèmes détectés,
priorité du jour + pourquoi, prochaine action, vision globale).

**Historique automatique** : après toute modification à impact réel
(nouvelle feature, bug corrigé, changement de schéma DB, refonte notable) —
pas les détails mineurs — ajouter une entrée `changelog`, mettre à jour la
tâche/bug/feature concernée, ajuster `projectState.progress`, régénérer
`dashboard.html` (`node docs/dev-tracking/build.mjs`) et republier
l'Artifact sur le même lien.

### 5. Recap automatique à l'ouverture de session

Un hook `SessionStart` (configuré dans `.claude/settings.json` du projet)
génère et injecte automatiquement, au début de chaque session Claude Code
sur ce repo, un recap court lu depuis `tracking.json` : phase actuelle,
progression, priorité du jour, prochaine action, et — s'il y a du travail
de l'agent planifié (section 6) en attente de relecture — le nom de la
branche à valider. `CLAUDE.md` documente que ce recap doit être présenté
à l'utilisateur comme premier message de la session, avant de traiter sa
demande.

### 6. Agent planifié — travail autonome sur le backlog

Un agent cloud planifié (routine cron, 3 passages par jour : matin, midi,
soir — horaires par défaut 8h/13h/20h heure locale, ajustables librement
lors de la création de la routine) exécute à chaque passage :

1. Lit `tracking.json`, applique l'ordre de priorisation (section 4) pour
   choisir la prochaine tâche/bug actionnable.
2. **Garde-fou anti-accumulation** : si une branche d'un passage précédent
   est encore en attente de relecture (non mergée), ne démarre pas un
   nouveau chantier — vérifie juste s'il reste du travail à finir dessus,
   sinon s'arrête et notifie que la relecture est le point bloquant.
3. Sinon, crée une branche dédiée (convention déjà utilisée dans ce repo :
   `worktree-<sujet>`), implémente la tâche en suivant les conventions du
   projet (specs/plans pour les chantiers non triviaux, TDD et vérification
   avant de considérer un travail terminé — mêmes règles que pour une
   session interactive).
4. Commit sur la branche dédiée — **jamais sur `main`**, aucun push vers
   `main`, aucun merge automatique.
5. Met à jour `tracking.json` (tâche concernée, `changelog`,
   `projectState`), régénère `dashboard.html`, republie l'Artifact.
6. Envoie une notification push résumant : ce qui a été fait, la branche
   créée, l'état (terminé / partiel / bloqué), et ce qu'il reste à valider.

Mis en place via une routine planifiée (cron) dédiée à ce projet — à créer
lors de l'implémentation.

## Sécurité

Aucune clé API n'est manipulée par ce système : `tracking.json` ne contient
que des métadonnées de suivi (titres, statuts, chemins de fichiers), pas de
secrets. Pas de nouvelle surface d'accès dans l'app (pas de route, pas de
table) donc pas de risque de faille d'accès côté utilisateurs finaux —
cohérent avec le choix "outil dev interne".

L'agent planifié (section 6) pousse des commits vers des branches distantes
dédiées (`worktree-*`) — c'est une action affectant un état partagé (le
remote git), normalement soumise à confirmation au cas par cas. Ce document,
une fois approuvé, sert d'autorisation durable pour ce cas précis et
seulement celui-ci : push vers une branche dédiée, jamais vers `main`,
jamais de merge automatique. Toute action hors de ce périmètre (merge,
force-push, modification de `main`) reste soumise à confirmation explicite
au moment où elle se présenterait.

## Hors périmètre

- Pas d'intégration dans l'app de production (pas de route `/dashboard`
  dans le code React) — inchangé par rapport à la spec du 2026-07-21.
- Pas de lecture live du JSON par l'Artifact, pas de bouton JS
  fonctionnel — republication manuelle à chaque mise à jour.
- Pas de backend/API dédié, pas de table Supabase, pas d'appel Anthropic
  runtime déclenché par l'app elle-même — l'IA "agent" est toujours
  Claude Code, soit en session interactive (analyse/briefing à la
  demande), soit via la routine planifiée (section 6), jamais une
  fonctionnalité exposée aux utilisateurs de l'app.
- Pas de merge de la branche `dev-tracking-dashboard` telle quelle (elle a
  divergé de `main` sur des commits non liés) — seuls les fichiers
  `docs/dev-tracking/*` en sont récupérés comme base de travail.
- Pas de merge automatique des branches produites par l'agent planifié —
  la relecture et le merge restent manuels.

## Plan de travail (résumé, détail dans le plan d'implémentation)

1. Étendre `tracking.json` (nouveau schéma, migration des données
   existantes + reclassement du backlog).
2. Étendre `template.html` (nouvelles sections) et vérifier `build.mjs`.
3. Mettre à jour `docs/dev-tracking/README.md`.
4. Ajouter la section "AI Project Manager" à `CLAUDE.md` (règles d'analyse/
   briefing + garde-fous de l'agent planifié).
5. Générer `dashboard.html` et publier l'Artifact.
6. Configurer le hook `SessionStart` (recap automatique) dans
   `.claude/settings.json`.
7. Créer la routine planifiée (cron, 3x/jour) pour l'agent autonome, avec
   notification push.
8. Vérifier : JSON valide, génération sans erreur, Artifact affiché
   correctement en clair/sombre, hook de session testé, aucune régression
   sur le reste de l'app (aucun fichier applicatif touché par les étapes
   1-6).

Ce travail se décompose naturellement en deux phases pour le plan
d'implémentation : **Phase A** (étapes 1-5, tracking system + dashboard,
risque faible, aucune automatisation) et **Phase B** (étapes 6-7,
automatisation — hook de session et routine planifiée, risque et
complexité plus élevés, dépend des skills `update-config` et `schedule`).
Phase A peut être livrée et utilisée seule si besoin, indépendamment de la
Phase B.
