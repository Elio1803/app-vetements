import { createClient, type User } from '@supabase/supabase-js'
import type { ClothingCategory, ClothingItem } from '../types'
import { wardrobeApi } from './wardrobe-api'
import { wardrobeStore } from './wardrobe-store'
import { normalizeClothingItem } from './storage'
import type { HelpAction, HelpContext, HelpReply } from './help-assistant'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const isGoogleAuthEnabled = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true'

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

if (supabase) {
  wardrobeApi.setAccessToken(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  })
}

function isAlreadyRenderable(value: string) {
  return /^(?:https?:|data:|blob:|\/assets\/)/i.test(value)
}

export async function withSignedPhotoUrls(items: ClothingItem[]) {
  if (!supabase) return { items, storagePaths: new Map<string, string>() }

  const storagePaths = new Map<string, string>()
  const resolved = await Promise.all(
    items.map(async (item) => {
      if (isAlreadyRenderable(item.photoUrl)) return item
      storagePaths.set(item.id, item.photoUrl)
      const { data, error } = await supabase.storage
        .from('clothing-photos')
        .createSignedUrl(item.photoUrl, 60 * 60)
      if (error || !data?.signedUrl) return item
      return { ...item, photoUrl: data.signedUrl }
    }),
  )

  return { items: resolved, storagePaths }
}

export async function loadRemoteWardrobe(user: User) {
  if (!supabase) throw new Error('Supabase n’est pas configuré.')
  const outfitsPromise = wardrobeApi.listWornOutfits(user.id)

  const invoke = () => supabase.functions.invoke<{ items: unknown[] }>('list-clothing-items', {
    body: {},
  })
  let result = await invoke()

  if (result.error) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed.session) result = await invoke()
  }

  if (result.error) throw result.error
  if (!Array.isArray(result.data?.items)) {
    throw new Error('Réponse du dressing en ligne invalide.')
  }

  const items = result.data.items
    .map((item) => normalizeClothingItem(item, user.id))
    .filter((item): item is ClothingItem => Boolean(item))
  const [resolved] = await Promise.all([withSignedPhotoUrls(items), outfitsPromise])
  wardrobeStore.replaceItems(resolved.items)
  return resolved.storagePaths
}

export async function syncClothingItemToCloud(input: {
  dataUrl: string
  userId: string
  clientItemId?: string | null
  category: ClothingCategory
  name?: string | null
  colorDominant?: string | null
}) {
  if (!supabase) throw new Error('Supabase n’est pas configuré.')
  const response = await fetch(input.dataUrl)
  const blob = await response.blob()
  const formData = new FormData()
  formData.append('image', blob, 'vetement.jpg')
  formData.append('category', input.category)
  if (input.clientItemId?.trim()) formData.append('clientItemId', input.clientItemId.trim())
  if (input.name?.trim()) formData.append('name', input.name.trim())
  if (input.colorDominant?.trim()) formData.append('colorDominant', input.colorDominant.trim())

  const { data, error } = await supabase.functions.invoke<{
    item: unknown
    photoPath: string
  }>('sync-clothing-item', { body: formData })

  if (error) {
    const context = (error as { context?: Response }).context
    if (context) {
      const response = context.clone()
      const body = await response.json().catch(() => null) as unknown
      if (
        body &&
        typeof body === 'object' &&
        'error' in body &&
        body.error &&
        typeof body.error === 'object'
      ) {
        const edgeError = body.error as { code?: unknown; message?: unknown }
        throw new Error(
          `${typeof edgeError.code === 'string' ? edgeError.code : 'SYNC_FAILED'} · ${
            typeof edgeError.message === 'string' ? edgeError.message : error.message
          }`,
        )
      }
    }
    throw error
  }
  if (!data?.item || typeof data.photoPath !== 'string') {
    throw new Error('Synchronisation cloud invalide.')
  }
  const item = normalizeClothingItem(data.item, input.userId)
  if (!item) throw new Error('Pièce cloud invalide.')
  return { item, photoPath: data.photoPath }
}

export async function signedPhotoUrl(path: string) {
  if (!supabase) return path
  const { data, error } = await supabase.storage
    .from('clothing-photos')
    .createSignedUrl(path, 60 * 60)
  if (error || !data?.signedUrl) throw error ?? new Error('URL photo indisponible.')
  return data.signedUrl
}

export async function createRemoveBgProductPhoto(file: File): Promise<string> {
  if (!supabase) throw new Error('Supabase n’est pas configuré.')
  if (!file.type.startsWith('image/')) throw new Error('Ce fichier n’est pas une image.')

  const formData = new FormData()
  formData.append('image', file, file.name || 'vetement.jpg')

  const { data, error } = await supabase.functions.invoke<{ imageDataUrl: string }>('remove-background', {
    body: formData,
  })
  if (error) throw error
  if (!data?.imageDataUrl) throw new Error('Photo remove.bg indisponible.')
  return data.imageDataUrl
}

export async function sendWelcomeEmail(): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.functions.invoke('send-welcome-email', { body: {} })
  if (error) throw error
}

export interface HelpChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export async function askHelpAssistant(input: {
  question: string
  context: HelpContext
  history: HelpChatTurn[]
  profileName?: string
}): Promise<HelpReply> {
  if (!supabase) throw new Error('Supabase n’est pas configuré.')

  const { data, error } = await supabase.functions.invoke<{
    text: unknown
    action: unknown
    actionLabel: unknown
  }>('help-chat', {
    body: {
      question: input.question,
      context: input.context,
      history: input.history,
      profileName: input.profileName,
    },
  })

  if (error) throw error
  if (!data || typeof data.text !== 'string') {
    throw new Error('Réponse de l’assistant invalide.')
  }

  return {
    text: data.text,
    action: typeof data.action === 'string' ? (data.action as HelpAction) : undefined,
    actionLabel: typeof data.actionLabel === 'string' ? data.actionLabel : undefined,
  }
}
