# Backend Supabase — Le Dressing

Ce dossier contient la base Postgres, le bucket Storage privé et les fonctions
Edge. La clé Anthropic n'est jamais utilisée par le navigateur.

## Contenu

- `migrations/20260711000000_initial_schema.sql` crée les enums, les tables
  `users`, `clothing_items`, `outfits`, leurs contraintes/index, les règles RLS,
  le bucket `clothing-photos`, les règles Storage et les triggers.
- `functions/analyze-clothing` analyse une photo déjà chargée dans Storage et
  embarque sa propre configuration Deno reproductible.
- `functions/generate-outfits` choisit au maximum 10 photos, envoie les autres
  pièces comme métadonnées, génère trois tenues et les enregistre dans
  `outfits` ; elle embarque aussi sa propre configuration Deno.
- `functions/send-welcome-email` envoie une seule fois l'e-mail « Bonjour »
  après la première connexion confirmée, via Resend.
- `functions/_shared` centralise l'authentification, CORS, le contrôle des
  images, l'appel Anthropic, le nettoyage JSON et le retry unique.

## Modèle et sécurité

Les valeurs canoniques sont :

- catégories : `haut`, `bas`, `chaussures`, `veste_manteau`, `accessoire`,
  `robe` ;
- occasions : `quotidien`, `travail`, `soiree`, `sport`, `rendez_vous`,
  `habille`.

`clothing_items.photo_url` porte ce nom pour rester conforme au contrat
produit, mais contient un **chemin d'objet privé**, jamais une URL publique :

```text
<auth-user-id>/<uuid-du-fichier>.jpg
```

Le premier segment est contrôlé en base, par les règles Storage et à nouveau
dans les fonctions Edge. Pour afficher une photo, le frontend doit utiliser
`createSignedUrl` (durée courte) ou `download` sur le bucket
`clothing-photos`.

Chaque table active RLS et ne laisse voir à un utilisateur que ses propres
lignes. Les colonnes `wear_count` et `last_worn_at` ne sont pas modifiables
directement par le rôle `authenticated`, ni injectables à la création avec
`created_at`. Le navigateur ne peut pas non plus insérer une ligne `outfits` :
seule `generate-outfits`, avec la clé serveur injectée par Supabase, persiste
les propositions validées. La RPC suivante réalise la transition de port de
manière atomique et idempotente :

```ts
await supabase.rpc("mark_outfit_worn", { p_outfit_id: outfitId });
```

Elle verrouille la tenue, renseigne `worn_at`, incrémente chaque compteur une
seule fois et actualise `last_worn_at`. Un vêtement supprimé peut rester cité
dans l'historique d'une ancienne tenue ; l'existence et la propriété de toutes
les pièces sont contrôlées lors de la création de la tenue.

Le trigger `on_auth_user_profile_changed` crée/synchronise `public.users` à
partir de `auth.users` et la migration reprend aussi les utilisateurs déjà
présents.

## Installation locale

Prérequis : Docker et la CLI Supabase.

```bash
supabase start
supabase db reset
cp supabase/.env.example supabase/.env.local
```

Renseigner au minimum `ANTHROPIC_API_KEY` et `ANTHROPIC_MODEL` dans
`supabase/.env.local`, puis lancer :

```bash
supabase functions serve --env-file supabase/.env.local
```

`SUPABASE_URL` et les clés serveur/publiables sont injectées automatiquement
dans les fonctions par Supabase (anciens noms ou nouvelles maps de clés pris en
charge). Ne jamais recopier la service-role/secret key ni la clé Anthropic dans
les variables Vite (`VITE_*`).

En production, `ALLOWED_ORIGINS` doit contenir les origines frontend exactes,
séparées par des virgules. Sans cette variable, seules les origines Vite
locales et les requêtes serveur sans en-tête `Origin` sont acceptées.

Pour l'e-mail de bienvenue, ajouter également les secrets suivants :

```bash
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set WELCOME_FROM_EMAIL="Le Dressing <bonjour@votre-domaine.fr>"
```

Le domaine de l'expéditeur doit être validé dans Resend. La fonction mémorise
`welcome_email_sent_at` afin de ne pas renvoyer le message à chaque connexion.

Pour utiliser remove.bg lors de l'import d'une photo de vêtement, ajouter la
clé API remove.bg côté Supabase uniquement :

```bash
supabase secrets set REMOVE_BG_API_KEY=...
```

## Déploiement

```bash
supabase link --project-ref <project-ref>
supabase db push
supabase secrets set --env-file supabase/.env.production
supabase functions deploy analyze-clothing
supabase functions deploy generate-outfits
supabase functions deploy remove-background
supabase functions deploy send-welcome-email
```

Les fonctions ont `verify_jwt = false` dans `config.toml` pour ne pas
dépendre du vérificateur JWT historique, incompatible avec certaines clés de
signature asymétriques. Ce réglage ne rend pas les endpoints publics : chaque
handler exige un Bearer token et appelle `Auth.getUser()` avant tout accès aux
données. Les appels IA sont en plus limités par utilisateur en base : 30
analyses et 12 générations par heure.

## Contrats HTTP

Le SDK `supabase.functions.invoke` ajoute le token de session. Pour un appel
HTTP direct, fournir `Authorization: Bearer <access-token>`, la clé publique
Supabase dans `apikey` et `Content-Type: application/json`.

### `analyze-clothing`

Le fichier doit d'abord être chargé dans `clothing-photos` sous le préfixe de
l'utilisateur authentifié. Taille maximale : 5 Mio. Formats réellement
acceptés après inspection des octets : JPEG, PNG, GIF et WebP.

```json
{
  "imagePath": "<user-id>/550e8400-e29b-41d4-a716-446655440000.jpg",
  "category": "haut"
}
```

Réponse `200` :

```json
{
  "couleur_dominante": "bleu marine",
  "nom_suggere": "Pull col roulé bleu marine"
}
```

La fonction ne crée pas la ligne `clothing_items` : le frontend conserve le
nom saisi par l'utilisateur s'il existe, puis insère la pièce avec le résultat
de l'analyse.

### `generate-outfits`

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "occasion": "travail",
  "note": "entretien important et journée fraîche"
}
```

`requestId` est obligatoire : générer un UUID une fois au clic utilisateur et
réutiliser exactement le même UUID pour les retries réseau de cette action. Le
backend enregistre un fingerprint de l'occasion/note et retourne les trois
mêmes lignes sans nouvel appel Anthropic si la requête a déjà abouti. Réutiliser
la clé avec d'autres paramètres renvoie `IDEMPOTENCY_KEY_REUSED`.

La note est optionnelle et limitée à 500 caractères. La fonction lit elle-même
le dressing via RLS, privilégie les pièces jamais portées ou les plus anciennes,
assure une diversité de catégories, puis envoie au plus 10 images et 15 Mio par
défaut (18 Mio maximum pour garder une marge après encodage base64). Les pièces
restantes (60 par défaut, 100 au maximum) sont présentées à l'IA sous forme de
métadonnées. Elle rejette tout identifiant inventé, toute tenue incomplète et
toute réponse autre que trois tenues distinctes. Si le dressing ne permet pas
mathématiquement trois variantes, elle répond `422 INSUFFICIENT_VARIETY` avant
de facturer un appel IA.

Réponse `200` (les trois lignes sont déjà enregistrées dans `outfits`) :

```json
{
  "tenues": [
    {
      "id": "uuid-de-la-tenue-en-base",
      "nom": "Épure marine",
      "itemIds": ["uuid-haut", "uuid-bas", "uuid-chaussures"],
      "raison": "Une silhouette sobre et cohérente pour le travail."
    }
  ]
}
```

En cas de JSON Anthropic mal formé ou non conforme, chaque fonction refait une
seule requête puis renvoie `AI_INVALID_RESPONSE`. Les erreurs ont toujours la
forme :

```json
{
  "error": {
    "code": "INVALID_OCCASION",
    "message": "Unknown outfit occasion."
  }
}
```

## Suppression des photos

Une cascade SQL supprime les lignes d'un utilisateur, pas les octets du bucket.
Le flux de suppression d'une pièce doit donc appeler l'API Storage
`storage.from("clothing-photos").remove([photoPath])` puis supprimer la ligne
`clothing_items`, avec retry/compensation si l'une des deux opérations échoue.
Ne jamais supprimer directement une ligne de `storage.objects` en SQL.

Avant de supprimer un compte Auth, un workflow serveur privilégié doit lister
et supprimer tous les objets sous `<userId>/`. À défaut, prévoir un job de
nettoyage périodique des préfixes sans utilisateur : la cascade sur
`auth.users` ne nettoie pas le stockage objet.

## Contrôles avant livraison

Avec les outils installés :

```bash
deno fmt --check supabase/functions
deno check --config supabase/functions/analyze-clothing/deno.json \
  supabase/functions/analyze-clothing/index.ts
deno check --config supabase/functions/generate-outfits/deno.json \
  supabase/functions/generate-outfits/index.ts
supabase db lint --local --level warning
```

Le client doit compresser les prises de vue avant l'upload (largeur maximale
800 px, JPEG qualité 70 %) pour réduire la latence et le coût vision.
