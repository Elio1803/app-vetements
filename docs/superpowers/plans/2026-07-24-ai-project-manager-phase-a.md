# AI Project Manager — Phase A (tracking system + dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Le Dressing project a structured, git-versioned tracking system (project state, tasks, bugs, features, changelog) with a dashboard that reads it, plus documented rules for Claude Code to keep it updated and to answer "analyse mon projet" / "fais-moi le briefing" requests.

**Architecture:** A single JSON file (`docs/dev-tracking/tracking.json`) is the source of truth. A static HTML template (`docs/dev-tracking/template.html`) renders it client-side (vanilla JS, no build step, no framework) and is injected via `docs/dev-tracking/build.mjs` into `docs/dev-tracking/dashboard.html`, which gets published as a Claude Artifact. `CLAUDE.md` gets a new section documenting the agent behavior. No app code, no Supabase tables, no new routes are touched.

**Tech Stack:** Plain Node.js (`build.mjs`, no dependencies), vanilla HTML/CSS/JS (`template.html`), JSON (`tracking.json`), Markdown (`README.md`, `CLAUDE.md`).

## Global Constraints

- Source of truth: `docs/dev-tracking/tracking.json` — see spec `docs/superpowers/specs/2026-07-24-ai-project-manager-design.md` for the full schema rationale.
- No new file may touch `src/`, `supabase/`, or any application code — this is a dev-tooling-only change.
- No secrets, API keys, or user data in `tracking.json` — metadata only (titles, statuses, file paths, dates).
- Status/priority/severity enums are fixed per the spec: tasks use `todo|in_progress|completed|blocked` status and `critical|high|medium|low` priority; bugs use `open|investigating|fixed|ignored` status and `critical|high|medium|low` severity; features use `planned|in_progress|completed|deprecated` status.
- `build.mjs` must fail loudly (non-zero exit) if `tracking.json` is malformed or missing a required field — never generate a dashboard from invalid data silently.
- Every JSON id must be unique within its array (`tasks`, `bugs`, `features`, `changelog`).

---

### Task 1: Recover the abandoned dev-tracking baseline into `main`

The 2026-07-21 dashboard system was built on branch `dev-tracking-dashboard`, which diverged from `main` and was never merged. Its four files are the starting point here — recovered individually (not merged as a branch) since the branch is otherwise stale relative to `main`.

**Files:**
- Create: `docs/dev-tracking/tracking.json` (old schema, will be rewritten in Task 2)
- Create: `docs/dev-tracking/template.html` (old version, will be rewritten in Task 3)
- Create: `docs/dev-tracking/build.mjs`
- Create: `docs/dev-tracking/README.md` (old version, will be rewritten in Task 5)

**Interfaces:**
- Produces: the baseline files that Tasks 2-5 modify in place.

- [ ] **Step 1: Extract the four files from the unmerged branch**

```bash
cd "/Users/eliopainteaux/Desktop/Perso/Le Dressing Application/app-vetements"
mkdir -p docs/dev-tracking
git show dev-tracking-dashboard:docs/dev-tracking/tracking.json > docs/dev-tracking/tracking.json
git show dev-tracking-dashboard:docs/dev-tracking/template.html > docs/dev-tracking/template.html
git show dev-tracking-dashboard:docs/dev-tracking/build.mjs > docs/dev-tracking/build.mjs
git show dev-tracking-dashboard:docs/dev-tracking/README.md > docs/dev-tracking/README.md
```

- [ ] **Step 2: Verify the baseline builds**

Run: `node docs/dev-tracking/build.mjs`
Expected output: `dashboard.html généré : 24 fonctionnalités, 2 entrées d'historique, 0 bugs.`

- [ ] **Step 3: Commit the recovered baseline**

```bash
git add docs/dev-tracking/
git commit -m "Recover dev-tracking dashboard baseline from unmerged branch"
```

---

### Task 2: Rewrite `tracking.json` with the extended schema and real project data

**Files:**
- Modify: `docs/dev-tracking/tracking.json` (full rewrite)

**Interfaces:**
- Produces: `projectState`, `tasks[]`, `bugs[]`, `features[]`, `changelog[]` — the exact shape consumed by `template.html` in Task 3.

- [ ] **Step 1: Replace the file content**

Replace the entire contents of `docs/dev-tracking/tracking.json` with:

```json
{
  "projectState": {
    "projectName": "Le Dressing",
    "description": "PWA de gestion de dressing avec suggestions de tenues par IA (essayage virtuel, génération de tenues, détourage photo)",
    "mainObjective": "Application prête pour un lancement public au-delà du cercle perso",
    "currentPhase": "Development",
    "progress": 70,
    "lastUpdated": "2026-07-24",
    "currentPriority": "Corriger le bug critique d'inscription (bug-001)",
    "priorityReason": "Un nouvel utilisateur ne peut pas créer de compte : l'email d'inscription redirige vers une page d'erreur. C'est un blocage total de l'usage principal de l'app — rien d'autre (nouvelles fonctionnalités, polish UX) n'a de sens tant que ce point bloquant n'est pas résolu.",
    "nextAction": "Diagnostiquer pourquoi le lien de l'email d'inscription mène à une erreur (vérifier supabase/functions/send-welcome-email et le flux de confirmation d'email côté Supabase Auth), puis corriger."
  },
  "tasks": [
    { "id": "t-001", "title": "Merger la branche outfit-styling-coherence", "description": "Le prompt de generate-outfits a été renforcé pour la cohérence couleur/style sur la branche worktree-outfit-styling-coherence (1 commit, prêt : \"Strengthen generate-outfits prompt for color and style coherence\"). Relire, résoudre les éventuels conflits mineurs (chaînes de version dans App.tsx/index.html) et merger dans main.", "status": "todo", "priority": "high", "category": "tech-debt", "createdAt": "2026-07-24", "updatedAt": "2026-07-24", "completedAt": null },
    { "id": "t-002", "title": "Vérifier la connexion Google en conditions réelles", "description": "L'authentification Google OAuth est déjà listée comme terminée (feature auth-supabase), mais le backlog utilisateur redemande de vérifier ce point en lien avec une réflexion SaaS/tarification. Confirmer que ça fonctionne réellement en production avant de considérer le point clos.", "status": "todo", "priority": "low", "category": "tech-debt", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-003", "title": "Revoir le mail de réinitialisation de mot de passe", "description": "Améliorer le contenu/la présentation de l'email de mot de passe oublié.", "status": "todo", "priority": "medium", "category": "feature", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-004", "title": "Créer une vidéo de démonstration de l'application", "description": "Vidéo montrant le fonctionnement de l'app pour les nouveaux utilisateurs.", "status": "todo", "priority": "low", "category": "content", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-005", "title": "Définir les différences entre l'offre gratuite et payante", "description": "Clarifier la grille de fonctionnalités gratuites vs payantes avant tout travail de mise en place d'un modèle payant.", "status": "todo", "priority": "medium", "category": "content", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-006", "title": "Retirer le zoom indésirable au défilement", "description": "Un effet de zoom se déclenche au défilement dans l'app et gêne l'expérience, à retirer.", "status": "todo", "priority": "medium", "category": "feature", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-007", "title": "Ajouter un choix de thème clair/sombre/système", "description": "Actuellement pas de sélecteur de thème manuel côté utilisateur de l'app (contrairement au dashboard dev-tracking qui s'adapte déjà au système).", "status": "todo", "priority": "medium", "category": "feature", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-008", "title": "Ajouter un effet de défilement à l'écran de connexion", "description": "Animation de défilement lors de la connexion avec identifiants.", "status": "todo", "priority": "low", "category": "feature", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-009", "title": "Adapter l'animation de démarrage au mode sombre/clair", "description": "Note backlog d'origine incomplète (phrase tronquée) — l'animation de démarrage/modification ne semble pas correctement adaptée au thème sombre/clair. À clarifier avec l'utilisateur avant implémentation.", "status": "todo", "priority": "low", "category": "tech-debt", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-010", "title": "Améliorer le rendu du détourage (fond blanc + cadrage)", "description": "Priorité explicite marquée COMMENCER par l'utilisateur : obtenir des tenues visuellement cohérentes et bien représentées entre fond blanc et cadrage. Une partie du travail de détourage a déjà été faite (unification du pipeline, upgrade isnet_fp16, suppression des fragments détachés — voir changelog) mais le rendu fond blanc/cadrage lui-même reste à améliorer.", "status": "todo", "priority": "high", "category": "feature", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-011", "title": "Ajouter un message de confirmation de création de compte", "description": "En plus de l'email de bienvenue déjà existant, afficher/envoyer une confirmation explicite que le compte a bien été créé.", "status": "todo", "priority": "medium", "category": "feature", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-012", "title": "Bloquer l'ajout au dressing sans photo avec message d'erreur", "description": "Si l'utilisateur clique sur \"ajouter à mon dressing\" sans avoir pris de photo, afficher un message d'erreur en rouge au lieu de laisser l'action silencieuse.", "status": "todo", "priority": "medium", "category": "feature", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-013", "title": "Nommer le profil par défaut \"Le Dressing\"", "description": "Demande utilisateur marquée COMMENCER, formulation ambiguë dans le backlog d'origine — à clarifier avec l'utilisateur (quel profil, quel contexte) avant implémentation.", "status": "todo", "priority": "high", "category": "feature", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-014", "title": "Remplacer/enrichir le chat d'aide par un vrai chatbot IA", "description": "Le chat d'aide actuel (feature help-chat) est un assistant à réponses pré-formatées, non-IA. Demande utilisateur marquée COMMENCER. Note importante : une tentative a déjà été faite et annulée (\"Add AI-powered help chat backed by Claude Haiku\" puis \"Revert...\" le 2026-07-21) — comprendre pourquoi avant de relancer ce chantier.", "status": "todo", "priority": "high", "category": "feature", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-015", "title": "Injecter la météo réelle dans le moteur de génération de tenues", "description": "La météo (Open-Meteo) est déjà récupérée et affichée (feature weather-suggestions, terminée) mais le backlog utilisateur (marqué COMMENCER) demande qu'elle soit réellement utilisée comme critère de génération. Vérifier dans src/lib/outfit-engine.ts et supabase/functions/generate-outfits si c'est déjà le cas ou si l'intégration reste superficielle.", "status": "todo", "priority": "high", "category": "feature", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-016", "title": "Clarifier les attentes sur l'historique des tenues portées", "description": "La feature outfit-history existe déjà et est terminée, mais le backlog utilisateur la redemande (marqué COMMENCER). Clarifier avec l'utilisateur ce qui manque par rapport à l'existant avant de traiter comme une nouvelle demande.", "status": "todo", "priority": "medium", "category": "feature", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-017", "title": "Suggestion \"à vendre\" pour les pièces jamais portées (lien Vinted)", "description": "Suggestion de revente pré-remplie sur Vinted pour les pièces jamais portées, relie ce projet à l'outil de photo produit de l'utilisateur.", "status": "todo", "priority": "medium", "category": "feature", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-018", "title": "Packing list / valise selon durée, destination et météo", "description": "Génération d'une liste de valise selon la durée du séjour, la destination et la météo.", "status": "todo", "priority": "low", "category": "feature", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-019", "title": "Export visuel de la tenue en PNG pour partage Instagram", "description": "Génération d'une image PNG de la tenue composée, pour partage sur les réseaux sociaux.", "status": "todo", "priority": "low", "category": "feature", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-020", "title": "Ajouter une gestion visible du hors-ligne / erreurs réseau à l'upload", "description": "Aucune gestion visible aujourd'hui du mode hors-ligne ou des erreurs réseau pendant l'upload d'un vêtement.", "status": "todo", "priority": "medium", "category": "tech-debt", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-021", "title": "Enrichir canGenerate (saison, occasion habillée)", "description": "La fonction canGenerate qui détermine si une génération de tenue est possible est trop basique : elle ne tient pas compte de la saison ni du caractère habillé de l'occasion.", "status": "todo", "priority": "medium", "category": "tech-debt", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-022", "title": "Découper App.tsx en hooks custom", "description": "App.tsx devient trop monolithique — à découper en hooks custom si de nouvelles fonctionnalités doivent y être ajoutées.", "status": "todo", "priority": "low", "category": "tech-debt", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null },
    { "id": "t-023", "title": "Étendre les tests vitest aux flux critiques (génération, upload)", "description": "Vitest est configuré mais peu utilisé sur les flux critiques (génération de tenue, upload de vêtement).", "status": "todo", "priority": "medium", "category": "tech-debt", "createdAt": "2026-07-23", "updatedAt": "2026-07-23", "completedAt": null }
  ],
  "bugs": [
    { "id": "bug-001", "title": "Erreur lors de l'inscription (email amenant sur une erreur)", "description": "Impossible de créer un compte : l'email d'inscription amène l'utilisateur sur une page d'erreur.", "severity": "critical", "status": "open", "createdAt": "2026-07-23", "solution": null },
    { "id": "bug-002", "title": "Photos de tenues locales introuvables entre appareils", "description": "Les photos de tenues enregistrées sur le téléphone sont introuvables sur le compte Mac. Persistance locale uniquement sur l'appli téléphone, perdue à la fermeture — nécessite une synchro en ligne pour retrouver le dressing partout.", "severity": "high", "status": "open", "createdAt": "2026-07-23", "solution": null },
    { "id": "bug-003", "title": "Défilement intempestif pendant l'utilisation du chat d'aide", "description": "La page monte/descend de façon intempestive pendant l'utilisation du chat bot d'aide.", "severity": "low", "status": "open", "createdAt": "2026-07-23", "solution": null },
    { "id": "bug-004", "title": "Synchronisation cloud qui bug", "description": "Rapport utilisateur générique de bugs de synchronisation.", "severity": "high", "status": "investigating", "createdAt": "2026-07-23", "solution": "Deux correctifs liés à la synchro ont été livrés le 2026-07-24 (réapparition d'articles supprimés/édités après refresh ; CSP bloquant la synchro de nouveaux articles) — à confirmer si ça couvre entièrement le problème remonté par l'utilisateur." },
    { "id": "bug-005", "title": "Contraste insuffisant, peu lisible", "description": "Le contraste actuel de l'interface est trop faible, ce qui nuit à la lisibilité.", "severity": "medium", "status": "open", "createdAt": "2026-07-23", "solution": null },
    { "id": "bug-006", "title": "Détourage de mauvaise qualité / pas de vue d'ensemble de la tenue", "description": "Le détourage des vêtements est de mauvaise qualité et ne permet pas d'avoir une vue d'ensemble cohérente d'une tenue.", "severity": "medium", "status": "investigating", "createdAt": "2026-07-23", "solution": "Partiellement traité le 2026-07-23 (upgrade isnet_fp16, suppression des fragments détachés) — le rendu fond blanc/cadrage reste à améliorer, voir tâche t-010." }
  ],
  "features": [
    { "id": "auth-supabase", "name": "Authentification Supabase", "description": "Connexion email/mot de passe, OAuth Google, réinitialisation de mot de passe, confirmation d'email.", "status": "completed", "priority": "high", "progress": 100, "relatedTasks": ["t-002", "t-003"], "files": ["src/components/AuthScreens.tsx", "src/App.tsx"], "createdAt": "2026-07-11", "updatedAt": "2026-07-11" },
    { "id": "auth-local", "name": "Authentification locale/offline", "description": "Système de compte device-local avec mot de passe haché, utilisé quand Supabase n'est pas configuré.", "status": "completed", "priority": "medium", "progress": 100, "relatedTasks": [], "files": ["src/lib/local-auth.ts"], "createdAt": "2026-07-11", "updatedAt": "2026-07-11" },
    { "id": "wardrobe-view", "name": "Vue dressing", "description": "Grille des vêtements groupés par catégorie, recherche, filtre par catégorie, tri (rotation/récent/plus porté).", "status": "completed", "priority": "high", "progress": 100, "relatedTasks": ["t-006"], "files": ["src/App.tsx", "src/lib/wardrobe-utils.ts"], "createdAt": "2026-07-11", "updatedAt": "2026-07-11" },
    { "id": "add-clothing-item", "name": "Ajout de vêtement", "description": "Upload caméra/galerie, drag-and-drop, détourage (remove.bg puis fallback local ISNet fp16), analyse IA (couleur/nom), file d'attente offline.", "status": "completed", "priority": "high", "progress": 100, "relatedTasks": ["t-010", "t-012", "t-020"], "files": ["src/App.tsx", "src/lib/photo-cutout.ts", "supabase/functions/remove-background", "supabase/functions/analyze-clothing"], "createdAt": "2026-07-11", "updatedAt": "2026-07-23" },
    { "id": "edit-delete-item", "name": "Édition / suppression de vêtement", "description": "Feuille d'édition inline (nom/catégorie), suppression avec nettoyage du storage.", "status": "completed", "priority": "medium", "progress": 100, "relatedTasks": [], "files": ["src/App.tsx"], "createdAt": "2026-07-11", "updatedAt": "2026-07-24" },
    { "id": "item-detail", "name": "Vue détail d'un vêtement", "description": "Photo, statistiques de port, actions d'édition/suppression.", "status": "completed", "priority": "medium", "progress": 100, "relatedTasks": [], "files": ["src/App.tsx"], "createdAt": "2026-07-11", "updatedAt": "2026-07-11" },
    { "id": "outfit-generation", "name": "Génération de tenues", "description": "Suggestions de tenues assistées par IA ou par moteur heuristique local, selon occasion/météo/note/rotation du dressing.", "status": "completed", "priority": "high", "progress": 100, "relatedTasks": ["t-001", "t-015", "t-021"], "files": ["src/App.tsx", "src/lib/outfit-engine.ts", "supabase/functions/generate-outfits"], "createdAt": "2026-07-11", "updatedAt": "2026-07-24" },
    { "id": "outfit-composition", "name": "Composition visuelle de tenue", "description": "Tableau visuel de la tenue sélectionnée, composition d'image IA de la tenue (FAL).", "status": "completed", "priority": "medium", "progress": 100, "relatedTasks": [], "files": ["src/components/OutfitBoard.tsx", "supabase/functions/compose-outfit"], "createdAt": "2026-07-11", "updatedAt": "2026-07-11" },
    { "id": "mark-outfit-worn", "name": "Marquage tenue portée", "description": "Action atomique de mise à jour du compteur de port et de la date de dernier port.", "status": "completed", "priority": "medium", "progress": 100, "relatedTasks": [], "files": ["src/App.tsx", "src/lib/wardrobe-api.ts"], "createdAt": "2026-07-11", "updatedAt": "2026-07-11" },
    { "id": "outfit-history", "name": "Historique des tenues portées", "description": "Historique calendaire des tenues portées.", "status": "completed", "priority": "medium", "progress": 100, "relatedTasks": ["t-016"], "files": ["src/components/OutfitHistory.tsx"], "createdAt": "2026-07-11", "updatedAt": "2026-07-11" },
    { "id": "emergency-look", "name": "Look d'urgence", "description": "Génération rapide d'une tenue simple en un clic (\"je n'ai rien à me mettre\").", "status": "completed", "priority": "medium", "progress": 100, "relatedTasks": [], "files": ["src/App.tsx"], "createdAt": "2026-07-11", "updatedAt": "2026-07-21" },
    { "id": "rotation-insights", "name": "Insights de rotation du dressing", "description": "Panneau de redécouverte, score de rotation, statistiques (jamais porté, non porté depuis 30j, plus porté).", "status": "completed", "priority": "medium", "progress": 100, "relatedTasks": [], "files": ["src/App.tsx", "src/lib/wardrobe-utils.ts", "src/components/AnimatedCounter.tsx"], "createdAt": "2026-07-11", "updatedAt": "2026-07-11" },
    { "id": "weather-suggestions", "name": "Suggestions météo", "description": "Récupération de la météo actuelle (Open-Meteo) prise en compte dans la génération/disponibilité des tenues.", "status": "completed", "priority": "high", "progress": 100, "relatedTasks": ["t-015"], "files": ["src/hooks/useCurrentWeather.ts", "src/lib/weather.ts"], "createdAt": "2026-07-11", "updatedAt": "2026-07-11" },
    { "id": "profile", "name": "Profil utilisateur", "description": "Gestion du nom affiché, indicateur du type de compte (synchronisé vs local), déconnexion.", "status": "completed", "priority": "medium", "progress": 100, "relatedTasks": ["t-013"], "files": ["src/App.tsx", "src/lib/profile.ts"], "createdAt": "2026-07-11", "updatedAt": "2026-07-11" },
    { "id": "welcome-email", "name": "Email de bienvenue", "description": "Envoi d'un email transactionnel de bienvenue (Resend) après la première connexion.", "status": "completed", "priority": "medium", "progress": 100, "relatedTasks": ["t-011"], "files": ["supabase/functions/send-welcome-email"], "createdAt": "2026-07-12", "updatedAt": "2026-07-12" },
    { "id": "help-chat", "name": "Chat d'aide", "description": "Assistant de type FAQ à réponses pré-formatées (non-IA) guidant la navigation dans l'app.", "status": "completed", "priority": "medium", "progress": 100, "relatedTasks": ["t-014"], "files": ["src/components/HelpChat.tsx", "src/lib/help-assistant.ts"], "createdAt": "2026-07-11", "updatedAt": "2026-07-21" },
    { "id": "offline-pwa", "name": "Support offline / PWA", "description": "Service worker, installation PWA, file d'attente de synchronisation offline, bannière en ligne/hors ligne.", "status": "completed", "priority": "high", "progress": 100, "relatedTasks": ["t-020"], "files": ["public/sw.js", "public/manifest.webmanifest", "src/hooks/useAppSystem.ts"], "createdAt": "2026-07-11", "updatedAt": "2026-07-23" },
    { "id": "cloud-sync", "name": "Synchronisation cloud", "description": "Synchronisation bidirectionnelle entre le dressing local et Supabase, rafraîchissement périodique, synchronisation manuelle, récupération de photos locales entre appareils.", "status": "completed", "priority": "high", "progress": 100, "relatedTasks": ["bug-002", "bug-004"], "files": ["src/App.tsx", "src/lib/supabase-client.ts", "supabase/functions/sync-clothing-item", "supabase/functions/list-clothing-items"], "createdAt": "2026-07-11", "updatedAt": "2026-07-24" },
    { "id": "demo-mode", "name": "Mode démo", "description": "Données de dressing démo pour la première utilisation ou sans backend configuré.", "status": "completed", "priority": "low", "progress": 100, "relatedTasks": [], "files": ["src/lib/demo-data.ts"], "createdAt": "2026-07-11", "updatedAt": "2026-07-11" },
    { "id": "share-outfit", "name": "Partage de tenue", "description": "Partage natif ou copie presse-papiers d'une tenue générée.", "status": "completed", "priority": "low", "progress": 100, "relatedTasks": ["t-019"], "files": ["src/App.tsx"], "createdAt": "2026-07-11", "updatedAt": "2026-07-11" },
    { "id": "error-boundary", "name": "Error boundary", "description": "Garde-fou applicatif en cas de crash, avec interface de rechargement.", "status": "completed", "priority": "medium", "progress": 100, "relatedTasks": [], "files": ["src/components/AppErrorBoundary.tsx"], "createdAt": "2026-07-11", "updatedAt": "2026-07-11" },
    { "id": "loading-animations", "name": "Écrans de chargement / animations", "description": "Écran de chargement de marque, cartes squelettes, compteurs animés, transitions.", "status": "completed", "priority": "low", "progress": 100, "relatedTasks": ["t-008", "t-009"], "files": ["src/components/LoadingScreen.tsx", "src/components/SkeletonCard.tsx", "src/lib/animations.ts"], "createdAt": "2026-07-11", "updatedAt": "2026-07-11" },
    { "id": "icon-generation", "name": "Génération d'icônes", "description": "Script Python générant le jeu d'icônes de l'app (192/512/apple-touch) à partir de l'artwork source.", "status": "completed", "priority": "low", "progress": 100, "relatedTasks": [], "files": ["scripts/generate-icons.py"], "createdAt": "2026-07-11", "updatedAt": "2026-07-11" },
    { "id": "photo-detourage-unification", "name": "Unification des pipelines de détourage photo", "description": "Unification des deux pipelines de détourage divergents (remove.bg côté serveur, ISNet local côté client) dans un module partagé photo-cutout.ts, correction de l'incohérence de limite de taille, amélioration des artefacts de découpe (upgrade isnet_fp16, suppression des fragments détachés).", "status": "completed", "priority": "high", "progress": 100, "relatedTasks": ["t-010"], "files": ["src/lib/photo-cutout.ts", "supabase/functions/remove-background/index.ts"], "createdAt": "2026-07-21", "updatedAt": "2026-07-23" }
  ],
  "changelog": [
    { "id": "chg-001", "date": "2026-07-21", "title": "Unification des pipelines de détourage photo (remove.bg + modèle local)", "type": "modification_technique", "description": "Fusion des deux pipelines de détourage divergents derrière un module partagé photo-cutout.ts : détection de bornes et adoucissement des bords communs, arrêt du recadrage/aplatissement serveur qui dégradait le rendu remove.bg, normalisation de la taille avant upload.", "filesModified": ["src/lib/photo-cutout.ts", "supabase/functions/remove-background/index.ts"], "feature": "photo-detourage-unification", "result": "completed", "remainingIssues": ["Rendu fond blanc/cadrage encore perfectible, voir tâche t-010"] },
    { "id": "chg-002", "date": "2026-07-22", "title": "Auto-hébergement du modèle de détourage local", "type": "modification_technique", "description": "Le modèle local (@imgly/background-removal / onnxruntime-web) est désormais servi depuis l'app plutôt que le CDN d'IMG.LY, avec patch pour éviter le blob-import des loaders .mjs et ajout du chunk wasm manquant.", "filesModified": ["public/bg-removal", "patches/"], "feature": "add-clothing-item", "result": "completed", "remainingIssues": [] },
    { "id": "chg-003", "date": "2026-07-23", "title": "Fiabilisation du détourage local sur Safari/iOS", "type": "correction_bug", "description": "Correctifs CSP (blob: dans connect-src, unsafe-eval) et gestion d'erreur (message utilisateur au lieu du diagnostic brut, extension .mjs correcte pour les loaders onnxruntime-web auto-hébergés) pour que le détourage local fonctionne sur Safari/iOS.", "filesModified": ["vite.config.ts", "src/lib/photo-cutout.ts"], "feature": "add-clothing-item", "result": "completed", "remainingIssues": [] },
    { "id": "chg-004", "date": "2026-07-23", "title": "Upgrade du modèle de détourage local vers isnet_fp16 et suppression des fragments détachés", "type": "amelioration", "description": "Le modèle local isnet_quint8 est remplacé par isnet_fp16 (meilleure qualité), et une fonction removeDetachedFragments supprime les petits fragments disjoints du détourage (ex. un pied dans le cadre).", "filesModified": ["src/lib/photo-cutout.ts", "public/sw.js"], "feature": "add-clothing-item", "result": "completed", "remainingIssues": ["Rendu fond blanc/cadrage encore perfectible, voir tâche t-010"] },
    { "id": "chg-005", "date": "2026-07-24", "title": "Correction de la réapparition d'articles supprimés/édités après refresh", "type": "correction_bug", "description": "Correction d'une race condition côté synchronisation qui faisait réapparaître des vêtements supprimés ou édités après un rafraîchissement.", "filesModified": ["src/App.tsx", "src/lib/wardrobe-api.ts"], "feature": "cloud-sync", "result": "completed", "remainingIssues": [] },
    { "id": "chg-006", "date": "2026-07-24", "title": "Correction CSP bloquant la synchro cloud des nouveaux vêtements", "type": "correction_bug", "description": "Ajout de data: à connect-src pour que les nouveaux vêtements se synchronisent bien vers le cloud.", "filesModified": ["vite.config.ts"], "feature": "cloud-sync", "result": "completed", "remainingIssues": ["À confirmer si ça couvre entièrement le rapport backlog \"synchronisation qui bug\", voir bug-004"] },
    { "id": "chg-007", "date": "2026-07-24", "title": "Spec et plan pour la cohérence de style des tenues générées par l'IA", "type": "modification_technique", "description": "Écriture de la spec et du plan pour renforcer la cohérence couleur/style dans le prompt de generate-outfits ; implémentation faite sur la branche worktree-outfit-styling-coherence, pas encore mergée dans main.", "filesModified": ["docs/superpowers/specs/2026-07-24-outfit-styling-coherence-design.md", "docs/superpowers/plans/2026-07-24-outfit-styling-coherence.md"], "feature": "outfit-generation", "result": "partial", "remainingIssues": ["Merger worktree-outfit-styling-coherence dans main, voir tâche t-001"] },
    { "id": "chg-008", "date": "2026-07-24", "title": "Mise en place de l'AI Project Manager (suivi de projet augmenté)", "type": "modification_technique", "description": "Extension du système de suivi de développement (tracking.json, dashboard, règles d'agent dans CLAUDE.md) avec tâches, bugs, priorité du jour et briefing quotidien.", "filesModified": ["docs/dev-tracking/tracking.json", "docs/dev-tracking/template.html", "docs/dev-tracking/README.md", "CLAUDE.md"], "feature": null, "result": "completed", "remainingIssues": [] }
  ]
}
```

- [ ] **Step 2: Verify the JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('docs/dev-tracking/tracking.json','utf-8')); console.log('valid JSON')"`
Expected output: `valid JSON`

- [ ] **Step 3: Verify id uniqueness**

Run:
```bash
node -e "
const d = JSON.parse(require('fs').readFileSync('docs/dev-tracking/tracking.json','utf-8'));
for (const key of ['tasks','bugs','features','changelog']) {
  const ids = d[key].map(x => x.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) throw new Error(key + ' has duplicate ids: ' + dupes.join(', '));
}
console.log('all ids unique');
"
```
Expected output: `all ids unique`

- [ ] **Step 4: Commit**

```bash
git add docs/dev-tracking/tracking.json
git commit -m "Extend tracking.json with tasks, bugs, and project state"
```

---

### Task 3: Extend `template.html` with the new dashboard sections

**Files:**
- Modify: `docs/dev-tracking/template.html` (full rewrite of the `<script>` and `<style>` blocks; keep the `<title>` and the `/*__TRACKING_DATA__*/` placeholder mechanism)

**Interfaces:**
- Consumes: the `tracking.json` shape produced in Task 2 (`projectState`, `tasks[]`, `bugs[]`, `features[]`, `changelog[]`).
- Produces: a self-contained HTML fragment (no external deps) suitable for both `dashboard.html` (repo) and Artifact publishing.

- [ ] **Step 1: Replace the file content**

Replace the entire contents of `docs/dev-tracking/template.html` with:

```html
<title>AI Project Manager — Le Dressing</title>
<style>
  :root {
    --bg: #f7f5f2; --surface: #ffffff; --border: #e2ddd6;
    --text: #201c18; --text-muted: #6b625a; --accent: #b45309;
    --success: #15803d; --info: #2563eb; --warn: #a16207; --danger: #b91c1c;
    --radius: 10px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #15130f; --surface: #201c18; --border: #3a332b;
      --text: #f3ede4; --text-muted: #a89d8f; --accent: #e0a458;
      --success: #4ade80; --info: #60a5fa; --warn: #facc15; --danger: #f87171;
    }
  }
  :root[data-theme="light"] {
    --bg: #f7f5f2; --surface: #ffffff; --border: #e2ddd6;
    --text: #201c18; --text-muted: #6b625a; --accent: #b45309;
    --success: #15803d; --info: #2563eb; --warn: #a16207; --danger: #b91c1c;
  }
  :root[data-theme="dark"] {
    --bg: #15130f; --surface: #201c18; --border: #3a332b;
    --text: #f3ede4; --text-muted: #a89d8f; --accent: #e0a458;
    --success: #4ade80; --info: #60a5fa; --warn: #facc15; --danger: #f87171;
  }
  * { box-sizing: border-box; }
  body { margin: 0; }
  #dashboard {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: var(--bg); color: var(--text);
    padding: 24px; max-width: 1100px; margin: 0 auto;
  }
  header.db-header { margin-bottom: 20px; }
  header.db-header h1 { font-size: 1.5rem; margin: 0 0 4px; }
  header.db-header p { margin: 0; color: var(--text-muted); font-size: 0.9rem; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  @media (max-width: 700px) { .grid-2 { grid-template-columns: 1fr; } }
  .box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
  .box h2 { margin: 0 0 10px; font-size: 1rem; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; }
  .tile { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; }
  .tile .value { font-size: 1.4rem; font-weight: 700; }
  .tile .label { font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }
  .progress-bar { width: 100%; height: 10px; background: var(--border); border-radius: 999px; overflow: hidden; margin: 10px 0 4px; }
  .progress-fill { height: 100%; background: var(--accent); }
  .priority-box { border-left: 4px solid var(--accent); }
  .priority-box .label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
  .priority-box .value { font-size: 1.05rem; font-weight: 600; margin: 4px 0 10px; }
  .priority-box .why { font-size: 0.88rem; color: var(--text-muted); }
  .problems-box { border-left: 4px solid var(--danger); }
  .problem-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border); }
  .problem-row:last-child { border-bottom: none; }
  .tabs { display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .tab-btn { background: none; border: none; padding: 10px 14px; font-size: 0.9rem; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; }
  .tab-btn.active { color: var(--text); border-bottom-color: var(--accent); font-weight: 600; }
  .panel { display: none; }
  .panel.active { display: block; }
  .controls { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
  .controls input[type="search"] {
    flex: 1; min-width: 160px; padding: 8px 10px; border-radius: var(--radius);
    border: 1px solid var(--border); background: var(--surface); color: var(--text);
  }
  .status-btn { padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); font-size: 0.8rem; cursor: pointer; }
  .status-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .cards { display: grid; gap: 12px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
  .card h3 { margin: 0 0 4px; font-size: 1rem; }
  .card p.desc { margin: 0 0 8px; color: var(--text-muted); font-size: 0.88rem; }
  .badge { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 0.72rem; font-weight: 600; color: #fff; }
  .card .meta { font-size: 0.75rem; color: var(--text-muted); margin-top: 8px; }
  .card .files { font-size: 0.75rem; color: var(--text-muted); font-family: monospace; margin-top: 4px; }
  .board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  @media (max-width: 900px) { .board { grid-template-columns: 1fr 1fr; } }
  .board-col h3 { font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; margin: 0 0 8px; }
  .board-col .cards { gap: 8px; }
  .timeline { border-left: 2px solid var(--border); padding-left: 16px; display: grid; gap: 16px; }
  .timeline-entry .th-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .timeline-entry .date { font-size: 0.75rem; color: var(--text-muted); }
  .empty { color: var(--text-muted); font-size: 0.85rem; padding: 20px; text-align: center; }
</style>
<div id="dashboard"></div>
<script>
  const DATA = /*__TRACKING_DATA__*/;

  const TASK_STATUS_META = {
    todo: { label: 'À faire', color: 'var(--text-muted)' },
    in_progress: { label: 'En cours', color: 'var(--info)' },
    completed: { label: 'Terminée', color: 'var(--success)' },
    blocked: { label: 'Bloquée', color: 'var(--danger)' }
  };
  const PRIORITY_META = {
    critical: { label: 'Critique', color: 'var(--danger)' },
    high: { label: 'Haute', color: 'var(--warn)' },
    medium: { label: 'Moyenne', color: 'var(--info)' },
    low: { label: 'Basse', color: 'var(--text-muted)' }
  };
  const BUG_STATUS_META = {
    open: { label: 'Ouvert', color: 'var(--danger)' },
    investigating: { label: 'En investigation', color: 'var(--warn)' },
    fixed: { label: 'Corrigé', color: 'var(--success)' },
    ignored: { label: 'Ignoré', color: 'var(--text-muted)' }
  };
  const SEVERITY_META = {
    critical: { label: 'Critique', color: 'var(--danger)' },
    high: { label: 'Haute', color: 'var(--warn)' },
    medium: { label: 'Moyenne', color: 'var(--info)' },
    low: { label: 'Basse', color: 'var(--text-muted)' }
  };
  const FEATURE_STATUS_META = {
    planned: { label: 'Prévue', color: 'var(--text-muted)' },
    in_progress: { label: 'En cours', color: 'var(--info)' },
    completed: { label: 'Terminée', color: 'var(--success)' },
    deprecated: { label: 'Abandonnée', color: 'var(--danger)' }
  };
  const CHANGE_TYPE_META = {
    nouvelle_fonctionnalite: { label: 'Nouvelle fonctionnalité', color: 'var(--success)' },
    amelioration: { label: 'Amélioration', color: 'var(--info)' },
    correction_bug: { label: 'Correction de bug', color: 'var(--danger)' },
    refactorisation: { label: 'Refactorisation', color: 'var(--warn)' },
    modification_visuelle: { label: 'Modification visuelle', color: 'var(--accent)' },
    modification_technique: { label: 'Modification technique', color: 'var(--text-muted)' }
  };
  const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

  const state = { tab: 'tasks', search: '', taskFilter: 'all', bugFilter: 'all', featureFilter: 'all' };

  function badge(meta) {
    return `<span class="badge" style="background:${meta.color}">${meta.label}</span>`;
  }

  function taskCounts() {
    const counts = { todo: 0, in_progress: 0, completed: 0, blocked: 0 };
    DATA.tasks.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
    return counts;
  }

  function renderProgressBox() {
    const c = taskCounts();
    return `<div class="box">
      <h2>Progression</h2>
      <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
        <span>Progression globale</span><span>${DATA.projectState.progress}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${DATA.projectState.progress}%"></div></div>
      <div class="tiles" style="margin-top:12px;">
        <div class="tile"><div class="value">${c.completed}</div><div class="label">Tâches terminées</div></div>
        <div class="tile"><div class="value">${c.in_progress}</div><div class="label">En cours</div></div>
        <div class="tile"><div class="value">${c.blocked}</div><div class="label">Bloquées</div></div>
        <div class="tile"><div class="value">${c.todo}</div><div class="label">À faire</div></div>
      </div>
    </div>`;
  }

  function renderPriorityBox() {
    const ps = DATA.projectState;
    return `<div class="box priority-box">
      <h2>🎯 Priorité du jour</h2>
      <div class="label">Priorité</div>
      <div class="value">${ps.currentPriority}</div>
      <div class="label">Pourquoi ?</div>
      <div class="why">${ps.priorityReason}</div>
      <div class="label" style="margin-top:12px;">Prochaine action</div>
      <div class="why">${ps.nextAction}</div>
    </div>`;
  }

  function renderProblemsBox() {
    const open = DATA.bugs
      .filter(b => b.status === 'open' || b.status === 'investigating')
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    const rows = open.length
      ? open.map(b => `<div class="problem-row">
          <div><strong>${b.title}</strong><div style="font-size:0.78rem; color:var(--text-muted);">${b.description}</div></div>
          ${badge(SEVERITY_META[b.severity])}
        </div>`).join('')
      : `<div class="empty">Aucun problème ouvert.</div>`;
    return `<div class="box problems-box"><h2>Problèmes actuels</h2>${rows}</div>`;
  }

  function renderTasks() {
    const q = state.search.trim().toLowerCase();
    const matches = t => !q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    const columns = ['todo', 'in_progress', 'completed', 'blocked'];
    const board = columns.map(status => {
      const items = DATA.tasks.filter(t => t.status === status && matches(t));
      const cards = items.length
        ? `<div class="cards">${items.map(t => `<div class="card">
            <h3>${t.title}</h3>
            <p class="desc">${t.description}</p>
            ${badge(PRIORITY_META[t.priority])}
            <div class="meta">${t.category} · créée le ${t.createdAt}</div>
          </div>`).join('')}</div>`
        : `<div class="empty">Rien ici.</div>`;
      return `<div class="board-col"><h3>${TASK_STATUS_META[status].label} (${items.length})</h3>${cards}</div>`;
    }).join('');
    return `<div class="controls">
      <input type="search" id="task-search" placeholder="Rechercher une tâche..." value="${state.search}">
    </div><div class="board">${board}</div>`;
  }

  function renderBugs() {
    const filtered = DATA.bugs
      .filter(b => state.bugFilter === 'all' || b.status === state.bugFilter)
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    const statusBtns = ['all', 'open', 'investigating', 'fixed', 'ignored'].map(s => {
      const label = s === 'all' ? 'Tous' : BUG_STATUS_META[s].label;
      const active = state.bugFilter === s ? 'active' : '';
      return `<button class="status-btn ${active}" data-bugstatus="${s}">${label}</button>`;
    }).join('');
    const cards = filtered.length
      ? `<div class="cards">${filtered.map(b => `<div class="card">
          <div class="th-head" style="display:flex; justify-content:space-between; align-items:center;">
            <h3>${b.title}</h3>${badge(SEVERITY_META[b.severity])}
          </div>
          <p class="desc">${b.description}</p>
          ${badge(BUG_STATUS_META[b.status])}
          <div class="meta">Signalé le ${b.createdAt}${b.solution ? ' · ' + b.solution : ''}</div>
        </div>`).join('')}</div>`
      : `<div class="empty">Aucun bug ne correspond aux filtres.</div>`;
    return `<div class="controls">${statusBtns}</div>${cards}`;
  }

  function renderFeatures() {
    const q = state.search.trim().toLowerCase();
    const filtered = DATA.features.filter(f => {
      const matchesStatus = state.featureFilter === 'all' || f.status === state.featureFilter;
      const matchesSearch = !q || f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
    const statusBtns = ['all', 'planned', 'in_progress', 'completed', 'deprecated'].map(s => {
      const label = s === 'all' ? 'Tous' : FEATURE_STATUS_META[s].label;
      const active = state.featureFilter === s ? 'active' : '';
      return `<button class="status-btn ${active}" data-featurestatus="${s}">${label}</button>`;
    }).join('');
    const cards = filtered.length
      ? `<div class="cards">${filtered.map(f => `<div class="card">
          <div class="th-head" style="display:flex; justify-content:space-between; align-items:center;">
            <h3>${f.name}</h3>${badge(FEATURE_STATUS_META[f.status])}
          </div>
          <p class="desc">${f.description}</p>
          <div class="meta">${f.progress}% · Créée le ${f.createdAt} · Mise à jour le ${f.updatedAt}</div>
          <div class="files">${f.files.join(', ')}</div>
        </div>`).join('')}</div>`
      : `<div class="empty">Aucune fonctionnalité ne correspond aux filtres.</div>`;
    return `<div class="controls">
      <input type="search" id="feature-search" placeholder="Rechercher une fonctionnalité..." value="${state.search}">
      ${statusBtns}
    </div>${cards}`;
  }

  function renderChangelog() {
    const entries = [...DATA.changelog].sort((a, b) => b.date.localeCompare(a.date));
    if (!entries.length) return `<div class="empty">Aucune entrée pour le moment.</div>`;
    return `<div class="timeline">${entries.map(h => {
      const meta = CHANGE_TYPE_META[h.type] || CHANGE_TYPE_META.modification_technique;
      return `<div class="timeline-entry">
        <div class="th-head">
          <strong>${h.title}</strong>${badge(meta)}<span class="date">${h.date}</span>
        </div>
        <p class="desc">${h.description}</p>
        <div class="files">${h.filesModified.join(', ')}</div>
      </div>`;
    }).join('')}</div>`;
  }

  function render() {
    const root = document.getElementById('dashboard');
    root.innerHTML = `
      <header class="db-header">
        <h1>AI Project Manager — ${DATA.projectState.projectName}</h1>
        <p>Phase : ${DATA.projectState.currentPhase} · Dernière mise à jour : ${DATA.projectState.lastUpdated} · Pour relancer une analyse, demande à Claude Code.</p>
      </header>
      <div class="grid-2">${renderProgressBox()}${renderPriorityBox()}</div>
      ${renderProblemsBox()}
      <div class="tabs" style="margin-top:20px;">
        <button class="tab-btn ${state.tab === 'tasks' ? 'active' : ''}" data-tab="tasks">Tâches</button>
        <button class="tab-btn ${state.tab === 'bugs' ? 'active' : ''}" data-tab="bugs">Bugs</button>
        <button class="tab-btn ${state.tab === 'features' ? 'active' : ''}" data-tab="features">Fonctionnalités</button>
        <button class="tab-btn ${state.tab === 'changelog' ? 'active' : ''}" data-tab="changelog">Activité récente</button>
      </div>
      <div class="panel ${state.tab === 'tasks' ? 'active' : ''}" id="panel-tasks">${renderTasks()}</div>
      <div class="panel ${state.tab === 'bugs' ? 'active' : ''}" id="panel-bugs">${renderBugs()}</div>
      <div class="panel ${state.tab === 'features' ? 'active' : ''}" id="panel-features">${renderFeatures()}</div>
      <div class="panel ${state.tab === 'changelog' ? 'active' : ''}" id="panel-changelog">${renderChangelog()}</div>
    `;
    root.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => { state.tab = btn.dataset.tab; state.search = ''; render(); });
    });
    const taskSearch = document.getElementById('task-search');
    if (taskSearch) {
      taskSearch.addEventListener('input', (e) => { state.search = e.target.value; render(); });
      taskSearch.focus();
      taskSearch.setSelectionRange(taskSearch.value.length, taskSearch.value.length);
    }
    const featureSearch = document.getElementById('feature-search');
    if (featureSearch) {
      featureSearch.addEventListener('input', (e) => { state.search = e.target.value; render(); });
      featureSearch.focus();
      featureSearch.setSelectionRange(featureSearch.value.length, featureSearch.value.length);
    }
    root.querySelectorAll('[data-bugstatus]').forEach(btn => {
      btn.addEventListener('click', () => { state.bugFilter = btn.dataset.bugstatus; render(); });
    });
    root.querySelectorAll('[data-featurestatus]').forEach(btn => {
      btn.addEventListener('click', () => { state.featureFilter = btn.dataset.featurestatus; render(); });
    });
  }

  render();
</script>
```

- [ ] **Step 2: Regenerate and visually sanity-check the dashboard**

Run: `node docs/dev-tracking/build.mjs`
Then open `docs/dev-tracking/dashboard.html` directly in a browser (`open docs/dev-tracking/dashboard.html` on macOS) and confirm: the four tabs switch correctly, the priority/problems boxes show real data, the tasks board has 4 columns with the right counts, no console errors.

- [ ] **Step 3: Commit**

```bash
git add docs/dev-tracking/template.html docs/dev-tracking/dashboard.html
git commit -m "Add tasks, bugs, and priority sections to the dev-tracking dashboard"
```

---

### Task 4: Add schema validation to `build.mjs`

Guards every future edit to `tracking.json` (including ones made by Claude Code in later sessions) against silently publishing a broken dashboard.

**Files:**
- Modify: `docs/dev-tracking/build.mjs`

**Interfaces:**
- Produces: `validateTrackingData(data)` — throws a descriptive `Error` on the first violation found.

- [ ] **Step 1: Replace the file content**

```javascript
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, 'tracking.json');
const templatePath = join(__dirname, 'template.html');
const outputPath = join(__dirname, 'dashboard.html');

const TASK_STATUSES = ['todo', 'in_progress', 'completed', 'blocked'];
const BUG_STATUSES = ['open', 'investigating', 'fixed', 'ignored'];
const FEATURE_STATUSES = ['planned', 'in_progress', 'completed', 'deprecated'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];

function validateTrackingData(data) {
  for (const key of ['projectState', 'tasks', 'bugs', 'features', 'changelog']) {
    if (!(key in data)) throw new Error(`tracking.json is missing top-level key "${key}"`);
  }
  for (const key of ['tasks', 'bugs', 'features', 'changelog']) {
    const ids = data[key].map(x => x.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length) throw new Error(`tracking.json: duplicate ids in "${key}": ${dupes.join(', ')}`);
  }
  for (const t of data.tasks) {
    if (!TASK_STATUSES.includes(t.status)) throw new Error(`task ${t.id}: invalid status "${t.status}"`);
    if (!PRIORITIES.includes(t.priority)) throw new Error(`task ${t.id}: invalid priority "${t.priority}"`);
  }
  for (const b of data.bugs) {
    if (!BUG_STATUSES.includes(b.status)) throw new Error(`bug ${b.id}: invalid status "${b.status}"`);
    if (!PRIORITIES.includes(b.severity)) throw new Error(`bug ${b.id}: invalid severity "${b.severity}"`);
  }
  for (const f of data.features) {
    if (!FEATURE_STATUSES.includes(f.status)) throw new Error(`feature ${f.id}: invalid status "${f.status}"`);
  }
}

const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
validateTrackingData(data);

const template = readFileSync(templatePath, 'utf-8');
const marker = '/*__TRACKING_DATA__*/';
if (!template.includes(marker)) {
  throw new Error(`Placeholder ${marker} introuvable dans template.html`);
}

const output = template.replace(marker, JSON.stringify(data, null, 2));
writeFileSync(outputPath, output, 'utf-8');

console.log(
  `dashboard.html généré : ${data.tasks.length} tâches, ${data.bugs.length} bugs, ` +
  `${data.features.length} fonctionnalités, ${data.changelog.length} entrées de changelog.`
);
```

- [ ] **Step 2: Verify it still builds cleanly**

Run: `node docs/dev-tracking/build.mjs`
Expected output: `dashboard.html généré : 23 tâches, 6 bugs, 24 fonctionnalités, 8 entrées de changelog.`

- [ ] **Step 3: Verify it actually catches a broken file**

Run:
```bash
cp docs/dev-tracking/tracking.json /tmp/tracking-backup.json
node -e "
const d = JSON.parse(require('fs').readFileSync('docs/dev-tracking/tracking.json','utf-8'));
d.tasks[0].status = 'not-a-real-status';
require('fs').writeFileSync('docs/dev-tracking/tracking.json', JSON.stringify(d, null, 2));
"
node docs/dev-tracking/build.mjs
```
Expected: the second command exits non-zero with `task t-001: invalid status "not-a-real-status"`.

- [ ] **Step 4: Restore the valid file**

```bash
cp /tmp/tracking-backup.json docs/dev-tracking/tracking.json
rm /tmp/tracking-backup.json
node docs/dev-tracking/build.mjs
```
Expected output: `dashboard.html généré : 23 tâches, 6 bugs, 24 fonctionnalités, 8 entrées de changelog.`

- [ ] **Step 5: Commit**

```bash
git add docs/dev-tracking/build.mjs docs/dev-tracking/dashboard.html
git commit -m "Validate tracking.json schema before generating the dashboard"
```

---

### Task 5: Update `docs/dev-tracking/README.md`

**Files:**
- Modify: `docs/dev-tracking/README.md` (full rewrite)

- [ ] **Step 1: Replace the file content**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/dev-tracking/README.md
git commit -m "Document the extended AI Project Manager tracking schema"
```

---

### Task 6: Add the "AI Project Manager" section to `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (append a new section at the end)

- [ ] **Step 1: Append the new section**

Add at the end of `/Users/eliopainteaux/Desktop/Perso/Le Dressing Application/app-vetements/CLAUDE.md`:

```markdown

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
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Document AI Project Manager agent rules in CLAUDE.md"
```

---

### Task 7: Publish the Artifact and final verification

**Files:** none (verification + publishing only)

- [ ] **Step 1: Final rebuild**

Run: `node docs/dev-tracking/build.mjs`
Expected output: `dashboard.html généré : 23 tâches, 6 bugs, 24 fonctionnalités, 8 entrées de changelog.`

- [ ] **Step 2: Publish `docs/dev-tracking/dashboard.html` via the Artifact tool**

Publish with a 🧵 favicon (matching the original 2026-07-21 dashboard choice) and title "AI Project Manager — Le Dressing".

- [ ] **Step 3: Confirm no application file was touched**

Run: `git diff main --stat -- src/ supabase/ public/ package.json`
Expected output: empty (no lines) — nothing under `src/`, `supabase/`, `public/`, or `package.json` should appear in this diff.

- [ ] **Step 4: Confirm the working tree is clean**

Run: `git status --short`
Expected: no output related to `docs/dev-tracking/` or `CLAUDE.md` (everything committed in Tasks 1-6).

---

## Self-Review Notes

- **Spec coverage:** projectState ✓ (Task 2), tasks/bugs/features/changelog schema ✓ (Task 2), dashboard sections (header, progress, priority, next action, problems, activity, tasks board) ✓ (Task 3), README workflow doc ✓ (Task 5), CLAUDE.md agent rules + prioritization order ✓ (Task 6), Artifact publish ✓ (Task 7), schema guard ✓ (Task 4), baseline recovery from the unmerged branch ✓ (Task 1), no app code touched ✓ (Task 7 Step 3).
- **Deviation from the design doc, called out explicitly:** the `changelog` schema keeps the inherited `type` field (`nouvelle_fonctionnalite` / `amelioration` / etc.) from the old `history` schema alongside the new fields (`feature`, `result`, `remainingIssues`) — the design doc's JSON example omitted it, but dropping it would silently lose real categorization data during migration and the dashboard's existing timeline rendering already depends on it. Documented in `README.md`.
- **Out of scope for this plan (Phase B, separate plan):** the `SessionStart` hook and the scheduled autonomous agent — both depend on this Phase A schema existing first.
