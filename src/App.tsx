import {
  BriefcaseBusiness,
  Camera,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Download,
  Dumbbell,
  Gem,
  Grid2X2,
  Heart,
  House,
  ImagePlus,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { BrandMark } from './components/BrandMark'
import { ClothingPhoto } from './components/ClothingPhoto'
import { OutfitBoard } from './components/OutfitBoard'
import { Sheet } from './components/Sheet'
import { daysSince, formatLastWorn } from './lib/dates'
import {
  createLocalAccount,
  getLocalSession,
  LocalAuthError,
  signInLocalAccount,
  signOutLocalAccount,
} from './lib/local-auth'
import {
  CATEGORY_LABELS,
  CATEGORY_LABELS_SINGULAR,
  OCCASION_LABELS,
  sortByLeastRecentlyWorn,
} from './lib/wardrobe-utils'
import { useWardrobeStore } from './lib/use-wardrobe-store'
import { wardrobeStore } from './lib/wardrobe-store'
import { wardrobeApi } from './lib/wardrobe-api'
import {
  isSupabaseConfigured,
  loadRemoteWardrobe,
  sendWelcomeEmail,
  signedPhotoUrl,
  supabase,
  uploadClothingPhoto,
} from './lib/supabase-client'
import {
  CLOTHING_CATEGORIES,
  type ClothingCategory,
  type ClothingItem,
  type Occasion,
  type OutfitSuggestion,
} from './types'

type AppView = 'wardrobe' | 'generate'
type SortMode = 'rotation' | 'recent' | 'worn'
type CategoryFilter = ClothingCategory | 'all'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const OCCASION_OPTIONS: Array<{
  value: Occasion
  label: string
  shortLabel: string
  icon: LucideIcon
}> = [
  { value: 'quotidien', label: 'Quotidien', shortLabel: 'Quotidien', icon: House },
  { value: 'travail', label: 'Travail', shortLabel: 'Travail', icon: BriefcaseBusiness },
  { value: 'soiree', label: 'Soirée', shortLabel: 'Soirée', icon: Sparkles },
  { value: 'sport', label: 'Sport', shortLabel: 'Sport', icon: Dumbbell },
  { value: 'rendez_vous', label: 'Rendez-vous', shortLabel: 'Rendez-vous', icon: Heart },
  { value: 'habille', label: 'Événement habillé', shortLabel: 'Habillé', icon: Gem },
]

const CATEGORY_FILTERS: Array<{ value: CategoryFilter; label: string }> = [
  { value: 'all', label: 'Tout' },
  ...CLOTHING_CATEGORIES.map((category) => ({
    value: category,
    label: CATEGORY_LABELS[category],
  })),
]

function itemStatus(item: ClothingItem) {
  const elapsed = daysSince(item.lastWornAt)
  if (elapsed === null) return { label: 'Jamais portée', short: 'Jamais', tone: 'forgotten' }
  if (elapsed === 0) return { label: 'Portée aujourd’hui', short: 'Aujourd’hui', tone: 'fresh' }
  if (elapsed === 1) return { label: 'Portée hier', short: 'Hier', tone: 'fresh' }
  return {
    label: `Portée il y a ${elapsed} jours`,
    short: `${elapsed} j.`,
    tone: elapsed >= 30 ? 'forgotten' : 'neutral',
  }
}

function sortItems(items: ClothingItem[], mode: SortMode) {
  if (mode === 'rotation') return sortByLeastRecentlyWorn(items)
  if (mode === 'worn') return [...items].sort((a, b) => b.wearCount - a.wearCount)
  return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Lecture impossible'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Ce fichier n’est pas une image.')
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 800 / bitmap.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Compression indisponible')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return canvas.toDataURL('image/jpeg', 0.72)
  } catch {
    return fileAsDataUrl(file)
  }
}

function pluralPieces(count: number) {
  return `${count} ${count > 1 ? 'pièces' : 'pièce'}`
}

function rediscoveryHeadline(count: number) {
  return count === 1
    ? '1 pièce n’attend que vous.'
    : `${count} pièces n’attendent que vous.`
}

function formatToday(date: Date) {
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
  return `${formatted.charAt(0).toLocaleUpperCase('fr')}${formatted.slice(1)}`
}

interface LoginScreenProps {
  onLogin: (email: string, password: string, createAccount: boolean) => Promise<string | null>
  onGoogle: () => Promise<string | null>
  onResetPassword: (email: string) => Promise<string>
}

function LoginScreen({ onLogin, onGoogle, onResetPassword }: LoginScreenProps) {
  const [createAccount, setCreateAccount] = useState(false)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setAuthError('')
    const error = await onLogin(email, password, createAccount)
    if (error) setAuthError(error)
    setBusy(false)
  }

  const continueWithGoogle = async () => {
    setBusy(true)
    setAuthError('')
    const error = await onGoogle()
    if (error) setAuthError(error)
    setBusy(false)
  }

  const resetPassword = async () => {
    setAuthError(await onResetPassword(email))
  }

  return (
    <main className="auth-shell">
      <section className="auth-editorial" aria-label="Présentation">
        <BrandMark inverse />
        <div className="auth-quote">
          <p className="eyebrow eyebrow--light">Votre garde-robe, mieux portée</p>
          <h1>
            Trois idées.<br />
            <em>Une décision en moins.</em>
          </h1>
          <p>Retrouvez les pièces oubliées et composez le matin avec ce que vous possédez déjà.</p>
        </div>
        <div className="auth-collage" aria-hidden="true">
          <div className="auth-crop auth-crop--one" />
          <div className="auth-crop auth-crop--two" />
          <div className="auth-crop auth-crop--three" />
        </div>
      </section>

      <section className="auth-form-wrap">
        <div className="auth-form-card">
          <div className="auth-mobile-brand"><BrandMark /></div>
          <p className="eyebrow">Heureux de vous revoir</p>
          <h2>{createAccount ? 'Créer votre dressing' : 'Entrez dans votre dressing'}</h2>
          <p className="auth-intro">
            {createAccount
              ? 'Quelques secondes suffisent pour commencer.'
              : 'Vos vêtements vous attendent.'}
          </p>

          <div className="auth-tabs" role="tablist" aria-label="Type de compte">
            <button
              role="tab"
              aria-selected={!createAccount}
              className={!createAccount ? 'is-active' : ''}
              onClick={() => setCreateAccount(false)}
            >
              Se connecter
            </button>
            <button
              role="tab"
              aria-selected={createAccount}
              className={createAccount ? 'is-active' : ''}
              onClick={() => setCreateAccount(true)}
            >
              Créer un compte
            </button>
          </div>

          <form onSubmit={submit}>
            <label className="field-label" htmlFor="email">Adresse e-mail</label>
            <input className="text-field" id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@exemple.fr" required />
            <div className="password-label-row">
              <label className="field-label" htmlFor="password">Mot de passe</label>
              {!createAccount && <button type="button" className="text-link" onClick={resetPassword}>Mot de passe oublié ?</button>}
            </div>
            <input className="text-field" id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8 caractères minimum" minLength={8} required />
            <button className="primary-button auth-submit" type="submit" disabled={busy} aria-busy={busy}>
              {busy ? 'Un instant…' : createAccount ? 'Créer mon compte' : 'Se connecter'}
              {!busy && <ChevronRight size={18} />}
            </button>
          </form>
          {authError && <p className="form-error auth-error" role="alert">{authError}</p>}
          {isSupabaseConfigured && (
            <>
              <div className="auth-divider"><span>ou</span></div>
              <button className="secondary-button google-button" type="button" onClick={continueWithGoogle} disabled={busy}>
                <span aria-hidden="true" className="google-g">G</span>
                Continuer avec Google
              </button>
            </>
          )}
          <p className="demo-note">
            {isSupabaseConfigured
              ? 'Connexion sécurisée par Supabase. Vos photos restent dans un espace privé.'
              : 'Compte protégé sur cet appareil. Chaque compte conserve son propre dressing et sa session.'}
          </p>
        </div>
      </section>
    </main>
  )
}

function ClothingCard({ item, onOpen }: { item: ClothingItem; onOpen: () => void }) {
  const status = itemStatus(item)
  return (
    <button className="clothing-card" onClick={onOpen} aria-label={`${item.name ?? 'Pièce sans nom'}, ${status.label}`}>
      <div className="clothing-card-image">
        <OutfitBoard items={[item]} lookNumber={0} variant="garment" />
        <span className={`worn-badge worn-badge--${status.tone}`}>
          <Clock3 size={12} />
          <span className="worn-badge-full">{status.label}</span>
          <span className="worn-badge-short">{status.short}</span>
        </span>
      </div>
      <span className="clothing-card-copy">
        <span className="clothing-card-category">{CATEGORY_LABELS_SINGULAR[item.category]}</span>
        <strong>{item.name ?? `${CATEGORY_LABELS_SINGULAR[item.category]} sans nom`}</strong>
        <small>{item.colorDominant ?? 'Couleur à analyser'}</small>
      </span>
    </button>
  )
}

function App() {
  const state = useWardrobeStore()
  const initialLocalSession = getLocalSession()
  const [authenticated, setAuthenticated] = useState(() => !isSupabaseConfigured && Boolean(initialLocalSession))
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => initialLocalSession?.userId ?? null)
  const [currentEmail, setCurrentEmail] = useState<string | null>(() => initialLocalSession?.email ?? null)
  const [view, setView] = useState<AppView>('wardrobe')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('rotation')
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [editItem, setEditItem] = useState(false)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState<ClothingCategory>('haut')
  const [addCategory, setAddCategory] = useState<ClothingCategory>('haut')
  const [addName, setAddName] = useState('')
  const [photoData, setPhotoData] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [savingItem, setSavingItem] = useState(false)
  const [addError, setAddError] = useState('')
  const [occasion, setOccasion] = useState<Occasion>(state.selectedOccasion)
  const [note, setNote] = useState('')
  const [generating, setGenerating] = useState(false)
  const [wearCandidate, setWearCandidate] = useState<OutfitSuggestion | null>(null)
  const [toast, setToast] = useState('')
  const [today, setToday] = useState(() => new Date())
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(() => {
    const standaloneNavigator = navigator as Navigator & { standalone?: boolean }
    return window.matchMedia('(display-mode: standalone)').matches || standaloneNavigator.standalone === true
  })
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const installPrompt = useRef<InstallPromptEvent | null>(null)
  const storagePaths = useRef(new Map<string, string>())
  const activeUser = useRef<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    const supabaseClient = supabase
    let active = true

    const applySession = async (userId: string | null) => {
      if (!active) return
      if (userId !== activeUser.current) {
        wardrobeStore.clear()
        storagePaths.current.clear()
        activeUser.current = userId
      }
      setCurrentUserId(userId)
      setAuthenticated(Boolean(userId))
      if (userId) {
        const { data } = await supabaseClient.auth.getUser()
        if (active) setCurrentEmail(data.user?.email ?? null)
        if (data.user && active) {
          const paths = await loadRemoteWardrobe(data.user)
          if (active) storagePaths.current = paths
          void sendWelcomeEmail().catch(() => undefined)
        }
      }
      if (!userId && active) setCurrentEmail(null)
      if (active) setAuthLoading(false)
    }

    void supabaseClient.auth.getSession().then(({ data }) => applySession(data.session?.user.id ?? null))
    const { data: subscription } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      void applySession(session?.user.id ?? null)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const refreshDate = () => setToday((current) => {
      const next = new Date()
      return current.toDateString() === next.toDateString() ? current : next
    })
    const interval = window.setInterval(refreshDate, 60_000)
    window.addEventListener('focus', refreshDate)
    document.addEventListener('visibilitychange', refreshDate)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshDate)
      document.removeEventListener('visibilitychange', refreshDate)
    }
  }, [])

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault()
      installPrompt.current = event as InstallPromptEvent
      setCanInstall(true)
    }
    const handleInstalled = () => {
      installPrompt.current = null
      setCanInstall(false)
      setIsInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const stats = wardrobeStore.getStats()
  const displayName = currentEmail
    ? `${currentEmail.split('@')[0]?.charAt(0).toLocaleUpperCase('fr')}${currentEmail.split('@')[0]?.slice(1)}`
    : 'Élise'
  const displayInitials = displayName
    .split(/[\s._-]+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toLocaleUpperCase('fr') || 'EP'
  const selectedItem = state.items.find((item) => item.id === selectedItemId) ?? null
  const canGenerate = state.items.some((item) => item.category === 'robe') || (
    state.items.some((item) => item.category === 'haut') &&
    state.items.some((item) => item.category === 'bas')
  )

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('fr')
    const filtered = state.items.filter((item) => {
      if (category !== 'all' && item.category !== category) return false
      if (!normalized) return true
      return `${item.name ?? ''} ${item.colorDominant ?? ''} ${CATEGORY_LABELS[item.category]}`
        .toLocaleLowerCase('fr')
        .includes(normalized)
    })
    return sortItems(filtered, sortMode)
  }, [category, query, sortMode, state.items])

  const visibleGroups = useMemo(() => {
    const categories = category === 'all' ? CLOTHING_CATEGORIES : [category]
    return categories
      .map((groupCategory) => ({
        category: groupCategory,
        items: visibleItems.filter((item) => item.category === groupCategory),
      }))
      .filter((group) => group.items.length > 0)
  }, [category, visibleItems])

  const rediscoveryItems = sortByLeastRecentlyWorn(state.items).slice(0, 3)

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }

  const startEmergencyLook = () => {
    setOccasion('quotidien')
    wardrobeStore.setOccasion('quotidien')
    setNote('Je veux une tenue simple, flatteuse et facile à porter aujourd’hui.')
    setView('generate')
  }

  const shareOutfit = async (suggestion: OutfitSuggestion, items: ClothingItem[]) => {
    const text = `${suggestion.name} — ${items.map((item) => item.name).join(', ')}. Créée avec Le Dressing.`
    try {
      if (navigator.share) await navigator.share({ title: suggestion.name, text, url: window.location.href })
      else {
        await navigator.clipboard.writeText(`${text} ${window.location.href}`)
        showToast('Tenue copiée, prête à partager.')
      }
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') showToast('Partage indisponible pour le moment.')
    }
  }

  const installApplication = async () => {
    if (installPrompt.current) {
      await installPrompt.current.prompt()
      const choice = await installPrompt.current.userChoice
      if (choice.outcome === 'accepted') {
        setCanInstall(false)
        showToast('Installation de l’application lancée.')
      }
      return
    }

    const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    showToast(
      isAppleMobile
        ? 'Dans Safari : Partager, puis « Sur l’écran d’accueil ». '
        : 'Ouvrez le menu du navigateur, puis choisissez « Installer l’application ».',
    )
  }

  const openItem = (item: ClothingItem) => {
    setSelectedItemId(item.id)
    setEditItem(false)
    setEditName(item.name ?? '')
    setEditCategory(item.category)
  }

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setPhotoBusy(true)
    setAddError('')
    try {
      setPhotoData(await compressPhoto(file))
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Impossible de lire cette photo.')
    } finally {
      setPhotoBusy(false)
      event.target.value = ''
    }
  }

  const resetAdd = () => {
    setPhotoData('')
    setAddName('')
    setAddCategory('haut')
    setAddError('')
  }

  const saveItem = async () => {
    if (!photoData) {
      setAddError('Ajoute une photo avant de continuer.')
      return
    }
    setSavingItem(true)
    setAddError('')
    let uploadedPath: string | null = null
    try {
      if (supabase && currentUserId) {
        uploadedPath = await uploadClothingPhoto(photoData, currentUserId)
        const created = await wardrobeApi.createItem({
          userId: currentUserId,
          photoUrl: uploadedPath,
          category: addCategory,
          name: addName.trim() || null,
          colorDominant: null,
        })
        if (wardrobeApi.lastRemoteError) {
          wardrobeStore.removeItem(created.id)
          throw wardrobeApi.lastRemoteError
        }

        const analysis = await wardrobeApi.analyzeClothing(uploadedPath, addCategory)
        const analysisSucceeded = !wardrobeApi.lastRemoteError
        if (analysisSucceeded) {
          await wardrobeApi.updateItem(created.id, {
            colorDominant: analysis.couleurDominante,
            name: addName.trim() || analysis.nomSuggere,
          })
        }

        storagePaths.current.set(created.id, uploadedPath)
        try {
          wardrobeStore.updateItem(created.id, { photoUrl: await signedPhotoUrl(uploadedPath) })
        } catch {
          wardrobeStore.updateItem(created.id, { photoUrl: photoData })
        }

        setAddOpen(false)
        resetAdd()
        showToast(
          analysisSucceeded
            ? 'Pièce ajoutée et analysée.'
            : 'Pièce ajoutée. L’analyse automatique pourra être relancée plus tard.',
        )
      } else {
        wardrobeStore.addItem({
          photoUrl: photoData,
          category: addCategory,
          name: addName.trim() || `${CATEGORY_LABELS_SINGULAR[addCategory]} sans nom`,
          colorDominant: null,
        })
        setAddOpen(false)
        resetAdd()
        showToast('Pièce ajoutée à votre dressing.')
      }
    } catch {
      if (uploadedPath && supabase) {
        await supabase.storage.from('clothing-photos').remove([uploadedPath])
      }
      setAddError('Impossible d’ajouter cette pièce. Vos informations ont été conservées.')
    } finally {
      setSavingItem(false)
    }
  }

  const saveEdit = async () => {
    if (!selectedItem) return
    const patch = {
      name: editName.trim() || `${CATEGORY_LABELS_SINGULAR[editCategory]} sans nom`,
      category: editCategory,
    }
    try {
      if (supabase && currentUserId) await wardrobeApi.updateItem(selectedItem.id, patch)
      else wardrobeStore.updateItem(selectedItem.id, patch)
      setEditItem(false)
      showToast('Modifications enregistrées.')
    } catch {
      showToast('Impossible d’enregistrer ces modifications pour le moment.')
    }
  }

  const deleteSelected = async () => {
    if (!selectedItem) return
    if (!window.confirm('Supprimer cette pièce ? Cette action est irréversible.')) return
    try {
      const storagePath = storagePaths.current.get(selectedItem.id)
      if (supabase && currentUserId) {
        await wardrobeApi.deleteItem(selectedItem.id)
        if (storagePath) {
          const { error } = await supabase.storage.from('clothing-photos').remove([storagePath])
          if (error) showToast('Pièce supprimée. Le nettoyage de la photo devra être relancé.')
        }
      } else {
        wardrobeStore.removeItem(selectedItem.id)
      }
      storagePaths.current.delete(selectedItem.id)
      setSelectedItemId(null)
      showToast('Pièce supprimée du dressing.')
    } catch {
      showToast('Impossible de supprimer cette pièce pour le moment.')
    }
  }

  const generate = async () => {
    if (!canGenerate || generating) return
    setGenerating(true)
    try {
      if (!supabase) await new Promise((resolve) => window.setTimeout(resolve, 850))
      await wardrobeApi.generateOutfits({
        userId: currentUserId ?? state.userId,
        occasion,
        note,
        items: state.items,
      })
      if (wardrobeApi.lastRemoteError) {
        showToast('Service IA indisponible : propositions locales affichées.')
      }
    } catch {
      showToast('Impossible de générer vos tenues pour le moment.')
    } finally {
      setGenerating(false)
    }
  }

  const confirmWear = async () => {
    if (!wearCandidate) return
    try {
      await wardrobeApi.markOutfitWorn(wearCandidate)
      setWearCandidate(null)
      showToast('Tenue enregistrée comme portée aujourd’hui.')
    } catch {
      showToast('Impossible d’enregistrer cette tenue. Réessayez.')
    }
  }

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut()
    else {
      signOutLocalAccount()
      wardrobeStore.switchToGuest()
    }
    setCurrentUserId(null)
    setCurrentEmail(null)
    setAccountOpen(false)
    setAuthenticated(false)
  }

  const signIn = async (email: string, password: string, createAccount: boolean) => {
    if (!supabase) {
      try {
        const session = createAccount
          ? await createLocalAccount(email, password)
          : await signInLocalAccount(email, password)
        wardrobeStore.switchToAccount(session.userId)
        setCurrentUserId(session.userId)
        setCurrentEmail(session.email)
        setAuthenticated(true)
        if (createAccount) showToast(`Bonjour ${session.email.split('@')[0]}, votre dressing est prêt.`)
        return null
      } catch (error) {
        return error instanceof LocalAuthError
          ? error.message
          : 'Impossible d’ouvrir ce compte sur cet appareil.'
      }
    }
    const result = createAccount
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    if (result.error) return 'Impossible de vous connecter. Vérifiez vos informations et réessayez.'
    if (createAccount && !result.data.session) {
      return 'Compte créé. Ouvrez le lien reçu par e-mail pour finaliser votre inscription.'
    }
    return null
  }

  const signInWithGoogle = async () => {
    if (!supabase) {
      return 'La connexion Google sera disponible après activation de la synchronisation cloud.'
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    return error ? 'La connexion Google n’a pas pu démarrer.' : null
  }

  const resetPassword = async (email: string) => {
    if (!email.trim()) return 'Saisissez d’abord votre adresse e-mail.'
    if (!supabase) {
      return 'Sur cet appareil, créez un nouveau compte si le mot de passe est perdu. La réinitialisation par e-mail nécessite la synchronisation cloud.'
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    return error
      ? 'Impossible d’envoyer l’e-mail de réinitialisation.'
      : 'Un lien de réinitialisation vient de vous être envoyé.'
  }

  if (authLoading) {
    return (
      <main className="app-loading" aria-live="polite">
        <BrandMark />
        <span className="loading-orbit"><Sparkles size={19} /></span>
        <p>Ouverture de votre dressing…</p>
      </main>
    )
  }

  if (!authenticated) {
    return <LoginScreen onLogin={signIn} onGoogle={signInWithGoogle} onResetPassword={resetPassword} />
  }

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <BrandMark />
        <nav className="desktop-nav" aria-label="Navigation principale">
          <button className={view === 'wardrobe' ? 'is-active' : ''} onClick={() => setView('wardrobe')}>
            <Grid2X2 size={19} />
            Mon dressing
            {view === 'wardrobe' && <span className="nav-dot" />}
          </button>
          <button className={view === 'generate' ? 'is-active' : ''} onClick={() => setView('generate')}>
            <WandSparkles size={19} />
            Créer une tenue
            {view === 'generate' && <span className="nav-dot" />}
          </button>
        </nav>
        <button className="sidebar-add" onClick={() => setAddOpen(true)}>
          <Plus size={19} />
          Ajouter une pièce
        </button>
        <div className="sidebar-spacer" />
        <div className="sidebar-insight">
          <span className="insight-icon"><Sparkles size={16} /></span>
          <strong>{pluralPieces(stats.neverWorn)} à découvrir</strong>
          <p>Laissez-les inspirer votre prochaine tenue.</p>
          <button onClick={() => setView('generate')}>Composer <ChevronRight size={15} /></button>
        </div>
        <button className="user-row" onClick={() => setAccountOpen(true)}>
          <span className="user-avatar">{displayInitials}</span>
          <span><strong>{displayName}</strong><small>{supabase ? 'Compte synchronisé' : 'Compte local privé'}</small></span>
          <ChevronRight size={17} />
        </button>
      </aside>

      <main className="app-main">
        <header className="mobile-header">
          <BrandMark />
        </header>

        {view === 'wardrobe' ? (
          <div className="page-content wardrobe-page">
            <header className="page-heading wardrobe-heading">
              <div>
                <p className="eyebrow">{formatToday(today)} · Votre sélection</p>
                <h1>Bonjour,</h1>
                <p className="heading-script">que porte-t-on aujourd’hui ?</p>
              </div>
              <div className="page-heading-actions">
                {!isInstalled && (
                  <button className="secondary-button install-button" onClick={installApplication}>
                    <Download size={18} /> {canInstall ? 'Installer' : 'Installer sur mobile'}
                  </button>
                )}
                <button className="secondary-button" onClick={() => setView('generate')}>
                  <WandSparkles size={18} /> Composer une tenue
                </button>
                <button className="primary-button" onClick={() => setAddOpen(true)}>
                  <Plus size={18} /> Ajouter
                </button>
              </div>
            </header>

            {state.items.length < 5 && (
              <section className="quick-start" aria-label="Démarrage rapide">
                <div className="quick-start-copy">
                  <span className="quick-start-icon"><Camera size={19} /></span>
                  <div>
                    <p className="eyebrow">Démarrage express · moins d’une minute</p>
                    <h2>Ajoutez vos 5 premières pièces</h2>
                    <p>Une photo suffit : la catégorie et les détails sont préparés automatiquement.</p>
                  </div>
                </div>
                <div className="quick-start-action">
                  <div className="quick-progress" aria-label={`${state.items.length} vêtements sur 5`}>
                    {Array.from({ length: 5 }, (_, index) => <span className={index < state.items.length ? 'is-done' : ''} key={index} />)}
                  </div>
                  <button className="primary-button" onClick={() => setAddOpen(true)}><Plus size={17} /> Ajouter la pièce {state.items.length + 1}</button>
                </div>
              </section>
            )}

            <button className="emergency-look" onClick={startEmergencyLook}>
              <span><Zap size={20} /></span>
              <span><strong>J’ai rien à me mettre</strong><small>Une tenue simple, maintenant, sans réfléchir.</small></span>
              <ChevronRight size={19} />
            </button>

            <section className="rotation-panel" aria-labelledby="rotation-title">
              <div className="rotation-copy">
                <span className="rotation-kicker"><Sparkles size={15} /> Rotation du dressing</span>
                <h2 id="rotation-title">
                  {stats.neverWorn > 0 ? rediscoveryHeadline(stats.neverWorn) : 'Votre dressing est en mouvement.'}
                </h2>
                <p>Les pièces les moins portées passent en tête de vos prochaines inspirations.</p>
                <button onClick={() => setView('generate')}>
                  Les remettre en circulation <ChevronRight size={16} />
                </button>
              </div>
              <div className="rotation-visual" aria-label="Pièces à redécouvrir">
                {rediscoveryItems.map((item, index) => (
                  <div className={`rotation-thumb rotation-thumb--${index + 1}`} key={item.id}>
                    <ClothingPhoto item={item} />
                  </div>
                ))}
                <div className="rotation-score">
                  <strong>{stats.rotationScore}%</strong>
                  <span>en rotation</span>
                </div>
              </div>
            </section>

            <section className="wardrobe-section" aria-labelledby="wardrobe-title">
              <div className="section-title-row">
                <div>
                  <p className="eyebrow">Votre collection</p>
                  <h2 id="wardrobe-title">Mon dressing <span>{state.items.length}</span></h2>
                </div>
                <div className="wardrobe-tools">
                  <label className="search-field">
                    <Search size={17} />
                    <span className="sr-only">Rechercher</span>
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une pièce" />
                  </label>
                  <label className="sort-field">
                    <SlidersHorizontal size={16} />
                    <span className="sr-only">Trier</span>
                    <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                      <option value="rotation">À redécouvrir</option>
                      <option value="recent">Ajoutées récemment</option>
                      <option value="worn">Les plus portées</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="filter-chips" role="group" aria-label="Filtrer par catégorie">
                {CATEGORY_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    className={category === filter.value ? 'is-active' : ''}
                    aria-pressed={category === filter.value}
                    onClick={() => setCategory(filter.value)}
                  >
                    {filter.label}
                    {filter.value !== 'all' && <span>{stats.categoryCounts[filter.value]}</span>}
                  </button>
                ))}
              </div>

              {visibleGroups.length > 0 ? (
                <div className="category-groups">
                  {visibleGroups.map((group) => (
                    <section className="category-group" key={group.category} aria-labelledby={`group-${group.category}`}>
                      <div className="category-group-title">
                        <h3 id={`group-${group.category}`}>{CATEGORY_LABELS[group.category]}</h3>
                        <span>{group.items.length.toString().padStart(2, '0')}</span>
                      </div>
                      <div className="clothing-grid">
                        {group.items.map((item) => (
                          <ClothingCard item={item} onOpen={() => openItem(item)} key={item.id} />
                        ))}
                        {category !== 'all' && (
                          <button className="add-tile" onClick={() => setAddOpen(true)}>
                            <span><Plus size={21} /></span>
                            Ajouter une pièce
                          </button>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <span><Shirt size={25} /></span>
                  <h3>{state.items.length ? 'Aucune pièce dans cette catégorie.' : 'Votre dressing est encore vide'}</h3>
                  <p>{state.items.length ? 'Modifiez votre recherche ou ajoutez une nouvelle pièce.' : 'Ajoutez vos vêtements pour créer vos premières tenues.'}</p>
                  <button className="primary-button" onClick={() => setAddOpen(true)}>Ajouter une pièce</button>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="page-content generate-page">
            <header className="page-heading generator-heading">
              <div>
                <p className="eyebrow">Votre styliste personnel</p>
                <h1>Créer une tenue</h1>
                <p className="page-subtitle">Trois propositions pensées uniquement avec les pièces de votre dressing.</p>
                <div className="context-pills" aria-label="Contexte des suggestions">
                  <span>Saison actuelle</span><span>Occasion</span><span>Rotation intelligente</span>
                </div>
              </div>
              <span className="ai-badge"><Sparkles size={15} /> Assisté par IA</span>
            </header>

            <div className="generator-layout">
              <section className="generator-form-card" aria-labelledby="generator-form-title">
                <div className="form-step-label"><span>01</span><p id="generator-form-title">Pour quelle occasion ?</p></div>
                <fieldset className="occasion-grid">
                  <legend className="sr-only">Choisissez une occasion</legend>
                  {OCCASION_OPTIONS.map((option) => {
                    const Icon = option.icon
                    return (
                      <label className={occasion === option.value ? 'is-active' : ''} key={option.value}>
                        <input
                          type="radio"
                          name="occasion"
                          value={option.value}
                          checked={occasion === option.value}
                          onChange={() => {
                            setOccasion(option.value)
                            wardrobeStore.setOccasion(option.value)
                          }}
                        />
                        <span className="occasion-icon"><Icon size={19} /></span>
                        <span className="occasion-label-long">{option.label}</span>
                        <span className="occasion-label-short">{option.shortLabel}</span>
                        {occasion === option.value && <Check size={15} className="occasion-check" />}
                      </label>
                    )
                  })}
                </fieldset>

                <div className="form-divider" />
                <div className="form-step-label"><span>02</span><p>Une précision ? <small>Facultatif</small></p></div>
                <textarea
                  className="note-field"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Ex. : il fait froid, j’ai un entretien important…"
                  maxLength={240}
                />
                <div className="note-meta">
                  <span><Clock3 size={14} /> Priorité aux pièces que vous portez le moins</span>
                  <small>{note.length}/240</small>
                </div>

                {!canGenerate && (
                  <div className="inline-alert" role="alert">
                    <Shirt size={18} />
                    <p>Ajoutez au moins un haut et un bas, ou une robe, pour générer une tenue.</p>
                  </div>
                )}

                <button
                  className="generate-button"
                  onClick={generate}
                  disabled={!canGenerate || generating}
                  aria-busy={generating}
                >
                  <span>{generating ? <RefreshCw className="spin" size={20} /> : <Sparkles size={20} />}</span>
                  <span>
                    <strong>{generating ? 'On compose vos tenues…' : 'Générer 3 tenues'}</strong>
                    <small>{generating ? 'Cela peut prendre quelques secondes.' : `${state.items.length} pièces disponibles`}</small>
                  </span>
                  {!generating && <ChevronRight size={19} />}
                </button>
              </section>

              <section className="generator-results" aria-live="polite" aria-busy={generating}>
                {state.suggestions.length > 0 ? (
                  <>
                    <div className="results-heading">
                      <div>
                        <p className="eyebrow">Votre sélection</p>
                        <h2>{state.suggestions.length} idées · {OCCASION_LABELS[state.selectedOccasion]}</h2>
                      </div>
                      <button className="text-link" onClick={generate} disabled={generating}>
                        <RefreshCw size={15} /> Régénérer
                      </button>
                    </div>
                    <div className="outfit-list">
                      {state.suggestions.map((suggestion, index) => {
                        const items = suggestion.itemIds
                          .map((id) => state.items.find((item) => item.id === id))
                          .filter((item): item is ClothingItem => Boolean(item))
                        const worn = state.outfits.some((outfit) => outfit.id === `worn-${suggestion.id}`)
                        return (
                          <article className="outfit-card" key={suggestion.id}>
                            <div className="outfit-number">0{index + 1}</div>
                            <OutfitBoard items={items} lookNumber={index + 1} />
                            <div className="outfit-card-body">
                              <div className="outfit-title-row">
                                <div>
                                  <span>Tenue {index + 1} sur {state.suggestions.length}</span>
                                  <h3>{suggestion.name}</h3>
                                </div>
                                <span className="source-pill"><Sparkles size={11} /> {suggestion.source === 'ai' ? 'IA' : 'Démo'}</span>
                              </div>
                              <p className="outfit-reason">{suggestion.reason}</p>
                              <ul className="outfit-items" aria-label="Pièces de cette tenue">
                                {items.map((item) => <li key={item.id}>{item.name}</li>)}
                              </ul>
                              <button
                                className={worn ? 'worn-button is-worn' : 'worn-button'}
                                onClick={() => !worn && setWearCandidate(suggestion)}
                                disabled={worn}
                              >
                                <Check size={17} /> {worn ? 'Portée aujourd’hui' : 'Porter aujourd’hui'}
                              </button>
                              <button className="share-button" onClick={() => shareOutfit(suggestion, items)}>
                                <Share2 size={16} /> Partager la tenue
                              </button>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <div className="generator-empty">
                    <div className="generator-empty-art" aria-hidden="true">
                      {rediscoveryItems.map((item, index) => (
                        <div className={`empty-art-card empty-art-card--${index + 1}`} key={item.id}>
                          <ClothingPhoto item={item} />
                        </div>
                      ))}
                      <span><Sparkles size={22} /></span>
                    </div>
                    <p className="eyebrow">Prêt quand vous l’êtes</p>
                    <h2>Votre dressing a déjà de bonnes idées.</h2>
                    <p>Choisissez une occasion : nous remettrons d’abord en lumière les pièces les plus oubliées.</p>
                    <div className="empty-metrics">
                      <span><strong>{state.items.length}</strong> pièces</span>
                      <span><strong>{stats.neverWorn}</strong> jamais portées</span>
                      <span><strong>{stats.rotationScore}%</strong> en rotation</span>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>

      <nav className="mobile-nav" aria-label="Navigation principale">
        <button className={view === 'wardrobe' ? 'is-active' : ''} onClick={() => setView('wardrobe')}>
          <Grid2X2 size={20} /><span>Dressing</span>
        </button>
        <button className="mobile-add" onClick={() => setAddOpen(true)} aria-label="Ajouter une pièce">
          <Plus size={24} />
        </button>
        <button className={view === 'generate' ? 'is-active' : ''} onClick={() => setView('generate')}>
          <WandSparkles size={20} /><span>Générer</span>
        </button>
        <button className={accountOpen ? 'is-active' : ''} onClick={() => setAccountOpen(true)} aria-label="Ouvrir le profil">
          <CircleUserRound size={20} /><span>Profil</span>
        </button>
      </nav>

      <Sheet
        open={addOpen}
        onClose={() => { setAddOpen(false); resetAdd() }}
        eyebrow="Nouvelle pièce"
        title="Ajouter au dressing"
        footer={
          <button className="primary-button full-button" onClick={saveItem} disabled={photoBusy || savingItem} aria-busy={savingItem}>
            {photoBusy ? 'Préparation de la photo…' : savingItem ? 'Envoi et analyse…' : 'Ajouter au dressing'}
            {!photoBusy && !savingItem && <ChevronRight size={18} />}
          </button>
        }
      >
        <div className="photo-advice"><Camera size={17} /><p>Photographiez une seule pièce, bien à plat, sur un fond uni.</p></div>
        {photoData ? (
          <div className="photo-preview">
            <img src={photoData} alt="Aperçu de la pièce à ajouter" />
            <button onClick={() => galleryInput.current?.click()}><RefreshCw size={16} /> Changer la photo</button>
          </div>
        ) : (
          <div className="photo-picker">
            <div className="photo-picker-icon"><ImagePlus size={26} /></div>
            <strong>{photoBusy ? 'Préparation de la photo…' : 'Ajoutez la photo de votre pièce'}</strong>
            <p>JPG, PNG ou HEIC · compressée à 800 px</p>
            <div>
              <button className="primary-button" onClick={() => cameraInput.current?.click()} disabled={photoBusy}><Camera size={17} /> Prendre une photo</button>
              <button className="secondary-button" onClick={() => galleryInput.current?.click()} disabled={photoBusy}><Upload size={17} /> Photothèque</button>
            </div>
          </div>
        )}
        <input ref={cameraInput} className="sr-only" type="file" accept="image/*" capture="environment" onChange={handlePhoto} />
        <input ref={galleryInput} className="sr-only" type="file" accept="image/*" onChange={handlePhoto} />

        <fieldset className="category-picker">
          <legend>Quelle catégorie ?</legend>
          <div>
            {CLOTHING_CATEGORIES.map((value) => (
              <label className={addCategory === value ? 'is-active' : ''} key={value}>
                <input type="radio" name="add-category" checked={addCategory === value} onChange={() => setAddCategory(value)} />
                {CATEGORY_LABELS_SINGULAR[value]}
                {addCategory === value && <Check size={14} />}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field-label" htmlFor="item-name">Nom de la pièce <span>(facultatif)</span></label>
        <input
          className="text-field"
          id="item-name"
          value={addName}
          onChange={(event) => setAddName(event.target.value)}
          placeholder="Ex. : Pull col roulé bleu marine"
        />
        <p className="ai-helper"><Sparkles size={14} /> L’analyse automatique pourra compléter son nom et sa couleur.</p>
        {addError && <p className="form-error" role="alert">{addError}</p>}
      </Sheet>

      <Sheet
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItemId(null)}
        eyebrow={selectedItem ? CATEGORY_LABELS_SINGULAR[selectedItem.category] : undefined}
        title={selectedItem?.name ?? 'Détail de la pièce'}
        footer={selectedItem && (
          editItem ? (
            <div className="split-actions">
              <button className="secondary-button" onClick={() => setEditItem(false)}>Annuler</button>
              <button className="primary-button" onClick={saveEdit}>Enregistrer</button>
            </div>
          ) : (
            <button className="secondary-button full-button" onClick={() => setEditItem(true)}>Modifier la pièce</button>
          )
        )}
      >
        {selectedItem && (
          <>
            <ClothingPhoto item={selectedItem} className="detail-photo" eager />
            {editItem ? (
              <div className="edit-form">
                <label className="field-label" htmlFor="edit-name">Nom de la pièce</label>
                <input id="edit-name" className="text-field" value={editName} onChange={(event) => setEditName(event.target.value)} />
                <fieldset className="category-picker compact-picker">
                  <legend>Catégorie</legend>
                  <div>
                    {CLOTHING_CATEGORIES.map((value) => (
                      <label className={editCategory === value ? 'is-active' : ''} key={value}>
                        <input type="radio" name="edit-category" checked={editCategory === value} onChange={() => setEditCategory(value)} />
                        {CATEGORY_LABELS_SINGULAR[value]}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            ) : (
              <>
                <div className="detail-stats">
                  <div><span>Nombre de ports</span><strong>{selectedItem.wearCount}</strong><small>{selectedItem.wearCount === 1 ? 'fois portée' : 'fois portée'}</small></div>
                  <div><span>Dernière fois</span><strong>{daysSince(selectedItem.lastWornAt) ?? '—'}</strong><small>{selectedItem.lastWornAt ? 'jours' : 'jamais portée'}</small></div>
                </div>
                <dl className="detail-list">
                  <div><dt>Catégorie</dt><dd>{CATEGORY_LABELS_SINGULAR[selectedItem.category]}</dd></div>
                  <div><dt>Couleur</dt><dd>{selectedItem.colorDominant ?? 'À analyser'}</dd></div>
                  <div><dt>Rotation</dt><dd>{formatLastWorn(selectedItem.lastWornAt)}</dd></div>
                </dl>
                <button className="danger-button" onClick={deleteSelected}><Trash2 size={17} /> Supprimer la pièce</button>
              </>
            )}
          </>
        )}
      </Sheet>

      <Sheet
        open={Boolean(wearCandidate)}
        onClose={() => setWearCandidate(null)}
        eyebrow="Confirmer le port"
        title="Vous portez cette tenue aujourd’hui ?"
        footer={
          <div className="split-actions">
            <button className="secondary-button" onClick={() => setWearCandidate(null)}>Annuler</button>
            <button className="primary-button" onClick={confirmWear}><Check size={17} /> Oui, je la porte</button>
          </div>
        }
      >
        {wearCandidate && (
          <div className="wear-confirmation">
            <div className="wear-confirmation-photos">
              {wearCandidate.itemIds.map((id) => {
                const item = state.items.find((candidate) => candidate.id === id)
                return item ? <ClothingPhoto item={item} key={id} /> : null
              })}
            </div>
            <p>Les {wearCandidate.itemIds.length} pièces de <strong>{wearCandidate.name}</strong> seront mises à jour. Cette action ne sera comptée qu’une fois.</p>
          </div>
        )}
      </Sheet>

      <Sheet open={accountOpen} onClose={() => setAccountOpen(false)} eyebrow="Votre compte" title={`Bonjour ${displayName}`}>
        <div className="account-card">
          <span className="account-avatar"><CircleUserRound size={29} /></span>
          <div><strong>{currentEmail ?? 'Compte local'}</strong><small>{supabase ? 'Synchronisé avec Supabase' : 'Dressing privé sur cet appareil'}</small></div>
        </div>
        <div className="account-stats">
          <span><strong>{state.items.length}</strong> pièces</span>
          <span><strong>{state.outfits.length}</strong> tenues portées</span>
          <span><strong>{stats.rotationScore}%</strong> en rotation</span>
        </div>
        <div className="install-card">
          <span className="install-card-icon"><Download size={22} /></span>
          <div>
            <strong>{isInstalled ? 'Application installée' : 'Installer Le Dressing'}</strong>
            <p>{isInstalled ? 'Elle est disponible depuis votre écran d’accueil.' : 'Ajoutez-la à votre téléphone et utilisez-la comme une vraie application.'}</p>
          </div>
          {!isInstalled && (
            <button className="secondary-button" onClick={installApplication}>
              {canInstall ? 'Installer' : 'Voir comment'}
            </button>
          )}
        </div>
        <button className="danger-button full-button" onClick={signOut}><LogOut size={17} /> Se déconnecter</button>
      </Sheet>

      {toast && <div className="toast" role="status"><Check size={17} /> {toast}</div>}
    </div>
  )
}

export default App
