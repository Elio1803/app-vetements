export type HelpAction = 'add-item' | 'wardrobe' | 'generate' | 'history' | 'profile'
export type HelpContext = Exclude<HelpAction, 'add-item'>

export interface HelpReply {
  text: string
  action?: HelpAction
  actionLabel?: string
}

interface HelpIntent extends HelpReply {
  patterns: string[]
}

const STOPWORDS = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'a', 'au', 'aux',
  'ce', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses',
  'je', 'j', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'pour', 'avec',
  'sur', 'dans', 'est', 'suis', 'sont', 'que', 'qui', 'quoi', 'comment', 'pourquoi',
  'est ce', 'si', 'pas', 'plus', 'faire', 'peux', 'peut', 'svp', 'stp',
])

function normalizeQuestion(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(normalized: string): string[] {
  return normalized.split(' ').filter((word) => word.length >= 2 && !STOPWORDS.has(word))
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let previousRow = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 0; i < a.length; i += 1) {
    const currentRow = [i + 1]
    for (let j = 0; j < b.length; j += 1) {
      const cost = a[i] === b[j] ? 0 : 1
      currentRow.push(Math.min(
        previousRow[j + 1] + 1,
        currentRow[j] + 1,
        previousRow[j] + cost,
      ))
    }
    previousRow = currentRow
  }
  return previousRow[b.length]
}

function wordMatches(patternWord: string, questionWord: string): boolean {
  if (patternWord === questionWord) return true
  if (Math.abs(patternWord.length - questionWord.length) > 2) return false
  const tolerance = patternWord.length >= 7 ? 2 : patternWord.length >= 4 ? 1 : 0
  return tolerance > 0 && levenshtein(patternWord, questionWord) <= tolerance
}

function scorePattern(pattern: string, normalizedQuestion: string, questionTokens: string[]): number {
  if (normalizedQuestion.includes(pattern)) {
    return pattern.split(' ').length * 2
  }

  const patternWords = pattern.split(' ').filter((word) => word.length >= 2)
  if (!patternWords.length) return 0

  const matchedWords = patternWords.filter((patternWord) =>
    questionTokens.some((questionWord) => wordMatches(patternWord, questionWord)),
  )
  const ratio = matchedWords.length / patternWords.length
  if (ratio === 1) return patternWords.length * 1.5
  if (ratio >= 0.6) return patternWords.length * ratio
  return 0
}

function bestScoreForIntent(intent: HelpIntent, normalizedQuestion: string, questionTokens: string[]): number {
  return intent.patterns.reduce(
    (best, pattern) => Math.max(best, scorePattern(pattern, normalizedQuestion, questionTokens)),
    0,
  )
}

const INTENTS: HelpIntent[] = [
  {
    patterns: ['mot de passe oublie', 'reinitialiser mon mot de passe', 'changer mon mot de passe', 'nouveau mot de passe'],
    text: 'Depuis la page de connexion, touchez « Mot de passe oublié ? », saisissez votre adresse e-mail puis ouvrez le lien reçu. Choisissez votre nouveau mot de passe et revenez ensuite dans l’application.',
    action: 'profile',
    actionLabel: 'Ouvrir le profil',
  },
  {
    patterns: ['mail de confirmation', 'confirmer mon email', 'confirmer mon adresse', 'lien de confirmation', 'mail d inscription', 'email d inscription'],
    text: 'Après l’inscription, ouvrez le message envoyé par Supabase et touchez le lien de confirmation. S’il n’apparaît pas, vérifiez les indésirables et assurez-vous d’avoir saisi la bonne adresse.',
  },
  {
    patterns: ['connexion google', 'connecter avec google', 'google ne marche', 'provider is not enabled'],
    text: 'La connexion Google fonctionne seulement si le fournisseur Google est activé dans Supabase. En attendant, utilisez votre adresse e-mail et votre mot de passe pour accéder au même dressing.',
  },
  {
    patterns: ['creer un compte', 'm inscrire', 'inscription', 'nouveau compte'],
    text: 'Sur l’écran d’accueil, choisissez « Créer un compte », renseignez votre adresse e-mail et un mot de passe, puis confirmez l’adresse grâce au mail reçu. Utilisez ensuite ces mêmes identifiants sur tous vos appareils.',
  },
  {
    patterns: ['impossible de me connecter', 'connexion impossible', 'identifiants incorrects', 'erreur de connexion', 'me reconnecter'],
    text: 'Vérifiez l’adresse e-mail, le mot de passe et la connexion internet. Si le compte vient d’être créé, confirmez d’abord l’adresse e-mail. Sinon, utilisez « Mot de passe oublié ? » pour créer un nouveau mot de passe.',
  },
  {
    patterns: ['deconnexion', 'deconnecter', 'changer de compte'],
    text: 'Ouvrez Profil puis touchez « Se déconnecter ». Vous pourrez ensuite vous connecter avec une autre adresse. Vérifiez la synchronisation avant de changer de compte.',
    action: 'profile',
    actionLabel: 'Ouvrir le profil',
  },
  {
    patterns: ['invalid token', 'token expire', 'session expire', 'reconnecter la session'],
    text: 'Ce message signifie que votre session a expiré. Déconnectez-vous, reconnectez-vous avec le même compte, puis relancez « Synchroniser maintenant » dans Profil.',
    action: 'profile',
    actionLabel: 'Réparer la session',
  },
  {
    patterns: ['doublon', 'pieces multipliees', 'articles multiplies', 'plusieurs fois la meme piece'],
    text: 'La synchronisation détecte normalement les doublons. N’appuyez pas plusieurs fois pendant l’envoi. Si une pièce apparaît plusieurs fois, ouvrez le dressing et supprimez uniquement les copies inutiles.',
    action: 'wardrobe',
    actionLabel: 'Vérifier le dressing',
  },
  {
    patterns: ['sur mon mac', 'sur mon ordinateur', 'pas sur mac', 'pas sur ordinateur', 'autre appareil'],
    text: 'Connectez le téléphone et le Mac avec exactement la même adresse e-mail. Sur le téléphone, ouvrez Profil et lancez « Synchroniser maintenant ». Actualisez ensuite l’application sur le Mac.',
    action: 'profile',
    actionLabel: 'Vérifier la synchronisation',
  },
  {
    patterns: ['synchroniser', 'synchronisation', 'sauvegarder en ligne', 'sauvegarde en ligne'],
    text: 'La synchronisation sauvegarde vos pièces sur votre compte Supabase. Ouvrez Profil et touchez « Synchroniser maintenant ». Gardez l’application ouverte et la connexion active jusqu’au message de réussite.',
    action: 'profile',
    actionLabel: 'Synchroniser maintenant',
  },
  {
    patterns: ['hors ligne', 'pas de reseau', 'sans internet', 'erreur reseau', 'upload bloque'],
    text: 'Sans réseau, les informations restent temporairement sur cet appareil. Retrouvez une connexion stable, rouvrez Profil puis relancez la synchronisation. Ne fermez pas l’application pendant l’envoi des photos.',
    action: 'profile',
    actionLabel: 'Voir la synchronisation',
  },
  {
    patterns: ['autoriser les photos', 'acces aux photos', 'permission photo', 'camera ne marche', 'appareil photo ne marche'],
    text: 'Sur iPhone, ouvrez Réglages > Le Dressing ou Safari > Photos/Appareil photo, puis autorisez l’accès. Revenez ensuite dans l’application et touchez à nouveau le bouton +.',
    action: 'add-item',
    actionLabel: 'Réessayer l’ajout',
  },
  {
    patterns: ['plusieurs vetements', 'tenue complete', 'isoler le haut', 'isoler le bas', 'garder que', 'un seul vetement'],
    text: 'Photographiez une seule pièce à la fois, posée à plat ou sur un cintre. Le détourage automatique isole le vêtement et le recentre sur fond blanc, quel que soit le cadrage de la photo.',
    action: 'add-item',
    actionLabel: 'Choisir une catégorie',
  },
  {
    patterns: ['detourage', 'detourer', 'fond blanc', 'remove bg', 'arriere plan', 'decoupage'],
    text: 'Pour un détourage précis, photographiez une seule pièce entièrement visible, sur un fond uni contrasté, avec une lumière homogène. Évitez les mains devant le vêtement.',
    action: 'add-item',
    actionLabel: 'Ajouter une meilleure photo',
  },
  {
    patterns: ['photo trop claire', 'photo blanche', 'vetement invisible', 'photo sombre', 'mauvais rendu'],
    text: 'Reprenez la photo avec une lumière naturelle, sans flash direct. Utilisez un fond qui contraste avec le vêtement : foncé pour une pièce claire, clair pour une pièce foncée. Gardez toute la pièce dans le cadre.',
    action: 'add-item',
    actionLabel: 'Changer la photo',
  },
  {
    patterns: ['categorie', 'haut ou bas', 'type de vetement', 'mauvaise categorie'],
    text: 'La catégorie sert à la génération des tenues. Choisissez celle qui décrit la pièce principale. Une combinaison entière peut être classée dans « Robe » ; un blazer dans « Veste / manteau ».',
    action: 'add-item',
    actionLabel: 'Choisir la catégorie',
  },
  {
    patterns: ['nom automatique', 'couleur automatique', 'analyse automatique', 'reconnaitre le vetement'],
    text: 'Après la photo, l’analyse peut proposer un nom et une couleur. Vous pouvez laisser le nom vide ou le corriger avant l’ajout. Une description précise améliore ensuite la recherche et les suggestions.',
    action: 'add-item',
    actionLabel: 'Analyser une pièce',
  },
  {
    patterns: ['impossible d ajouter', 'ajout impossible', 'piece ne s ajoute pas', 'article ne se met pas', 'erreur ajout'],
    text: 'Vérifiez le réseau puis réessayez sans fermer la fenêtre. Si l’erreur persiste, changez la photo pour une image plus légère et assurez-vous qu’une catégorie est sélectionnée. Vos informations saisies sont conservées.',
    action: 'add-item',
    actionLabel: 'Réessayer l’ajout',
  },
  {
    patterns: ['ajouter un vetement', 'ajouter une piece', 'nouveau vetement', 'nouvelle piece', 'importer une photo', 'prendre une photo'],
    text: 'Touchez le bouton +, choisissez la catégorie, puis prenez une photo ou sélectionnez-la dans votre galerie. Vérifiez le résultat, ajoutez éventuellement un nom et validez « Ajouter au dressing ».',
    action: 'add-item',
    actionLabel: 'Ajouter une pièce',
  },
  {
    patterns: ['modifier une piece', 'modifier un vetement', 'changer le nom de la piece', 'corriger une piece'],
    text: 'Ouvrez Dressing puis touchez la pièce concernée. Sa fiche vous permet de consulter ses informations et d’effectuer les changements disponibles.',
    action: 'wardrobe',
    actionLabel: 'Ouvrir le dressing',
  },
  {
    patterns: ['supprimer une piece', 'supprimer un vetement', 'effacer un article', 'retirer une piece'],
    text: 'Dans Dressing, ouvrez la fiche de la pièce puis choisissez la suppression. Vérifiez qu’il s’agit de la bonne photo : une suppression synchronisée s’applique aussi aux autres appareils.',
    action: 'wardrobe',
    actionLabel: 'Choisir une pièce',
  },
  {
    patterns: ['rechercher', 'trouver une piece', 'filtrer', 'voir mes hauts', 'voir mes bas', 'voir mes chaussures', 'mes chaussures'],
    text: 'Dans Dressing, utilisez la barre de recherche ou les boutons Hauts, Bas, Chaussures, Vestes, Accessoires et Robes. Le compteur indique combien de pièces correspondent à chaque catégorie.',
    action: 'wardrobe',
    actionLabel: 'Rechercher une pièce',
  },
  {
    patterns: ['piece oubliee', 'moins portee', 'a redecouvrir', 'rotation du dressing', 'comprendre la rotation'],
    text: 'Les pièces « à redécouvrir » sont celles que vous portez le moins. Elles sont prioritaires dans certaines suggestions afin de mieux faire tourner votre garde-robe.',
    action: 'wardrobe',
    actionLabel: 'Voir les pièces à redécouvrir',
  },
  {
    patterns: ['pas assez de pieces', 'generation impossible', 'ne peut pas generer', 'bouton generer'],
    text: 'Pour composer une tenue, ajoutez des catégories compatibles : généralement au moins un haut et un bas, ou une robe. Des chaussures et accessoires permettent d’obtenir des propositions plus complètes.',
    action: 'wardrobe',
    actionLabel: 'Compléter le dressing',
  },
  {
    patterns: ['meteo', 'temperature', 'pluie', 'fait froid', 'fait chaud', 'localisation'],
    text: 'Dans Générer, la météo réelle aide à adapter les propositions à la température et aux conditions du jour. Autorisez la localisation si elle est demandée, puis précisez vos besoins dans le champ facultatif.',
    action: 'generate',
    actionLabel: 'Générer avec la météo',
  },
  {
    patterns: ['saison', 'ete', 'hiver', 'printemps', 'automne'],
    text: 'La saison est détectée automatiquement selon la date. La génération privilégie les pièces compatibles, tout en tenant compte de la météo réelle pour éviter une suggestion trop chaude ou trop légère.',
    action: 'generate',
    actionLabel: 'Créer une tenue de saison',
  },
  {
    patterns: ['occasion', 'travail', 'soiree', 'rendez vous', 'sport', 'habille'],
    text: 'Dans Générer, sélectionnez Quotidien, Travail, Soirée, Sport, Rendez-vous ou Habillé. Vous pouvez ajouter une précision comme « entretien important » ou « dîner en extérieur ».',
    action: 'generate',
    actionLabel: 'Choisir une occasion',
  },
  {
    patterns: ['precision', 'champ facultatif', 'description de tenue', 'demande particuliere'],
    text: 'Le champ « Une précision ? » sert à ajouter le contexte : température ressentie, couleur souhaitée, niveau d’élégance ou événement. Écrivez une phrase courte et concrète.',
    action: 'generate',
    actionLabel: 'Ajouter une précision',
  },
  {
    patterns: ['regenerer', 'autres tenues', 'autre proposition', 'changer les suggestions'],
    text: 'Touchez « Régénérer » pour obtenir de nouvelles associations avec les mêmes critères. Vous pouvez aussi changer l’occasion ou votre précision avant de relancer la génération.',
    action: 'generate',
    actionLabel: 'Régénérer des tenues',
  },
  {
    patterns: ['generer une tenue', 'creer une tenue', 'idee de tenue', 'quoi porter', 'rien a me mettre'],
    text: 'Ouvrez Générer, choisissez l’occasion, ajoutez une précision si besoin puis touchez « Générer 3 tenues ». La saison, la météo et la rotation de votre dressing participent au choix.',
    action: 'generate',
    actionLabel: 'Créer une tenue',
  },
  {
    patterns: ['porter aujourd hui', 'enregistrer une tenue', 'enregistrer ce que je porte', 'marquer comme portee'],
    text: 'Ouvrez une proposition générée puis touchez « Porter aujourd’hui ». Elle sera enregistrée à la date du jour et les statistiques des pièces utilisées seront mises à jour.',
    action: 'generate',
    actionLabel: 'Choisir une tenue',
  },
  {
    patterns: ['historique vide', 'aucune tenue portee', 'remplir l historique'],
    text: 'L’historique reste vide tant qu’aucune proposition n’a été marquée « Porter aujourd’hui ». Générez une tenue, sélectionnez celle portée puis revenez dans Historique.',
    action: 'generate',
    actionLabel: 'Générer une première tenue',
  },
  {
    patterns: ['historique', 'calendrier', 'anciennes tenues', 'tenues portees'],
    text: 'Historique rassemble vos tenues portées jour après jour. Utilisez-le pour retrouver une association, suivre la rotation du dressing et éviter de répéter trop vite la même tenue.',
    action: 'history',
    actionLabel: 'Ouvrir l’historique',
  },
  {
    patterns: ['nom du dressing', 'dressing de qui', 'personnaliser mon dressing', 'changer mon profil'],
    text: 'Dans Profil, renseignez votre nom dans « Le dressing de qui ? » puis enregistrez. Ce nom personnalise l’application sur tous les appareils après synchronisation.',
    action: 'profile',
    actionLabel: 'Personnaliser le dressing',
  },
  {
    patterns: ['mode sombre', 'mode clair', 'theme', 'couleur de l application'],
    text: 'Le Dressing suit automatiquement le thème clair ou sombre choisi dans les réglages de votre téléphone ou ordinateur. Modifiez le thème du système puis rouvrez l’application si nécessaire.',
  },
  {
    patterns: ['installer sur iphone', 'installer sur telephone', 'installer sur mon iphone', 'installer sur mon telephone', 'ecran d accueil', 'telecharger l application', 'pwa'],
    text: 'Sur iPhone, ouvrez le site dans Safari, touchez Partager puis « Sur l’écran d’accueil ». Lancez ensuite Le Dressing depuis sa nouvelle icône, comme une application classique.',
    action: 'profile',
    actionLabel: 'Voir l’installation',
  },
  {
    patterns: ['mettre a jour', 'ancienne version', 'nouvelle version', 'actualiser l application'],
    text: 'Fermez complètement l’application puis rouvrez-la avec une connexion internet. Si l’ancienne version reste affichée, ouvrez le site dans Safari, actualisez-le, puis relancez l’application installée.',
  },
  {
    patterns: ['photos privees', 'confidentialite', 'mes donnees', 'securite', 'qui voit mes vetements'],
    text: 'Vos vêtements sont associés à votre compte. Utilisez un mot de passe unique, ne partagez jamais un lien de réinitialisation et déconnectez-vous des appareils qui ne vous appartiennent pas.',
    action: 'profile',
    actionLabel: 'Vérifier mon compte',
  },
  {
    patterns: ['gratuit', 'prix', 'abonnement', 'payer'],
    text: 'Les fonctions actuellement présentes dans Le Dressing sont utilisables sans abonnement dans cette version. Certaines fonctions d’IA avancée pourraient plus tard nécessiter un quota clairement indiqué.',
  },
  {
    patterns: ['que peux tu faire', 'comment ca marche', 'a quoi tu sers', 'tes fonctionnalites'],
    text: 'Je peux vous guider pour le compte, les photos, le détourage, le dressing, la génération de tenues, la météo, l’historique, le profil, l’installation et la synchronisation entre appareils. Posez votre question comme à un ami.',
  },
]

const SMALL_TALK: HelpIntent[] = [
  {
    patterns: ['merci', 'merci beaucoup', 'top merci', 'super merci', 'nickel'],
    text: 'Avec plaisir ! Je reste ouvert si vous avez une autre question.',
  },
  {
    patterns: ['au revoir', 'a bientot', 'bye', 'a plus tard'],
    text: 'À bientôt ! Revenez quand vous voulez, je suis toujours dans le coin.',
  },
  {
    patterns: ['ca va', 'comment vas tu', 'tu vas bien'],
    text: 'Je vais très bien, merci de demander ! Et vous, votre dressing se porte bien ?',
  },
  {
    patterns: ['ok', 'd accord', 'parfait', 'super', 'nickel merci', 'compris'],
    text: 'Parfait ! Dites-moi si une autre question se présente.',
  },
  {
    patterns: ['tu es qui', 'qui es tu', 't es qui', 'es tu une intelligence artificielle', 'es tu un robot'],
    text: 'Je suis l’assistant intégré au Dressing : je connais toutes les fonctions de l’application et je suis là pour vous guider dedans, à tout moment.',
  },
]

const GREETINGS = ['bonjour', 'salut', 'hello', 'bonsoir', 'coucou', 'hey']

const CONTEXT_FALLBACKS: Record<HelpContext, HelpReply> = {
  wardrobe: {
    text: 'Vous êtes dans Dressing. Je peux vous aider à ajouter, rechercher, modifier ou supprimer une pièce, ou à comprendre les pièces « à redécouvrir ».',
    action: 'add-item',
    actionLabel: 'Ajouter une pièce',
  },
  generate: {
    text: 'Vous êtes dans Générer. Je peux vous aider à choisir une occasion, utiliser la météo, compléter les catégories manquantes ou enregistrer une tenue portée.',
    action: 'generate',
    actionLabel: 'Rester sur Générer',
  },
  history: {
    text: 'Vous êtes dans Historique. Je peux vous expliquer comment enregistrer une tenue portée, lire le calendrier ou améliorer la rotation de votre dressing.',
    action: 'history',
    actionLabel: 'Voir l’historique',
  },
  profile: {
    text: 'Vous êtes dans Profil. Je peux vous aider avec le nom du dressing, l’installation, la synchronisation, la session ou la déconnexion.',
    action: 'profile',
    actionLabel: 'Rester sur Profil',
  },
}

const SUGGESTIONS: Record<HelpContext, string[]> = {
  wardrobe: ['Ajouter un vêtement', 'Améliorer le détourage', 'Rechercher une pièce', 'Synchroniser mon Mac'],
  generate: ['Générer une tenue', 'Utiliser la météo', 'Le bouton Générer est bloqué', 'Enregistrer une tenue portée'],
  history: ['Remplir l’historique', 'Enregistrer une tenue', 'Comprendre la rotation', 'Voir mes anciennes tenues'],
  profile: ['Synchroniser mon Mac', 'Changer le nom du dressing', 'Installer sur iPhone', 'Session expirée'],
}

export function getHelpSuggestions(context: HelpContext): string[] {
  return SUGGESTIONS[context]
}

export function getHelpContextLabel(context: HelpContext): string {
  return ({ wardrobe: 'Dressing', generate: 'Générer', history: 'Historique', profile: 'Profil' })[context]
}

const CONFIDENCE_THRESHOLD = 1.4

export function answerHelpQuestion(value: string, context: HelpContext = 'wardrobe', profileName?: string): HelpReply {
  const question = normalizeQuestion(value)
  const tokens = tokenize(question)
  const name = profileName?.trim()

  if (!question) return CONTEXT_FALLBACKS[context]

  if (GREETINGS.some((greeting) => question.includes(greeting) || tokens.some((token) => wordMatches(greeting, token)))) {
    return {
      text: name
        ? `Bonjour ${name} ! Je peux vous guider pour le compte, les photos, le dressing, la génération de tenues, la météo, l’historique ou la synchronisation. Que puis-je faire pour vous ?`
        : 'Bonjour ! Je peux vous guider pour le compte, les photos, le détourage, le dressing, la génération, la météo, l’historique, le profil, l’installation et la synchronisation entre appareils.',
    }
  }

  for (const smallTalk of SMALL_TALK) {
    if (bestScoreForIntent(smallTalk, question, tokens) >= CONFIDENCE_THRESHOLD) {
      const { patterns: _patterns, ...reply } = smallTalk
      return reply
    }
  }

  let bestIntent: HelpIntent | null = null
  let bestScore = 0
  let secondBestIntent: HelpIntent | null = null

  for (const intent of INTENTS) {
    const score = bestScoreForIntent(intent, question, tokens)
    if (score > bestScore) {
      secondBestIntent = bestIntent
      bestScore = score
      bestIntent = intent
    } else if (score > 0 && score === bestScore && !bestIntent) {
      bestIntent = intent
    }
  }

  if (bestIntent && bestScore >= CONFIDENCE_THRESHOLD) {
    const { patterns: _patterns, ...reply } = bestIntent
    return reply
  }

  if (['aide', 'je suis perdu', 'je ne comprends pas', 'quoi faire ici'].some((pattern) => question.includes(pattern))) {
    return CONTEXT_FALLBACKS[context]
  }

  if (bestIntent && bestScore > 0) {
    const hint = secondBestIntent && secondBestIntent !== bestIntent
      ? ` Ou peut-être plutôt : « ${secondBestIntent.text.split('.')[0]} » ?`
      : ''
    return {
      text: `Je ne suis pas totalement certain de comprendre, mais vous parlez peut-être de ceci : ${bestIntent.text}${hint}`,
      action: bestIntent.action,
      actionLabel: bestIntent.actionLabel,
    }
  }

  return {
    text: `Je n’ai pas encore reconnu cette demande. Sur la page ${getHelpContextLabel(context)}, je peux vous guider étape par étape. Essayez une question courte comme « Comment ajouter un vêtement ? », « Pourquoi la génération est bloquée ? » ou « Comment synchroniser mon Mac ? ».`,
  }
}
