# Sécurité de Le Dressing

## Principes appliqués

- Les clés privées (`service_role`, remove.bg, Resend, Anthropic et FAL) restent exclusivement dans les secrets des Edge Functions Supabase.
- Le navigateur reçoit uniquement la clé Supabase publiable. Elle ne donne accès aux données qu'à travers les politiques RLS.
- Chaque Edge Function exige une session Supabase valide, vérifie de nouveau l'utilisateur dans le handler et applique une limite de requêtes par utilisateur.
- Les photos sont stockées dans un bucket privé, limitées à 5 Mo et vérifiées par leur signature binaire (JPEG, PNG ou WebP).
- Les entrées et les réponses de fournisseurs sont validées avant utilisation. Les erreurs publiques ne contiennent pas les détails internes.
- Le déploiement exécute les tests, le build TypeScript et `npm audit` avant publication.

## Secrets

Ne jamais placer une clé privée dans `VITE_*`, le code source, une issue, une capture d'écran ou un message de commit. Les variables `VITE_*` sont intégrées au JavaScript public lors du build.

En cas de fuite supposée :

1. révoquer et recréer immédiatement la clé chez le fournisseur ;
2. mettre à jour le secret Supabase correspondant ;
3. vérifier les journaux et les consommations inhabituelles ;
4. invalider les sessions concernées si un jeton utilisateur a été exposé ;
5. redéployer et documenter l'incident sans recopier le secret.

## Réglages de production à conserver

- RLS activé et forcé sur toutes les tables publiques contenant des données utilisateur ;
- bucket `clothing-photos` privé ;
- origines CORS limitées à `https://elio1803.github.io` ;
- protection contre les mots de passe compromis et CAPTCHA activés dans Supabase Auth dès que le fournisseur CAPTCHA est configuré ;
- MFA activée sur les comptes GitHub, Supabase et fournisseurs d'API ;
- protection de la branche `main`, alertes Dependabot et analyse des secrets activées dans GitHub.

## Signaler un problème

Utiliser de préférence le signalement privé de vulnérabilité dans l'onglet **Security** du dépôt GitHub. Ne jamais publier une clé, un jeton, une photo privée ou les étapes complètes d'exploitation dans une issue publique.
