# Dashboard de suivi du développement — Le Dressing

Date : 2026-07-21

## Contexte et objectif

Le projet Le Dressing n'a aujourd'hui aucun système centralisé pour suivre l'état du développement : quelles fonctionnalités existent, lesquelles sont en cours, quels bugs ont été corrigés, quel est l'historique des modifications. Cette spec définit un Dashboard de suivi qui devient la source de vérité sur l'état du projet, maintenu à jour par Claude Code à chaque modification future.

Le codebase actuel a été audité intégralement (stack, `src/`, `supabase/`, `public/`, `scripts/`, `work/`, `docs/`) avant la conception de ce système — voir l'inventaire des 23 fonctionnalités existantes en annexe. Un chantier en cours a été identifié : `docs/superpowers/specs/2026-07-21-photo-detourage-design.md` (unification des pipelines de détourage photo, non implémenté à ce jour).

## Architecture

### 1. Source de vérité — `docs/dev-tracking/tracking.json`

Fichier JSON versionné dans git, unique source de vérité. Structure :

```json
{
  "meta": {
    "lastUpdated": "YYYY-MM-DD",
    "totalModifications": 0
  },
  "features": [
    {
      "id": "kebab-case-id",
      "name": "string",
      "description": "string",
      "status": "termine | en_cours | a_faire | bloque",
      "createdAt": "YYYY-MM-DD",
      "updatedAt": "YYYY-MM-DD",
      "files": ["chemins/relatifs"],
      "notes": "string (optionnel)"
    }
  ],
  "bugs": [
    {
      "id": "bug-NNN",
      "title": "string",
      "fixedAt": "YYYY-MM-DD",
      "relatedFeature": "id de feature ou null"
    }
  ],
  "history": [
    {
      "date": "YYYY-MM-DD",
      "title": "string",
      "type": "nouvelle_fonctionnalite | amelioration | correction_bug | refactorisation | modification_visuelle | modification_technique",
      "description": "string",
      "files": ["chemins/relatifs"],
      "status": "termine | en_cours"
    }
  ]
}
```

Le fichier sera initialisé avec les 23 fonctionnalités existantes (statut `termine`, dates au 2026-07-11/12/17 selon les migrations/fichiers correspondants) et une entrée `en_cours` pour le chantier photo-detourage.

### 2. Présentation — Artifact HTML

Un Artifact HTML autonome (favicon 🧵, thème clair/sombre auto) régénéré et republié sur une URL stable à chaque mise à jour. Le JSON de `tracking.json` est injecté directement dans le HTML au moment de la génération (pas de fetch runtime).

Sections :
- **Vue d'ensemble** : tuiles de stats (total fonctionnalités, terminées, en cours, à faire, bloquées, bugs corrigés, total modifications) + barre de progression globale.
- **Fonctionnalités** : cartes filtrables par statut, recherche texte, badges colorés par statut, affichage nom/description/fichiers/dates/notes.
- **Historique** : timeline chronologique inversée (plus récent en premier), badge coloré par type, fichiers concernés.

Le fichier HTML généré est aussi conservé dans `docs/dev-tracking/dashboard.html` (versionné, pour diff git et traçabilité), en plus d'être publié comme Artifact.

### 3. Documentation — `docs/dev-tracking/README.md`

Explique : structure de `tracking.json`, comment ajouter une fonctionnalité, comment logger une modification dans l'historique, comment changer un statut, où trouver le lien de l'Artifact publié.

## Workflow (règle permanente pour toute modification future)

Pour chaque demande de modification du projet, Claude Code doit :
1. Comprendre la demande, analyser le code concerné, identifier les fichiers impactés
2. Réaliser la modification et la tester
3. Vérifier l'absence de régression sur les fonctionnalités existantes
4. Mettre à jour `tracking.json` : statut de la fonctionnalité concernée, nouvelle entrée dans `history`, ajustement de `meta.totalModifications` et `meta.lastUpdated`
5. Régénérer `dashboard.html` et republier l'Artifact sur la même URL
6. Fournir un résumé clair de ce qui a été fait, avec le lien vers l'Artifact mis à jour

Aucune modification n'est considérée terminée sans cette mise à jour du suivi.

## Hors périmètre

- Pas d'intégration dans l'app de production elle-même (pas de route `/dashboard` dans le code React de l'app) — le Dashboard est un outil de suivi de développement, séparé de l'expérience utilisateur finale.
- Pas de lecture live/dynamique du JSON par l'Artifact (pas de capacité runtime) — la republication manuelle à chaque modification suffit et évite une dépendance supplémentaire.
- Pas de backend/API dédié au tracking — tout repose sur le fichier JSON versionné et la régénération de l'Artifact.

## Annexe — Inventaire des fonctionnalités existantes au 2026-07-21

Stack : React 19 + Vite 7 + TypeScript, Tailwind 4, Supabase (Postgres/Auth/Storage/Edge Functions), PWA, Vitest.

Fonctionnalités (statut initial `termine` sauf mention contraire) :

1. Authentification Supabase (email/mdp, OAuth Google, reset mdp)
2. Authentification locale/offline (compte device-local)
3. Vue dressing (grille, recherche, filtres, tri)
4. Ajout de vêtement (upload, détourage remove.bg + fallback ISNet local, analyse IA)
5. Édition/suppression de vêtement
6. Vue détail d'un vêtement
7. Génération de tenues (IA Anthropic + moteur heuristique local)
8. Composition visuelle de tenue (image IA via FAL)
9. Marquage tenue "portée"
10. Historique des tenues portées (calendrier)
11. Look d'urgence (génération rapide)
12. Insights de rotation du dressing (stats, jamais porté, non porté 30j)
13. Suggestions météo (Open-Meteo)
14. Profil utilisateur
15. Email de bienvenue (Resend)
16. Chat d'aide (assistant pré-formaté, non-IA)
17. Support offline / PWA (service worker, installable)
18. Synchronisation cloud bidirectionnelle
19. Mode démo
20. Partage de tenue
21. Error boundary applicatif
22. Écrans de chargement / animations
23. Génération d'icônes (script Python)

En cours (`en_cours`) :
- Unification des pipelines de détourage photo — voir `docs/superpowers/specs/2026-07-21-photo-detourage-design.md`. Prévoit aussi un futur chantier sur la fiabilité de l'analyse IA et un doublon UI (Rotation vs "Dernière fois").
