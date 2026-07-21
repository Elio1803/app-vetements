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
