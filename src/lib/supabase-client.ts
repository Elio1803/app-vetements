import { createClient, type User } from '@supabase/supabase-js'
import type { ClothingItem } from '../types'
import { wardrobeApi } from './wardrobe-api'
import { wardrobeStore } from './wardrobe-store'

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
  const items = await wardrobeApi.listItems(user.id)
  const resolved = await withSignedPhotoUrls(items)
  wardrobeStore.replaceItems(resolved.items)
  return resolved.storagePaths
}

export async function uploadClothingPhoto(dataUrl: string, userId: string) {
  if (!supabase) throw new Error('Supabase n’est pas configuré.')
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('clothing-photos').upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  return path
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
