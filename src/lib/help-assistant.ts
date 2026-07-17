export type HelpAction = 'add-item' | 'wardrobe' | 'generate' | 'history' | 'profile'

export interface HelpReply {
  text: string
  action?: HelpAction
  actionLabel?: string
}

function normalizeQuestion(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function includesAny(question: string, words: string[]): boolean {
  return words.some((word) => question.includes(word))
}

export function answerHelpQuestion(value: string): HelpReply {
  const question = normalizeQuestion(value)

  if (includesAny(question, ['synchron', 'ordinateur', 'mac', 'autre appareil', 'retrouver mes vetement'])) {
    return {
      text: 'Pour retrouver le même dressing partout :\n1. Connectez-vous avec la même adresse e-mail sur chaque appareil.\n2. Ouvrez Profil.\n3. Appuyez sur « Synchroniser maintenant » si des pièces restent sur le téléphone.',
      action: 'profile',
      actionLabel: 'Ouvrir le profil',
    }
  }

  if (includesAny(question, ['ajout', 'ajouter', 'photo', 'photograph', 'import', 'nouveau vetement', 'nouvelle piece'])) {
    return {
      text: 'Pour ajouter un vêtement :\n1. Touchez le bouton +.\n2. Choisissez d’abord le type de vêtement.\n3. Prenez une photo ou choisissez-la dans votre galerie.\n4. Vérifiez le détourage, puis validez « Ajouter au dressing ».',
      action: 'add-item',
      actionLabel: 'Ajouter une pièce',
    }
  }

  if (includesAny(question, ['gener', 'idee de tenue', 'quoi porter', 'rien a me mettre', 'occasion', 'meteo'])) {
    return {
      text: 'Pour obtenir des idées :\n1. Ouvrez Générer.\n2. Choisissez l’occasion.\n3. Ajoutez une précision si nécessaire.\n4. Touchez « Générer 3 tenues ». La saison et la météo sont prises en compte automatiquement.',
      action: 'generate',
      actionLabel: 'Créer une tenue',
    }
  }

  if (includesAny(question, ['histor', 'calendrier', 'portee', 'porte aujourd', 'ancienne tenue'])) {
    return {
      text: 'Pour remplir l’historique, ouvrez une proposition de tenue et touchez « Porter aujourd’hui ». La tenue sera alors enregistrée à la date du jour dans le calendrier Historique.',
      action: 'history',
      actionLabel: 'Voir l’historique',
    }
  }

  if (includesAny(question, ['nom', 'profil', 'dressing de qui', 'deconnexion', 'deconnecter'])) {
    return {
      text: 'Dans Profil, vous pouvez modifier le nom du dressing, vérifier la synchronisation, installer l’application ou vous déconnecter.',
      action: 'profile',
      actionLabel: 'Ouvrir le profil',
    }
  }

  if (includesAny(question, ['install', 'ecran d accueil', 'telecharger', 'application telephone', 'pwa'])) {
    return {
      text: 'Pour installer Le Dressing sur iPhone : ouvrez le site dans Safari, touchez Partager, puis « Sur l’écran d’accueil ». Vous pourrez ensuite l’ouvrir comme une application.',
      action: 'profile',
      actionLabel: 'Voir l’installation',
    }
  }

  if (includesAny(question, ['detour', 'fond blanc', 'remove bg', 'decoup', 'isoler'])) {
    return {
      text: 'Pour un meilleur détourage : choisissez la catégorie avant la photo, cadrez une seule pièce, utilisez un fond uni et laissez tout le vêtement visible. L’application adaptera ensuite le cadrage à la catégorie.',
      action: 'add-item',
      actionLabel: 'Ajouter une photo',
    }
  }

  if (includesAny(question, ['supprim', 'effacer', 'retirer une piece', 'modifier une piece'])) {
    return {
      text: 'Dans Dressing, touchez la pièce concernée pour ouvrir sa fiche. Vous pourrez ensuite modifier ses informations ou la supprimer.',
      action: 'wardrobe',
      actionLabel: 'Ouvrir le dressing',
    }
  }

  if (includesAny(question, ['bonjour', 'salut', 'hello', 'aide', 'comment ca marche', 'que peux tu faire'])) {
    return {
      text: 'Bonjour ! Je peux vous expliquer comment ajouter une pièce, générer une tenue, utiliser l’historique, personnaliser le profil, installer l’application ou synchroniser vos appareils.',
    }
  }

  return {
    text: 'Je n’ai pas encore compris cette question. Essayez par exemple : « Comment ajouter un vêtement ? », « Comment générer une tenue ? » ou « Comment synchroniser mon Mac ? ».',
  }
}
