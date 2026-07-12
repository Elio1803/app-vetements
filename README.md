# Le Dressing

Application de garde-robe installable sur iPhone et Android.

## Utilisation locale

```bash
npm install
npm run dev
```

## Publication sur GitHub Pages

1. Créer un dépôt GitHub vide et y envoyer le contenu de ce dossier.
2. Dans **Settings → Pages**, choisir **GitHub Actions** comme source.
3. Envoyer la branche `main`. Le workflow publie automatiquement l’application en HTTPS.

## Installation sur le téléphone

- **iPhone** : ouvrir l’adresse publiée dans Safari, toucher **Partager**, puis **Sur l’écran d’accueil**.
- **Android** : ouvrir l’adresse publiée dans Chrome, puis toucher **Installer l’application**.

Les données du mode démonstration sont conservées sur le téléphone. Pour synchroniser plusieurs appareils, configurer Supabase en suivant [supabase/README.md](supabase/README.md).
