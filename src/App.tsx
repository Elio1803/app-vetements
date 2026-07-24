import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type PanInfo,
} from 'framer-motion'
import {
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  CircleUserRound,
  CloudRain,
  CloudSun,
  Clock3,
  Download,
  Dumbbell,
  Gem,
  Grid2X2,
  Heart,
  House,
  ImagePlus,
  LogOut,
  LocateFixed,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Snowflake,
  Trash2,
  Upload,
  WandSparkles,
  WifiOff,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import {
  type ChangeEvent,
  type DragEvent,
  lazy,
  memo,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { BrandMark } from './components/BrandMark'
import { AnimatedCounter } from './components/AnimatedCounter'
import { LoginScreen, PasswordRecoveryScreen } from './components/AuthScreens'
import { ClothingPhoto } from './components/ClothingPhoto'
import { LoadingScreen } from './components/LoadingScreen'
import { Sheet } from './components/Sheet'
import { SkeletonCard } from './components/SkeletonCard'
import { cardVariants, gridVariants, screenVariants, toastVariants, TRANSITIONS } from './lib/animations'
import { daysSince, formatLastWorn } from './lib/dates'
import { generationReadinessFor, suggestedMissingCategory } from './lib/outfit-engine'
import {
  normalizeProfileName,
  PROFILE_NAME_MAX_LENGTH,
  profileNameFromEmail,
  profileNameFromMetadata,
} from './lib/profile'
import {
  createLocalAccount,
  getLocalSession,
  LocalAuthError,
  signInLocalAccount,
  signOutLocalAccount,
  updateLocalProfileName,
} from './lib/local-auth'
import {
  CATEGORY_LABELS,
  CATEGORY_LABELS_SINGULAR,
  OCCASION_LABELS,
  sortByLeastRecentlyWorn,
} from './lib/wardrobe-utils'
import { useWardrobeStore } from './lib/use-wardrobe-store'
import { useDailyDate, useIdleFeaturePrefetch, useOnlineStatus, usePwaInstall, useRotatingProgress } from './hooks/useAppSystem'
import { useCurrentWeather } from './hooks/useCurrentWeather'
import { wardrobeStore } from './lib/wardrobe-store'
import { wardrobeApi } from './lib/wardrobe-api'
import {
  normalizeWardrobeState,
  WARDROBE_STORAGE_KEY,
  wardrobeStorageKeyForAccount,
} from './lib/storage'
import { createProductPhoto, normalizePhotoForUpload } from './lib/photo-cutout'
import { weatherConditionLabel } from './lib/weather'
import {
  createRemoveBgProductPhoto,
  isGoogleAuthEnabled,
  isSupabaseConfigured,
  loadRemoteWardrobe,
  sendWelcomeEmail,
  signedPhotoUrl,
  supabase,
  syncClothingItemToCloud,
} from './lib/supabase-client'
import {
  CLOTHING_CATEGORIES,
  type ClothingCategory,
  type ClothingItem,
  type Occasion,
  type OutfitSuggestion,
} from './types'

type AppView = 'wardrobe' | 'generate' | 'history' | 'profile'
type SortMode = 'rotation' | 'recent' | 'worn'
type CategoryFilter = ClothingCategory | 'all'

let outfitHistoryPromise: Promise<{ default: typeof import('./components/OutfitHistory')['OutfitHistory'] }> | undefined
let outfitBoardPromise: Promise<{ default: typeof import('./components/OutfitBoard')['OutfitBoard'] }> | undefined
let helpChatPromise: Promise<{ default: typeof import('./components/HelpChat')['HelpChat'] }> | undefined

const loadOutfitHistory = () => outfitHistoryPromise ??= import('./components/OutfitHistory').then((module) => ({ default: module.OutfitHistory }))
const loadOutfitBoard = () => outfitBoardPromise ??= import('./components/OutfitBoard').then((module) => ({ default: module.OutfitBoard }))
const loadHelpChat = () => helpChatPromise ??= import('./components/HelpChat').then((module) => ({ default: module.HelpChat }))
const prefetchAppFeatures = () => { void Promise.allSettled([loadOutfitHistory(), loadOutfitBoard(), loadHelpChat()]) }

const OutfitHistory = lazy(loadOutfitHistory)
const OutfitBoard = lazy(loadOutfitBoard)
const HelpChat = lazy(loadHelpChat)

const PASSWORD_RECOVERY_KEY = 'le-dressing:password-recovery'

const UPLOAD_PROGRESS_MESSAGES = [
  'Analyse de l’image…',
  'Suppression du fond…',
  'Mise en valeur du vêtement…',
  'Finalisation…',
] as const

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

function itemStatus(item: ClothingItem, now = new Date()) {
  const elapsed = daysSince(item.lastWornAt, now)
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

function authRedirectUrl() {
  const publicAppUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim()
    || 'https://elio1803.github.io/app-vetements/'
  if (publicAppUrl) return new URL(publicAppUrl).href
  const baseUrl = import.meta.env.BASE_URL || '/'
  return new URL(baseUrl, window.location.origin).href
}

function hasPasswordRecoveryPending() {
  if (typeof window === 'undefined') return false
  const callbackParams = `${window.location.search}&${window.location.hash}`
  if (/(?:^|[&#?])type=recovery(?:&|$)/i.test(callbackParams)) return true
  try {
    return window.localStorage.getItem(PASSWORD_RECOVERY_KEY) === '1'
  } catch {
    return false
  }
}

function rememberPasswordRecovery(pending: boolean) {
  try {
    if (pending) window.localStorage.setItem(PASSWORD_RECOVERY_KEY, '1')
    else window.localStorage.removeItem(PASSWORD_RECOVERY_KEY)
  } catch {
    // Private browsing can block storage; the current React state still protects the flow.
  }
}

async function authErrorMessage(error: { message?: string } | null, email: string) {
  const message = error?.message?.toLowerCase() ?? ''

  if (message.includes('email not confirmed') || message.includes('not confirmed')) {
    await supabase?.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: authRedirectUrl() },
    }).catch(() => null)
    return 'Votre e-mail n’est pas encore confirmé. Je viens de renvoyer un nouveau lien de confirmation.'
  }

  if (message.includes('invalid login credentials')) {
    return 'Adresse e-mail ou mot de passe incorrect. Si le compte vient d’être créé, confirmez d’abord le lien reçu par e-mail.'
  }

  if (message.includes('user already registered') || message.includes('already registered')) {
    return 'Ce compte existe déjà. Passez sur “Se connecter”, ou confirmez le dernier e-mail reçu.'
  }

  return 'Impossible de vous connecter pour le moment. Réessayez dans quelques instants.'
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

function isLikelyNetworkError(error: unknown) {
  if (!error) return false
  const message = error instanceof Error ? error.message : String(error)
  return /network|fetch|offline|connexion|failed|timeout|load failed/i.test(message)
}

function isLocalPhotoUrl(value: string) {
  return /^data:image\//i.test(value)
}

function recoverLocalWardrobeItems(targetUserId: string): ClothingItem[] {
  if (typeof window === 'undefined') return []
  const recovered = new Map<string, ClothingItem>()
  const fallback = {
    version: 1 as const,
    userId: targetUserId,
    items: [] as ClothingItem[],
    outfits: [],
    suggestions: [],
    selectedOccasion: 'quotidien' as Occasion,
    lastUpdatedAt: new Date().toISOString(),
  }

  try {
    const keys: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key?.startsWith(WARDROBE_STORAGE_KEY)) keys.push(key)
    }

    for (const key of keys) {
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      const state = normalizeWardrobeState(JSON.parse(raw) as unknown, fallback)
      for (const item of state.items) {
        if (!isLocalPhotoUrl(item.photoUrl)) continue
        recovered.set(item.id, { ...item, userId: targetUserId })
      }
    }

    const currentRaw = window.localStorage.getItem(wardrobeStorageKeyForAccount(targetUserId))
    if (currentRaw) {
      const state = normalizeWardrobeState(JSON.parse(currentRaw) as unknown, fallback)
      for (const item of state.items) {
        if (isLocalPhotoUrl(item.photoUrl)) recovered.set(item.id, { ...item, userId: targetUserId })
      }
    }
  } catch (error) {
    console.warn('Unable to recover local wardrobe items:', error)
  }

  return [...recovered.values()]
}

const ClothingCard = memo(function ClothingCard({
  item,
  onOpen,
  today,
  shouldReduceMotion,
  canHover,
}: {
  item: ClothingItem
  onOpen: (item: ClothingItem) => void
  today: Date
  shouldReduceMotion: boolean
  canHover: boolean
}) {
  const status = itemStatus(item, today)
  return (
    <motion.button
      layout
      variants={shouldReduceMotion ? undefined : cardVariants}
      className="clothing-card"
      onClick={() => onOpen(item)}
      aria-label={`${item.name ?? 'Pièce sans nom'}, ${status.label}`}
      whileHover={!shouldReduceMotion && canHover ? { y: -4, scale: 1.03 } : undefined}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
      transition={TRANSITIONS.spring}
    >
      <div className="clothing-card-image">
        <ClothingPhoto
          item={item}
          className="clothing-photo--product"
          alt={item.name ?? CATEGORY_LABELS_SINGULAR[item.category]}
          layoutId={`item-photo-${item.id}`}
        />
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
    </motion.button>
  )
}, (previous, next) => (
  previous.item === next.item
  && previous.today === next.today
  && previous.onOpen === next.onOpen
  && previous.shouldReduceMotion === next.shouldReduceMotion
  && previous.canHover === next.canHover
))

function App() {
  const state = useWardrobeStore()
  const shouldReduceMotion = useReducedMotion()
  const canHover = window.matchMedia('(pointer: fine)').matches
  const initialLocalSession = getLocalSession()
  const [authenticated, setAuthenticated] = useState(() => !isSupabaseConfigured && Boolean(initialLocalSession))
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [passwordRecovery, setPasswordRecovery] = useState(hasPasswordRecoveryPending)
  const [bootLoading, setBootLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => initialLocalSession?.userId ?? null)
  const [currentEmail, setCurrentEmail] = useState<string | null>(() => initialLocalSession?.email ?? null)
  const [currentProfileName, setCurrentProfileName] = useState<string>(() => initialLocalSession?.profileName ?? '')
  const [profileNameDraft, setProfileNameDraft] = useState<string>(() => initialLocalSession?.profileName ?? '')
  const [profileNameSaving, setProfileNameSaving] = useState(false)
  const [profileNameError, setProfileNameError] = useState('')
  const [view, setView] = useState<AppView>('wardrobe')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('rotation')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [addOpen, setAddOpen] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [editItem, setEditItem] = useState(false)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState<ClothingCategory>('haut')
  const [addCategory, setAddCategory] = useState<ClothingCategory>('haut')
  const [addName, setAddName] = useState('')
  const [photoData, setPhotoData] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [savingItem, setSavingItem] = useState(false)
  const progressMessageIndex = useRotatingProgress(
    photoBusy || savingItem,
    UPLOAD_PROGRESS_MESSAGES.length,
  )
  const [isPhotoDragOver, setIsPhotoDragOver] = useState(false)
  const [addError, setAddError] = useState('')
  const [occasion, setOccasion] = useState<Occasion>(state.selectedOccasion)
  const [note, setNote] = useState('')
  const [generating, setGenerating] = useState(false)
  const [wearCandidate, setWearCandidate] = useState<OutfitSuggestion | null>(null)
  const [toast, setToast] = useState('')
  const [toastDetail, setToastDetail] = useState('')
  const [toastDetailRevealed, setToastDetailRevealed] = useState(false)
  const toastTimer = useRef<number | null>(null)
  const [appEntering, setAppEntering] = useState(false)
  const isOnline = useOnlineStatus()
  const [cloudRefreshing, setCloudRefreshing] = useState(false)
  const [manualSyncing, setManualSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const today = useDailyDate()
  const { canInstall, isInstalled, requestInstall } = usePwaInstall()
  useIdleFeaturePrefetch(authenticated && !authLoading, prefetchAppFeatures)
  const { weather, status: weatherStatus, error: weatherError, requestWeather } = useCurrentWeather()
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const storagePaths = useRef(new Map<string, string>())
  const activeUser = useRef<string | null>(null)
  const initialEntryPlayed = useRef(false)
  const syncingLocalItems = useRef(new Set<string>())
  const syncLocalItemsRunning = useRef(false)
  const cloudRefreshRunning = useRef(false)
  const pendingItemMutations = useRef(0)

  useEffect(() => () => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [view])

  useEffect(() => {
    if (!supabase) return
    const supabaseClient = supabase
    let active = true

    const applySession = async (userId: string | null) => {
      if (!active) return
      if (userId !== activeUser.current) {
        const unsyncedItems = wardrobeStore.getSnapshot().items.filter((item) =>
          isLocalPhotoUrl(item.photoUrl)
        )
        if (userId) {
          const recoveredItems = recoverLocalWardrobeItems(userId)
          wardrobeStore.switchToAccount(userId)
          for (const item of [...unsyncedItems, ...recoveredItems]) {
            if (!wardrobeStore.getSnapshot().items.some((candidate) => candidate.id === item.id)) {
              wardrobeStore.addItem({ ...item, userId })
            }
          }
        } else {
          wardrobeStore.clear()
        }
        storagePaths.current.clear()
        activeUser.current = userId
      }
      setCurrentUserId(userId)
      setAuthenticated(Boolean(userId))
      if (userId) {
        const { data } = await supabaseClient.auth.getUser()
        if (active) {
          setCurrentEmail(data.user?.email ?? null)
          setCurrentProfileName(profileNameFromMetadata(data.user?.user_metadata, data.user?.email))
        }
        if (data.user && active) {
          const pendingLocalItems = wardrobeStore.getSnapshot().items.filter((item) =>
            isLocalPhotoUrl(item.photoUrl)
          )
          const recoveredItems = recoverLocalWardrobeItems(data.user.id)
          const paths = await loadRemoteWardrobe(data.user)
          if (active) storagePaths.current = paths
          if (active && (pendingLocalItems.length || recoveredItems.length)) {
            for (const item of [...pendingLocalItems, ...recoveredItems]) {
              if (!wardrobeStore.getSnapshot().items.some((candidate) => candidate.id === item.id)) {
                wardrobeStore.addItem({ ...item, userId: data.user.id })
              }
            }
          }
          void sendWelcomeEmail().catch(() => undefined)
        }
      }
      if (!userId && active) {
        setCurrentEmail(null)
        setCurrentProfileName('')
      }
      if (active) setAuthLoading(false)
    }

    void supabaseClient.auth.getSession().then(({ data }) => applySession(data.session?.user.id ?? null))
    const { data: subscription } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        rememberPasswordRecovery(true)
        setPasswordRecovery(true)
      }
      void applySession(session?.user.id ?? null)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!appEntering) return undefined
    const timer = window.setTimeout(() => setAppEntering(false), 1200)
    return () => window.clearTimeout(timer)
  }, [appEntering])

  const syncLocalItemsNow = async (manual = false) => {
    if (syncLocalItemsRunning.current) return
    if (!supabase || !currentUserId || !isOnline || !authenticated) {
      if (manual) {
        setSyncError('Connectez-vous au compte et vérifiez Internet avant de synchroniser.')
        setToast('Synchronisation impossible : compte ou réseau indisponible.')
      }
      return
    }
    const pendingItems = state.items.filter((item) =>
      isLocalPhotoUrl(item.photoUrl) && !syncingLocalItems.current.has(item.id)
    )
    if (!pendingItems.length) {
      if (manual) {
        setSyncError('')
        setToast('Aucune pièce locale à synchroniser sur cet appareil.')
      }
      return
    }

    if (manual) setManualSyncing(true)
    syncLocalItemsRunning.current = true
    setSyncError('')
    let syncedCount = 0
    for (const item of pendingItems) {
      syncingLocalItems.current.add(item.id)
      try {
        const synced = await syncClothingItemToCloud({
          dataUrl: item.photoUrl,
          userId: currentUserId,
          clientItemId: item.id,
          category: item.category,
          name: item.name,
          colorDominant: item.colorDominant,
        })
        const uploadedPath = synced.photoPath
        const created = synced.item
        wardrobeStore.addItem(created)

        const analysis = await wardrobeApi.analyzeClothing(uploadedPath, item.category)
        if (!wardrobeApi.lastRemoteError) {
          await wardrobeApi.updateItem(created.id, {
            colorDominant: analysis.couleurDominante,
            name: item.name || analysis.nomSuggere,
          })
        }

        storagePaths.current.set(created.id, uploadedPath)
        try {
          wardrobeStore.updateItem(created.id, { photoUrl: await signedPhotoUrl(uploadedPath) })
        } catch {
          wardrobeStore.updateItem(created.id, { photoUrl: item.photoUrl })
        }
        if (created.id !== item.id) wardrobeStore.removeItem(item.id)
        syncedCount += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setSyncError(message)
        console.warn('Unable to sync local wardrobe item:', error)
      } finally {
        syncingLocalItems.current.delete(item.id)
      }
    }

    if (syncedCount > 0) {
      setToast(`${syncedCount} pièce${syncedCount > 1 ? 's' : ''} synchronisée${syncedCount > 1 ? 's' : ''} en ligne.`)
    } else if (manual) {
      setToast('La synchronisation a échoué. Ouvrez le profil pour voir le détail.')
    }
    syncLocalItemsRunning.current = false
    if (manual) setManualSyncing(false)
  }

  useEffect(() => {
    void syncLocalItemsNow(false)
  }, [authenticated, currentUserId, isOnline, state.items])

  useEffect(() => {
    if (!supabase || !currentUserId || !authenticated) return undefined
    const supabaseClient = supabase
    let cancelled = false

    const refreshCloudWardrobe = async () => {
      if (cloudRefreshRunning.current || document.visibilityState !== 'visible' || !navigator.onLine || syncingLocalItems.current.size > 0 || pendingItemMutations.current > 0) return
      cloudRefreshRunning.current = true
      setCloudRefreshing(true)
      try {
        const pendingLocalItems = wardrobeStore.getSnapshot().items.filter((item) =>
          isLocalPhotoUrl(item.photoUrl)
        )
        const { data } = await supabaseClient.auth.getUser()
        if (cancelled || !data.user || data.user.id !== currentUserId) return
        const paths = await loadRemoteWardrobe(data.user)
        if (cancelled) return
        storagePaths.current = paths
        for (const item of pendingLocalItems) {
          if (!wardrobeStore.getSnapshot().items.some((candidate) => candidate.id === item.id)) {
            wardrobeStore.addItem({ ...item, userId: currentUserId })
          }
        }
      } catch (error) {
        if (!isLikelyNetworkError(error)) {
          console.warn('Unable to refresh cloud wardrobe:', error)
        }
      } finally {
        cloudRefreshRunning.current = false
        if (!cancelled) setCloudRefreshing(false)
      }
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshCloudWardrobe()
    }

    window.addEventListener('focus', refreshWhenVisible)
    window.addEventListener('online', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    const interval = window.setInterval(() => void refreshCloudWardrobe(), 45_000)

    return () => {
      cancelled = true
      window.removeEventListener('focus', refreshWhenVisible)
      window.removeEventListener('online', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.clearInterval(interval)
    }
  }, [authenticated, currentUserId])

  useEffect(() => {
    if (bootLoading || authLoading || !authenticated || initialEntryPlayed.current) return
    initialEntryPlayed.current = true
    setAppEntering(true)
  }, [authenticated, authLoading, bootLoading])

  const stats = useMemo(
    () => wardrobeStore.getStats(today),
    [state.items, state.outfits, today],
  )
  const displayName = currentProfileName || profileNameFromEmail(currentEmail)
  const displayInitials = displayName
    .split(/[\s._-]+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toLocaleUpperCase('fr') || 'EP'
  const selectedItem = state.items.find((item) => item.id === selectedItemId) ?? null
  const generationReadiness = useMemo(
    () => generationReadinessFor(state.items, occasion, today, weather),
    [occasion, state.items, today, weather],
  )
  const emergencyReadiness = useMemo(
    () => generationReadinessFor(state.items, 'quotidien', today, weather),
    [state.items, today, weather],
  )
  const canGenerate = generationReadiness.canGenerate
  const WeatherIcon = weather?.condition === 'rain' || weather?.condition === 'storm'
    ? CloudRain
    : weather?.condition === 'snow'
      ? Snowflake
      : CloudSun

  const visibleItems = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase('fr')
    const filtered = state.items.filter((item) => {
      if (category !== 'all' && item.category !== category) return false
      if (!normalized) return true
      return `${item.name ?? ''} ${item.colorDominant ?? ''} ${CATEGORY_LABELS[item.category]}`
        .toLocaleLowerCase('fr')
        .includes(normalized)
    })
    return sortItems(filtered, sortMode)
  }, [category, deferredQuery, sortMode, state.items])

  const visibleGroups = useMemo(() => {
    const categories = category === 'all' ? CLOTHING_CATEGORIES : [category]
    return categories
      .map((groupCategory) => ({
        category: groupCategory,
        items: visibleItems.filter((item) => item.category === groupCategory),
      }))
      .filter((group) => group.items.length > 0)
  }, [category, visibleItems])

  const rediscoveryItems = useMemo(
    () => sortByLeastRecentlyWorn(state.items, today).slice(0, 3),
    [state.items, today],
  )
  const localOnlyCount = state.items.filter((item) => isLocalPhotoUrl(item.photoUrl)).length

  const showToast = (message: string, detail?: string) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    setToast(message)
    setToastDetail(detail ?? '')
    setToastDetailRevealed(false)
    toastTimer.current = window.setTimeout(() => {
      setToast('')
      setToastDetail('')
      setToastDetailRevealed(false)
      toastTimer.current = null
    }, detail ? 8000 : 3200)
  }

  const revealToastDetail = () => {
    if (!toastDetail) return
    navigator.clipboard?.writeText(toastDetail).catch(() => {})
    setToastDetailRevealed(true)
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => {
      setToast('')
      setToastDetail('')
      setToastDetailRevealed(false)
      toastTimer.current = null
    }, 30000)
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

  const dismissSuggestion = (suggestionId: string) => {
    wardrobeStore.setSuggestions(
      state.suggestions.filter((suggestion) => suggestion.id !== suggestionId),
      state.selectedOccasion,
    )
  }

  const handleSuggestionDragEnd = (suggestionId: string, _event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 120) dismissSuggestion(suggestionId)
  }

  const installApplication = async () => {
    const outcome = await requestInstall()
    if (outcome === 'accepted') {
      showToast('Installation de l’application lancée.')
      return
    }
    if (outcome === 'dismissed') return

    showToast(
      outcome === 'ios-help'
        ? 'Dans Safari : Partager, puis « Sur l’écran d’accueil ». '
        : 'Ouvrez le menu du navigateur, puis choisissez « Installer l’application ».',
    )
  }

  const openItem = useCallback((item: ClothingItem) => {
    setSelectedItemId(item.id)
    setEditItem(false)
    setEditName(item.name ?? '')
    setEditCategory(item.category)
  }, [])

  const preparePhotoFile = async (file: File) => {
    if (!file) return
    if (file.size > 25 * 1024 * 1024) {
      setAddError('Cette photo dépasse 25 Mo. Choisissez une image plus légère pour éviter de saturer le téléphone.')
      return
    }
    setPhotoBusy(true)
    setAddError('')
    try {
      const normalizedFile = await normalizePhotoForUpload(file)
      let preparedPhoto = ''
      if (isOnline && supabase && currentUserId) {
        try {
          preparedPhoto = await createRemoveBgProductPhoto(normalizedFile)
        } catch (error) {
          console.error('remove.bg indisponible, repli sur le détourage local :', error)
        }
      }

      if (!preparedPhoto) {
        try {
          preparedPhoto = await createProductPhoto(normalizedFile)
        } catch (error) {
          console.error('Détourage local indisponible, repli sur la compression simple :', error)
          preparedPhoto = await compressPhoto(normalizedFile)
          const detail = error instanceof Error ? error.message : String(error)
          showToast('Détourage indisponible sur cet appareil : photo ajoutée sans détourage.', detail)
        }
      }

      setPhotoData(preparedPhoto)
      if (!isOnline && supabase && currentUserId) {
        showToast('Photo préparée hors ligne. Elle sera ajoutée localement.')
      }
    } catch (error) {
      setAddError(
        isLikelyNetworkError(error)
          ? 'La connexion semble instable. Vérifiez votre réseau puis réessayez.'
          : error instanceof Error ? error.message : 'Impossible de lire cette photo.',
      )
    } finally {
      setPhotoBusy(false)
    }
  }

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      await preparePhotoFile(file)
    } finally {
      event.target.value = ''
    }
  }

  const handlePhotoDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsPhotoDragOver(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void preparePhotoFile(file)
  }

  const changeAddCategory = (category: ClothingCategory) => {
    setAddCategory(category)
    setAddError('')
    if (photoData) {
      setPhotoData('')
      showToast('Catégorie changée : ajoutez à nouveau la photo pour cibler la bonne pièce.')
    }
  }

  const resetAdd = () => {
    setPhotoData('')
    setAddName('')
    setAddCategory('haut')
    setAddError('')
  }

  const openNeededItem = () => {
    const neededCategory = suggestedMissingCategory(state.items, occasion, today, weather) ?? 'haut'

    resetAdd()
    setAddCategory(neededCategory)
    setAddOpen(true)
  }

  const saveItem = async () => {
    if (!photoData) {
      setAddError('Ajoute une photo avant de continuer.')
      return
    }

    const addLocalFallbackItem = () => {
      wardrobeStore.addItem({
        userId: currentUserId ?? state.userId,
        photoUrl: photoData,
        category: addCategory,
        name: addName.trim() || `${CATEGORY_LABELS_SINGULAR[addCategory]} sans nom`,
        colorDominant: null,
      })
      setAddOpen(false)
      resetAdd()
    }

    setSavingItem(true)
    setAddError('')
    try {
      if (!isOnline && supabase && currentUserId) {
        addLocalFallbackItem()
        showToast('Pièce ajoutée hors ligne. Elle sera synchronisée au retour du réseau.')
        return
      }

      if (supabase && currentUserId) {
        const synced = await syncClothingItemToCloud({
          dataUrl: photoData,
          userId: currentUserId,
          clientItemId: null,
          category: addCategory,
          name: addName.trim() || null,
          colorDominant: null,
        })
        const uploadedPath = synced.photoPath
        const created = wardrobeStore.addItem(synced.item)

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
    } catch (error) {
      addLocalFallbackItem()
      showToast(
        isLikelyNetworkError(error)
          ? 'Pièce gardée localement. La synchronisation se relancera automatiquement.'
          : 'Pièce gardée localement. L’app retentera la synchronisation en ligne.',
      )
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
    pendingItemMutations.current += 1
    try {
      if (supabase && currentUserId) await wardrobeApi.updateItem(selectedItem.id, patch)
      else wardrobeStore.updateItem(selectedItem.id, patch)
      setEditItem(false)
      showToast('Modifications enregistrées.')
    } catch {
      showToast('Impossible d’enregistrer ces modifications pour le moment.')
    } finally {
      pendingItemMutations.current -= 1
    }
  }

  const deleteSelected = async () => {
    if (!selectedItem) return
    // window.confirm blurs and refocuses the window, which triggers the
    // 'focus' listener below and can race a cloud wardrobe refresh against
    // this deletion — the guard must therefore start after confirm resolves.
    if (!window.confirm('Supprimer cette pièce ? Cette action est irréversible.')) return
    pendingItemMutations.current += 1
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
    } finally {
      pendingItemMutations.current -= 1
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
        weather,
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
    rememberPasswordRecovery(false)
    setPasswordRecovery(false)
    if (supabase) await supabase.auth.signOut()
    else {
      signOutLocalAccount()
      wardrobeStore.switchToGuest()
    }
    setCurrentUserId(null)
    setCurrentEmail(null)
    setCurrentProfileName('')
    setAppEntering(false)
    setAuthenticated(false)
  }

  const openProfile = () => {
    setProfileNameDraft(currentProfileName || profileNameFromEmail(currentEmail))
    setProfileNameError('')
    setView('profile')
  }

  const saveProfileName = async () => {
    const nextName = normalizeProfileName(profileNameDraft)
    if (!nextName) {
      setProfileNameError('Indiquez votre prénom ou votre nom.')
      return
    }
    setProfileNameSaving(true)
    setProfileNameError('')
    try {
      if (supabase) {
        const { data, error } = await supabase.auth.updateUser({ data: { display_name: nextName } })
        if (error) throw error
        const savedName = profileNameFromMetadata(data.user.user_metadata, data.user.email)
        setCurrentProfileName(savedName)
        setProfileNameDraft(savedName)
      } else {
        const session = updateLocalProfileName(nextName)
        setCurrentProfileName(session.profileName)
        setProfileNameDraft(session.profileName)
      }
      showToast(`Le dressing de ${nextName} est enregistré.`)
    } catch {
      setProfileNameError('Impossible d’enregistrer ce nom pour le moment. Réessayez.')
    } finally {
      setProfileNameSaving(false)
    }
  }

  const signIn = async (email: string, password: string, createAccount: boolean, profileName: string) => {
    const chosenProfileName = normalizeProfileName(profileName)
    if (createAccount && !chosenProfileName) return 'Indiquez votre prénom ou votre nom.'
    if (createAccount && password.length < 10) return 'Le mot de passe doit contenir au moins dix caractères.'
    if (password.length > 128) return 'Le mot de passe est trop long.'
    if (!supabase) {
      try {
        const session = createAccount
          ? await createLocalAccount(email, password, chosenProfileName)
          : await signInLocalAccount(email, password)
        wardrobeStore.switchToAccount(session.userId)
        setCurrentUserId(session.userId)
        setCurrentEmail(session.email)
        setCurrentProfileName(session.profileName)
        setAppEntering(true)
        setAuthenticated(true)
        if (createAccount) showToast(`Bonjour ${session.profileName}, votre dressing est prêt.`)
        return null
      } catch (error) {
        return error instanceof LocalAuthError
          ? error.message
          : 'Impossible d’ouvrir ce compte sur cet appareil.'
      }
    }
    const result = createAccount
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: authRedirectUrl(),
            data: { display_name: chosenProfileName },
          },
        })
      : await supabase.auth.signInWithPassword({ email, password })
    if (result.error) return authErrorMessage(result.error, email)
    if (createAccount && !result.data.session) {
      return 'Compte créé. Ouvrez le lien reçu par e-mail pour finaliser votre inscription.'
    }
    rememberPasswordRecovery(false)
    setPasswordRecovery(false)
    setAppEntering(true)
    return null
  }

  const saveRecoveredPassword = async (password: string) => {
    if (!supabase) return 'La réinitialisation en ligne est indisponible.'
    if (password.length < 10) return 'Le mot de passe doit contenir au moins dix caractères.'
    if (password.length > 128) return 'Le mot de passe est trop long.'
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      return /same password/i.test(error.message)
        ? 'Choisissez un mot de passe différent de l’ancien.'
        : 'Impossible d’enregistrer ce mot de passe. Demandez un nouveau lien de réinitialisation.'
    }
    window.history.replaceState({}, document.title, new URL(import.meta.env.BASE_URL || '/', window.location.origin).href)
    return null
  }

  const finishPasswordRecovery = () => {
    rememberPasswordRecovery(false)
    setPasswordRecovery(false)
    setAppEntering(true)
    showToast('Votre nouveau mot de passe est enregistré.')
  }

  const signInWithGoogle = async () => {
    if (!isGoogleAuthEnabled) {
      return 'La connexion Google doit d’abord être activée dans Supabase.'
    }
    if (!supabase) {
      return 'La connexion Google sera disponible après activation de la synchronisation cloud.'
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirectUrl() },
    })
    return error ? 'La connexion Google n’a pas pu démarrer.' : null
  }

  const resetPassword = async (email: string) => {
    if (!email.trim()) return 'Saisissez d’abord votre adresse e-mail.'
    if (!supabase) {
      return 'Sur cet appareil, créez un nouveau compte si le mot de passe est perdu. La réinitialisation par e-mail nécessite la synchronisation cloud.'
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirectUrl(),
    })
    return error
      ? 'Impossible d’envoyer l’e-mail de réinitialisation.'
      : 'Un lien de réinitialisation vient de vous être envoyé.'
  }

  if (bootLoading) return <LoadingScreen onFinish={() => setBootLoading(false)} />

  if (authLoading) return <LoadingScreen persistent />

  if (passwordRecovery && authenticated) {
    return <PasswordRecoveryScreen onSave={saveRecoveredPassword} onContinue={finishPasswordRecovery} onCancel={signOut} />
  }

  if (!authenticated) {
    return <LoginScreen onLogin={signIn} onGoogle={signInWithGoogle} onResetPassword={resetPassword} />
  }

  return (
    <div className={appEntering ? 'app-shell app-shell--entering' : 'app-shell'}>
      <aside className="desktop-sidebar">
        <BrandMark />
        <nav className="desktop-nav" aria-label="Navigation principale">
          <button className={view === 'wardrobe' ? 'is-active' : ''} onClick={() => setView('wardrobe')} aria-current={view === 'wardrobe' ? 'page' : undefined}>
            <Grid2X2 size={19} />
            Mon dressing
            {view === 'wardrobe' && <span className="nav-dot" />}
          </button>
          <button className={view === 'generate' ? 'is-active' : ''} onClick={() => setView('generate')} aria-current={view === 'generate' ? 'page' : undefined}>
            <WandSparkles size={19} />
            Créer une tenue
            {view === 'generate' && <span className="nav-dot" />}
          </button>
          <button
            className={view === 'history' ? 'is-active' : ''}
            onClick={() => setView('history')}
            aria-current={view === 'history' ? 'page' : undefined}
          >
            <CalendarDays size={19} />
            Historique
            {view === 'history' && <span className="nav-dot" />}
          </button>
        </nav>
        <button className="sidebar-add" onClick={() => setAddOpen(true)}>
          <Plus size={19} />
          Ajouter une pièce
        </button>
        <div className="sidebar-spacer" />
        <div className="sidebar-insight">
          <span className="insight-icon">{state.items.length ? <Sparkles size={16} /> : <Camera size={16} />}</span>
          <strong>{state.items.length ? `${pluralPieces(stats.neverWorn)} à découvrir` : 'Votre premier look'}</strong>
          <p>{state.items.length ? 'Laissez-les inspirer votre prochaine tenue.' : 'Ajoutez quelques pièces pour commencer à composer.'}</p>
          <button onClick={() => state.items.length ? setView('generate') : setAddOpen(true)}>
            {state.items.length ? 'Composer' : 'Commencer'} <ChevronRight size={15} />
          </button>
        </div>
        <button className={view === 'profile' ? 'user-row is-active' : 'user-row'} onClick={openProfile} aria-current={view === 'profile' ? 'page' : undefined}>
          <span className="user-avatar">{displayInitials}</span>
          <span><strong>{displayName}</strong><small>{supabase ? 'Compte synchronisé' : 'Compte local privé'}</small></span>
          <ChevronRight size={17} />
        </button>
      </aside>

      <main className="app-main">
        <header className="mobile-header">
          <BrandMark />
        </header>

        {!isOnline && (
          <div className="network-status" role="status" aria-live="polite">
            <WifiOff size={16} aria-hidden="true" />
            <span><strong>Mode hors ligne</strong> · Vos changements restent sur cet appareil et seront synchronisés au retour du réseau.</span>
          </div>
        )}

        <AnimatePresence mode="wait">
        {view === 'wardrobe' ? (
          <motion.div
            key="wardrobe"
            className="page-content wardrobe-page"
            variants={shouldReduceMotion ? undefined : screenVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={TRANSITIONS.screen}
          >
            <header className="page-heading wardrobe-heading">
              <div>
                <p className="eyebrow">{formatToday(today)} · Votre sélection</p>
                <h1>Bonjour {displayName},</h1>
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

            {emergencyReadiness.canGenerate && (
              <button className="emergency-look" onClick={startEmergencyLook}>
                <span><Zap size={20} /></span>
                <span><strong>J’ai rien à me mettre</strong><small>Une tenue simple, maintenant, sans réfléchir.</small></span>
                <ChevronRight size={19} />
              </button>
            )}

            {state.items.length > 0 && <section className="rotation-panel" aria-labelledby="rotation-title">
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
                  <strong><AnimatedCounter value={stats.rotationScore} suffix="%" /></strong>
                  <span>en rotation</span>
                </div>
              </div>
            </section>}

            <section className="wardrobe-section" aria-labelledby="wardrobe-title" aria-busy={query !== deferredQuery}>
              <div className="section-title-row">
                <div>
                  <p className="eyebrow">Votre collection</p>
                  <h2 id="wardrobe-title">Mon dressing <span><AnimatedCounter value={state.items.length} /></span></h2>
                </div>
                {state.items.length > 0 && <div className="wardrobe-tools">
                  <label className="search-field">
                    <Search size={17} />
                    <span className="sr-only">Rechercher</span>
                    <input
                      type="search"
                      enterKeyHint="search"
                      autoComplete="off"
                      spellCheck={false}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Rechercher une pièce"
                    />
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
                </div>}
              </div>

              {state.items.length > 0 && <div className="filter-chips" role="group" aria-label="Filtrer par catégorie">
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
              </div>}
              {state.items.length > 0 && (
                <p className="sr-only" role="status" aria-live="polite">
                  {visibleItems.length} {visibleItems.length > 1 ? 'pièces affichées' : 'pièce affichée'}
                </p>
              )}

              {visibleGroups.length > 0 ? (
                <div className="category-groups">
                  {visibleGroups.map((group) => (
                    <section className="category-group" key={group.category} aria-labelledby={`group-${group.category}`}>
                      <div className="category-group-title">
                        <h3 id={`group-${group.category}`}>{CATEGORY_LABELS[group.category]}</h3>
                        <span>{group.items.length.toString().padStart(2, '0')}</span>
                      </div>
                      <motion.div
                        className="clothing-grid"
                        variants={shouldReduceMotion ? undefined : gridVariants}
                        initial="initial"
                        animate="animate"
                      >
                        <AnimatePresence initial={false}>
                          {group.items.map((item) => (
                            <ClothingCard
                              item={item}
                              onOpen={openItem}
                              today={today}
                              shouldReduceMotion={Boolean(shouldReduceMotion)}
                              canHover={canHover}
                              key={item.id}
                            />
                          ))}
                        </AnimatePresence>
                        {cloudRefreshing && Array.from({ length: Math.min(2, Math.max(1, group.items.length)) }, (_, index) => (
                          <SkeletonCard key={`skeleton-${group.category}-${index}`} />
                        ))}
                        {category !== 'all' && (
                          <motion.button
                            layout
                            className="add-tile"
                            onClick={() => setAddOpen(true)}
                            whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                            transition={TRANSITIONS.spring}
                          >
                            <span><Plus size={21} /></span>
                            Ajouter une pièce
                          </motion.button>
                        )}
                      </motion.div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <span><Shirt size={25} /></span>
                  <h3>
                    {state.items.length
                      ? deferredQuery.trim() ? `Aucun résultat pour « ${deferredQuery.trim()} »` : 'Aucune pièce dans cette catégorie.'
                      : 'Votre dressing est encore vide'}
                  </h3>
                  <p>
                    {state.items.length
                      ? deferredQuery.trim() ? 'Essayez un autre nom ou effacez la recherche pour retrouver tout votre dressing.' : 'Cette catégorie est vide. Affichez toutes vos pièces ou ajoutez-en une nouvelle.'
                      : 'Une photo suffit pour commencer. Vous pourrez ensuite créer des tenues avec vos propres vêtements.'}
                  </p>
                  {!state.items.length && (
                    <ol className="empty-state-steps" aria-label="Étapes pour commencer">
                      <li><span>1</span> Photographiez</li>
                      <li><span>2</span> Classez</li>
                      <li><span>3</span> Composez</li>
                    </ol>
                  )}
                  <button
                    className="primary-button"
                    onClick={() => {
                      if (state.items.length) {
                        setQuery('')
                        setCategory('all')
                      } else {
                        setAddOpen(true)
                      }
                    }}
                  >
                    {state.items.length ? deferredQuery.trim() ? 'Effacer la recherche' : 'Afficher toutes les pièces' : 'Ajouter mon premier vêtement'}
                  </button>
                </div>
              )}
            </section>
          </motion.div>
        ) : view === 'generate' ? (
          <motion.div
            key="generate"
            className="page-content generate-page"
            variants={shouldReduceMotion ? undefined : screenVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={TRANSITIONS.screen}
          >
            <header className="page-heading generator-heading">
              <div>
                <p className="eyebrow">Votre styliste personnel</p>
                <h1>Créer une tenue</h1>
                <p className="page-subtitle">Trois propositions pensées uniquement avec les pièces de votre dressing.</p>
                <div className="context-pills" aria-label="Contexte des suggestions">
                  <span>{weather ? `${Math.round(weather.apparentTemperatureC)} °C ressentis` : 'Saison actuelle'}</span><span>Occasion</span><span>Rotation intelligente</span>
                </div>
              </div>
              <span className="ai-badge"><Sparkles size={15} /> Assisté par IA</span>
            </header>

            {state.items.length === 0 ? (
              <section className="generator-first-run" aria-labelledby="generator-first-run-title">
                <span className="generator-first-run-icon"><Sparkles size={28} /></span>
                <p className="eyebrow">Première tenue</p>
                <h2 id="generator-first-run-title">Ajoutez d’abord vos vêtements</h2>
                <p>Le Dressing compose uniquement avec vos propres pièces. Commencez simplement : un haut et un bas, ou une robe, suffisent déjà pour obtenir vos premières idées.</p>
                <ol aria-label="Étapes pour créer une tenue">
                  <li><span>1</span><strong>Ajoutez</strong><small>vos vêtements</small></li>
                  <li><span>2</span><strong>Choisissez</strong><small>une occasion</small></li>
                  <li><span>3</span><strong>Composez</strong><small>3 propositions</small></li>
                </ol>
                <button className="primary-button" onClick={() => setAddOpen(true)}>
                  <ImagePlus size={18} /> Ajouter mon premier vêtement
                </button>
              </section>
            ) : (
            <div className="generator-layout">
              <section className="generator-form-card" aria-labelledby="generator-form-title">
                <div className={`weather-card weather-card--${weatherStatus}`}>
                  <span className="weather-card-icon" aria-hidden="true">
                    {weatherStatus === 'loading'
                      ? <RefreshCw className="motion-icon spin" size={21} />
                      : weather
                        ? <WeatherIcon size={22} />
                        : <LocateFixed size={22} />}
                  </span>
                  <div className="weather-card-copy">
                    <strong>{weather ? 'Météo réelle autour de vous' : 'Adapter à votre météo'}</strong>
                    {weather ? (
                      <p>
                        {Math.round(weather.temperatureC)} °C · Ressenti {Math.round(weather.apparentTemperatureC)} °C · {weatherConditionLabel(weather.condition)}
                      </p>
                    ) : (
                      <p>{weatherStatus === 'loading' ? 'Localisation et météo en cours…' : weatherError || 'Utilisez votre position pour choisir les bonnes couches.'}</p>
                    )}
                    {weather && (
                      <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Données Open‑Meteo</a>
                    )}
                  </div>
                  <button
                    type="button"
                    className="weather-card-action"
                    onClick={() => void requestWeather()}
                    disabled={weatherStatus === 'loading' || !isOnline}
                  >
                    {weather ? 'Actualiser' : 'Activer'}
                  </button>
                </div>
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
                    <p>{generationReadiness.message}</p>
                    <button type="button" className="inline-alert-action" onClick={openNeededItem}>
                      <Plus size={14} /> Ajouter la pièce
                    </button>
                  </div>
                )}
                {canGenerate && (
                  <div className="inline-alert inline-alert--season" role="status">
                    <Sparkles size={18} />
                    <p>{generationReadiness.message}</p>
                  </div>
                )}

                <button
                  className="generate-button"
                  onClick={generate}
                  disabled={!canGenerate || generating}
                  aria-busy={generating}
                >
                  <span>
                    {generating ? (
                      <motion.span
                        className="motion-icon"
                        animate={shouldReduceMotion ? undefined : { rotate: 360 }}
                        transition={shouldReduceMotion ? undefined : { repeat: Infinity, duration: 1, ease: 'linear' }}
                      >
                        <RefreshCw size={20} />
                      </motion.span>
                    ) : <Sparkles size={20} />}
                  </span>
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
                        <motion.span
                          className="motion-icon"
                          animate={generating && !shouldReduceMotion ? { rotate: 360 } : { rotate: 0 }}
                          transition={generating && !shouldReduceMotion ? { repeat: Infinity, duration: 1, ease: 'linear' } : TRANSITIONS.micro}
                        >
                          <RefreshCw size={15} />
                        </motion.span>
                        Régénérer
                      </button>
                    </div>
                    <motion.div
                      className="outfit-list"
                      variants={shouldReduceMotion ? undefined : gridVariants}
                      initial="initial"
                      animate="animate"
                    >
                      <AnimatePresence initial={false}>
                      {state.suggestions.map((suggestion, index) => {
                        const items = suggestion.itemIds
                          .map((id) => state.items.find((item) => item.id === id))
                          .filter((item): item is ClothingItem => Boolean(item))
                        const worn = state.outfits.some((outfit) => outfit.id === `worn-${suggestion.id}`)
                        return (
                          <motion.article
                            layout
                            className="outfit-card"
                            key={suggestion.id}
                            drag={shouldReduceMotion ? false : 'x'}
                            dragConstraints={{ left: 0, right: 0 }}
                            whileDrag={shouldReduceMotion ? undefined : { rotate: 5 }}
                            onDragEnd={(event, info) => handleSuggestionDragEnd(suggestion.id, event, info)}
                            initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: 180, scale: 0.94 }}
                            transition={TRANSITIONS.spring}
                          >
                            <div className="outfit-number">0{index + 1}</div>
                            <Suspense fallback={<div className="outfit-board-loading" aria-hidden="true" />}>
                              <OutfitBoard items={items} lookNumber={index + 1} />
                            </Suspense>
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
                          </motion.article>
                        )
                      })}
                      </AnimatePresence>
                    </motion.div>
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
                  <span><strong><AnimatedCounter value={state.items.length} /></strong> pièces</span>
                  <span><strong><AnimatedCounter value={stats.neverWorn} /></strong> jamais portées</span>
                  <span><strong><AnimatedCounter value={stats.rotationScore} suffix="%" /></strong> en rotation</span>
                    </div>
                  </div>
                )}
              </section>
            </div>
            )}
          </motion.div>
        ) : view === 'history' ? (
          <motion.div
            key="history"
            className="page-content history-page"
            variants={shouldReduceMotion ? undefined : screenVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={TRANSITIONS.screen}
          >
            <header className="page-heading history-heading">
              <div>
                <p className="eyebrow">Votre quotidien</p>
                <h1>Historique</h1>
                <p className="page-subtitle">Retrouvez vos tenues portées, jour après jour, et suivez la rotation de votre dressing.</p>
              </div>
              <div className="history-heading-stat" aria-label={`${state.outfits.length} ${state.outfits.length > 1 ? 'tenues portées' : 'tenue portée'}`}>
                <span><CalendarDays size={21} /></span>
                <div>
                  <strong><AnimatedCounter value={state.outfits.length} /></strong>
                  <small>{state.outfits.length > 1 ? 'tenues portées' : 'tenue portée'}</small>
                </div>
              </div>
            </header>
            <Suspense fallback={<div className="history-loading" role="status">Chargement de l’historique…</div>}>
              <OutfitHistory outfits={state.outfits} items={state.items} />
            </Suspense>
          </motion.div>
        ) : (
          <motion.div
            key="profile"
            className="page-content profile-page"
            variants={shouldReduceMotion ? undefined : screenVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={TRANSITIONS.screen}
          >
            <header className="page-heading profile-heading">
              <div>
                <p className="eyebrow">Votre espace personnel</p>
                <h1>Profil</h1>
                <p className="heading-script">Le dressing de {displayName}</p>
              </div>
            </header>
            <section className="profile-layout">
              <div className="profile-primary">
                <div className="account-card">
                  <span className="account-avatar"><CircleUserRound size={29} /></span>
                  <div>
                    <strong>{displayName}</strong>
                    <small>{currentEmail ?? 'Compte local'}</small>
                    <small>
                      {cloudRefreshing
                        ? 'Synchronisation du dressing…'
                        : supabase ? 'Synchronisé avec Supabase' : 'Dressing privé sur cet appareil'}
                    </small>
                  </div>
                </div>
                <div className="account-stats">
                  <span><strong><AnimatedCounter value={state.items.length} /></strong> pièces</span>
                  <span><strong><AnimatedCounter value={state.outfits.length} /></strong> tenues portées</span>
                  <span><strong><AnimatedCounter value={stats.rotationScore} suffix="%" /></strong> en rotation</span>
                </div>
                <form className="profile-editor-card" onSubmit={(event) => { event.preventDefault(); void saveProfileName() }}>
                  <div>
                    <label className="field-label" htmlFor="dressing-profile-name">Le dressing de qui&nbsp;?</label>
                    <p>Indiquez votre prénom ou votre nom. Il vous suivra sur tous vos appareils.</p>
                  </div>
                  <div className="profile-editor-actions">
                    <input
                      className="text-field"
                      id="dressing-profile-name"
                      type="text"
                      value={profileNameDraft}
                      onChange={(event) => setProfileNameDraft(event.target.value)}
                      maxLength={PROFILE_NAME_MAX_LENGTH}
                      placeholder="Ex. Élise"
                      autoComplete="name"
                      required
                    />
                    <button className="primary-button" type="submit" disabled={profileNameSaving || normalizeProfileName(profileNameDraft) === displayName}>
                      <Check size={17} /> {profileNameSaving ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  </div>
                  {profileNameError && <p className="form-error" role="alert">{profileNameError}</p>}
                </form>
                <button className="history-open-card" type="button" onClick={() => setView('history')}>
                  <span><CalendarDays size={23} /></span>
                  <div>
                    <strong>Historique des tenues</strong>
                    <p>Retrouvez dans le calendrier ce que vous avez porté chaque jour.</p>
                  </div>
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="profile-secondary">
                {supabase && (
                  <div className={syncError ? 'sync-card sync-card--error' : 'sync-card'}>
                    <span className="sync-card-icon">
                      {manualSyncing ? <RefreshCw size={19} className="spin" /> : <Upload size={19} />}
                    </span>
                    <div>
                      <strong>{localOnlyCount > 0 ? `${localOnlyCount} pièce${localOnlyCount > 1 ? 's' : ''} à synchroniser` : 'Dressing en ligne'}</strong>
                      <p>
                        {syncError
                          ? syncError
                          : localOnlyCount > 0
                            ? 'Ces pièces sont visibles ici mais pas encore sur vos autres appareils.'
                            : 'Les pièces cloud sont visibles sur téléphone et Mac avec le même compte.'}
                      </p>
                    </div>
                    <button className="secondary-button" onClick={() => void syncLocalItemsNow(true)} disabled={manualSyncing || localOnlyCount === 0}>
                      {manualSyncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
                    </button>
                  </div>
                )}
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
              </div>
            </section>
          </motion.div>
        )}
        </AnimatePresence>
      </main>

      <nav className="mobile-nav" aria-label="Navigation principale">
        <button className={view === 'wardrobe' ? 'is-active' : ''} onClick={() => setView('wardrobe')} aria-current={view === 'wardrobe' ? 'page' : undefined}>
          <Grid2X2 size={20} /><span>Dressing</span>
        </button>
        <button className={view === 'generate' ? 'is-active' : ''} onClick={() => setView('generate')} aria-current={view === 'generate' ? 'page' : undefined}>
          <WandSparkles size={20} /><span>Générer</span>
        </button>
        <button className="mobile-add" onClick={() => setAddOpen(true)} aria-label="Ajouter une pièce">
          <Plus size={24} />
        </button>
        <button
          className={view === 'history' ? 'is-active' : ''}
          onClick={() => setView('history')}
          aria-label="Ouvrir l’historique"
          aria-current={view === 'history' ? 'page' : undefined}
        >
          <CalendarDays size={20} /><span>Historique</span>
        </button>
        <button className={view === 'profile' ? 'is-active' : ''} onClick={openProfile} aria-label="Ouvrir le profil" aria-current={view === 'profile' ? 'page' : undefined}>
          <CircleUserRound size={20} /><span>Profil</span>
        </button>
      </nav>

      <Suspense fallback={null}>
        <HelpChat
          currentView={view}
          profileName={displayName}
          onAction={(action) => {
            if (action === 'add-item') {
              setAddOpen(true)
            } else if (action === 'profile') {
              openProfile()
            } else {
              setView(action)
            }
          }}
        />
      </Suspense>

      <Sheet
        open={addOpen}
        onClose={() => { setAddOpen(false); resetAdd() }}
        eyebrow="Nouvelle pièce"
        title="Ajouter au dressing"
        footer={
          <button className="primary-button full-button" onClick={saveItem} disabled={!photoData || photoBusy || savingItem} aria-busy={savingItem}>
            {photoBusy ? 'Préparation de la photo…' : savingItem ? 'Envoi et analyse…' : photoData ? 'Ajouter au dressing' : 'Choisissez d’abord une photo'}
            {photoData && !photoBusy && !savingItem && <ChevronRight size={18} />}
          </button>
        }
      >
        <ol className="add-progress" aria-label="Progression de l’ajout">
          <li className="is-complete"><span><Check size={12} /></span> Type</li>
          <li className={photoData ? 'is-complete' : 'is-current'} aria-current={!photoData ? 'step' : undefined}>
            <span>{photoData ? <Check size={12} /> : '2'}</span> Photo
          </li>
          <li className={photoData ? 'is-current' : ''} aria-current={photoData ? 'step' : undefined}><span>3</span> Ajouter</li>
        </ol>
        <fieldset className="category-picker category-picker--first">
          <legend>Quelle pièce voulez-vous isoler ?</legend>
          <div>
            {CLOTHING_CATEGORIES.map((value) => (
              <label className={addCategory === value ? 'is-active' : ''} key={value}>
                <input type="radio" name="add-category" checked={addCategory === value} onChange={() => changeAddCategory(value)} />
                {CATEGORY_LABELS_SINGULAR[value]}
                {addCategory === value && <Check size={14} />}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="photo-advice"><Camera size={17} /><p>Photographiez la pièce seule, bien à plat ou sur un cintre, sur un fond uni : le détourage isole automatiquement le vêtement et le recentre sur fond blanc.</p></div>
        {!isOnline && (
          <div className="upload-status upload-status--offline" role="status">
            <Zap size={16} />
            <p>Mode hors ligne : la pièce peut être ajoutée sur cet appareil, la synchro cloud attendra le retour du réseau.</p>
          </div>
        )}
        {photoBusy && (
          <div className="upload-status" role="status" aria-live="polite">
            <RefreshCw size={16} className="spin-icon" />
            <div>
              <p>{UPLOAD_PROGRESS_MESSAGES[progressMessageIndex]}</p>
              <small>La première préparation peut prendre quelques secondes. Gardez l’application ouverte.</small>
              <span className="upload-progress"><span /></span>
            </div>
          </div>
        )}
        {savingItem && (
          <div className="upload-status" role="status" aria-live="polite">
            <Upload size={16} className="pulse-icon" />
            <div>
              <p>{UPLOAD_PROGRESS_MESSAGES[progressMessageIndex]}</p>
              <span className="upload-progress"><span /></span>
            </div>
          </div>
        )}
        {addError && <p className="form-error form-error--upload" role="alert">{addError}</p>}
        {photoData ? (
          <div className="photo-preview">
            <img src={photoData} alt="Aperçu de la pièce à ajouter" />
            <button onClick={() => galleryInput.current?.click()}><RefreshCw size={16} /> Changer la photo</button>
          </div>
        ) : (
          <div
            className={isPhotoDragOver ? 'photo-picker is-drag-over' : 'photo-picker'}
            onDragOver={(event) => {
              event.preventDefault()
              setIsPhotoDragOver(true)
            }}
            onDragLeave={() => setIsPhotoDragOver(false)}
            onDrop={handlePhotoDrop}
          >
            <div className="photo-picker-icon"><ImagePlus size={26} /></div>
            <strong>{photoBusy ? 'Détourage et mise en valeur…' : 'Ajoutez la photo de votre pièce'}</strong>
            <p>JPG, PNG ou HEIC · fond blanc produit</p>
            <div>
              <button className="primary-button" onClick={() => cameraInput.current?.click()} disabled={photoBusy}><Camera size={17} /> Prendre une photo</button>
              <button className="secondary-button" onClick={() => galleryInput.current?.click()} disabled={photoBusy}><Upload size={17} /> Photothèque</button>
            </div>
          </div>
        )}
        <input ref={cameraInput} className="sr-only" type="file" accept="image/*" capture="environment" onChange={handlePhoto} />
        <input ref={galleryInput} className="sr-only" type="file" accept="image/*" onChange={handlePhoto} />

        <label className="field-label" htmlFor="item-name">Nom de la pièce <span>(facultatif)</span></label>
        <input
          className="text-field"
          id="item-name"
          value={addName}
          onChange={(event) => setAddName(event.target.value)}
          placeholder="Ex. : Pull col roulé bleu marine"
          enterKeyHint="done"
          autoCapitalize="sentences"
          maxLength={80}
        />
        <p className="ai-helper"><Sparkles size={14} /> L’analyse automatique pourra compléter son nom et sa couleur.</p>
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
            <ClothingPhoto item={selectedItem} className="detail-photo" eager layoutId={`item-photo-${selectedItem.id}`} />
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
                <motion.button
                  className="danger-button"
                  onClick={deleteSelected}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...TRANSITIONS.micro, delay: shouldReduceMotion ? 0 : 0.1 }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                >
                  <Trash2 size={17} /> Supprimer la pièce
                </motion.button>
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

      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            role="status"
            variants={shouldReduceMotion ? undefined : toastVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={TRANSITIONS.spring}
          >
            <Check size={17} /> {toast}
            {toastDetail && !toastDetailRevealed && (
              <button type="button" className="toast-detail-action" onClick={revealToastDetail}>
                Afficher les détails
              </button>
            )}
            {toastDetailRevealed && <p className="toast-detail-text">{toastDetail}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
