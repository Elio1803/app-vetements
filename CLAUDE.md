# Le Dressing — Contexte projet

## Stack
- Frontend: React + TypeScript + Vite
- Styling: Tailwind CSS
- Animations: Framer Motion
- Backend/DB: Supabase (auth, storage, Edge Functions)
- IA: Anthropic API (analyse des vêtements, suggestions de tenues), fal-ai/fashn/tryon (essayage virtuel/compose-outfit)
- Détourage photo: remove.bg (prioritaire) avec repli sur un modèle local `@imgly/background-removal` (isnet_fp16) si indisponible
- Type: PWA (Progressive Web App), installable iPhone/Android

## Structure du projet
- /src/components — composants UI réutilisables
- /src/lib — clients Supabase, helpers métier (wardrobe, outfit-engine, photo-cutout, etc.)
- /src/hooks — hooks custom React
- /src/types — types TypeScript partagés
- /supabase/functions — Edge Functions Deno (analyze-clothing, generate-outfits, compose-outfit, remove-background, sync-clothing-item, etc.)
- /supabase/migrations — schéma et migrations SQL

Pas de dossier `/src/pages` : l'app est une single-page (tout passe par `App.tsx`), pas de routing par pages.

## Conventions
- Composants en PascalCase, un composant par fichier
- Hooks custom préfixés `use`
- Pas de `any` en TypeScript, typer strictement les réponses Supabase
- Animations Framer Motion centralisées dans /src/lib/animations.ts si réutilisées

## Fonctionnalités clés
- Gestion de garde-robe (ajout/catégorisation de vêtements, détourage photo)
- Analyse IA des vêtements (nom, couleur) via Anthropic
- Suggestions de tenues via IA (Anthropic API)
- Essayage virtuel / composition visuelle (fal-ai/fashn/tryon)
- Auth + stockage utilisateur via Supabase

## Notes pour Claude Code
- Toujours vérifier les types Supabase générés avant de modifier les requêtes DB
- Ne pas casser les animations existantes lors de refactors UI
- Privilégier des commits atomiques et clairs
- Les Edge Functions Supabase ne se déploient PAS automatiquement au push GitHub (le workflow CI ne publie que le frontend sur GitHub Pages) — déploiement manuel requis : `supabase functions deploy <nom-fonction>`

## AI Project Manager

Le projet dispose d'un système de suivi structuré dans `docs/dev-tracking/`
(`tracking.json` = source de vérité : `projectState`, `tasks`, `bugs`,
`features`, `changelog`). Voir `docs/dev-tracking/README.md` pour le schéma
complet et `docs/superpowers/specs/2026-07-24-ai-project-manager-design.md`
pour le contexte de conception.

### Ordre de priorisation (toujours dans cet ordre)

1. Bugs critiques.
2. Problèmes de sécurité.
3. Problèmes empêchant l'usage principal de l'application.
4. Bugs importants.
5. Fonctionnalités nécessaires au fonctionnement du produit.
6. Améliorations de l'expérience utilisateur.
7. Nouvelles fonctionnalités.

Ne jamais proposer de nouvelle fonctionnalité tant que des problèmes plus
prioritaires existent dans `tracking.json`.

### Quand l'utilisateur demande "analyse mon projet"

1. Lire `docs/dev-tracking/tracking.json` en entier.
2. Lire le `git log` récent (depuis la dernière `lastUpdated` de
   `projectState`) et les specs/plans non implémentés dans
   `docs/superpowers/`.
3. Identifier les problèmes (bugs `open`/`investigating`) et les tâches
   `blocked`.
4. Appliquer l'ordre de priorisation ci-dessus pour déterminer la priorité
   principale.
5. Répondre avec : état du projet, résumé, changements récents, problèmes
   détectés, priorité principale + pourquoi, prochaine action,
   recommandations.
6. Mettre à jour `projectState` (`currentPriority`, `priorityReason`,
   `nextAction`, `progress`, `lastUpdated`) dans `tracking.json` en
   conséquence, régénérer `dashboard.html` et republier l'Artifact.

### Quand l'utilisateur demande "fais-moi le briefing de mon application"

Même lecture que ci-dessus, réponse formatée en briefing : état du projet
(progression, phase, objectif), ce qui a été fait (derniers `changelog`),
problèmes détectés, priorité du jour + pourquoi, prochaine action, vision
globale.

### Historique automatique

Après toute modification à impact réel (nouvelle fonctionnalité, bug
corrigé, changement de schéma DB, refonte notable) — pas les détails
mineurs — ajouter une entrée dans `changelog`, mettre à jour la
tâche/bug/feature concernée, ajuster `projectState.progress` et
`lastUpdated`, régénérer `dashboard.html`
(`node docs/dev-tracking/build.mjs`) et republier l'Artifact sur le même
lien.

### Automatisation (Phase B)

- **Recap à l'ouverture de session** : un hook `SessionStart`
  (`.claude/settings.json`, script `docs/dev-tracking/session-recap.mjs`)
  affiche automatiquement l'état du projet (priorité du jour, prochaine
  action, bugs ouverts, branches `agent/*` en attente de relecture) au
  début de chaque session Claude Code sur ce repo.
- **Agent planifié** : une routine cloud tourne 3x/jour (8h/13h/20h heure
  de Paris) et avance de façon autonome sur l'item le plus prioritaire du
  backlog, sur une branche dédiée `agent/<slug>` — jamais de commit ou de
  merge direct sur `main`. Une notification push résume chaque passage.
  Garde-fou anti-accumulation : si une branche `agent/*` non mergée existe
  déjà, l'agent ne démarre pas de nouveau chantier tant qu'elle n'a pas été
  relue. Pour merger le travail de l'agent : relire la branche comme
  n'importe quelle autre, puis `git merge agent/<slug>` dans une session
  interactive.
