export const PROFILE_NAME_MAX_LENGTH = 32

export function normalizeProfileName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, PROFILE_NAME_MAX_LENGTH)
}

export function profileNameFromEmail(email: string | null | undefined): string {
  const localPart = email?.split('@')[0]?.trim() ?? ''
  const readable = localPart.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!readable) return 'Votre profil'
  return readable
    .split(' ')
    .map((part) => `${part.charAt(0).toLocaleUpperCase('fr')}${part.slice(1)}`)
    .join(' ')
}

export function profileNameFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  email?: string | null,
): string {
  const rawCandidate = [metadata?.display_name, metadata?.full_name, metadata?.name]
    .find((value): value is string => typeof value === 'string') ?? ''
  const candidate = normalizeProfileName(rawCandidate)
  return candidate || profileNameFromEmail(email)
}
