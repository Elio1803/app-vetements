const LOCAL_ACCOUNTS_KEY = 'le-dressing:accounts:v1'
const LOCAL_SESSION_KEY = 'le-dressing:session:v1'
const PASSWORD_ITERATIONS = 120_000

interface StoredLocalAccount {
  userId: string
  email: string
  salt: string
  passwordHash: string
  createdAt: string
}

export interface LocalAccountSession {
  userId: string
  email: string
}

export class LocalAuthError extends Error {}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase('fr')
}

function loadAccounts(): StoredLocalAccount[] {
  try {
    const raw = storage()?.getItem(LOCAL_ACCOUNTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is StoredLocalAccount => (
      typeof entry === 'object' && entry !== null &&
      typeof (entry as StoredLocalAccount).userId === 'string' &&
      typeof (entry as StoredLocalAccount).email === 'string' &&
      typeof (entry as StoredLocalAccount).salt === 'string' &&
      typeof (entry as StoredLocalAccount).passwordHash === 'string'
    ))
  } catch {
    return []
  }
}

function saveAccounts(accounts: StoredLocalAccount[]) {
  const target = storage()
  if (!target) throw new LocalAuthError('Le stockage sécurisé de cet appareil est indisponible.')
  target.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts))
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function passwordHash(password: string, salt: Uint8Array) {
  if (!globalThis.crypto?.subtle) {
    throw new LocalAuthError('La protection du mot de passe nécessite une connexion HTTPS.')
  }
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt).buffer,
      iterations: PASSWORD_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    256,
  )
  return bytesToBase64(new Uint8Array(bits))
}

function saveSession(session: LocalAccountSession) {
  const target = storage()
  if (!target) throw new LocalAuthError('Impossible de conserver la session sur cet appareil.')
  target.setItem(LOCAL_SESSION_KEY, JSON.stringify(session))
}

export function getLocalSession(): LocalAccountSession | null {
  try {
    const raw = storage()?.getItem(LOCAL_SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Partial<LocalAccountSession>
    if (typeof session.userId !== 'string' || typeof session.email !== 'string') return null
    const exists = loadAccounts().some((account) => account.userId === session.userId)
    return exists ? { userId: session.userId, email: session.email } : null
  } catch {
    return null
  }
}

export async function createLocalAccount(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new LocalAuthError('Saisissez une adresse e-mail valide.')
  }
  if (password.length < 8) {
    throw new LocalAuthError('Le mot de passe doit contenir au moins 8 caractères.')
  }

  const accounts = loadAccounts()
  if (accounts.some((account) => account.email === normalizedEmail)) {
    throw new LocalAuthError('Un compte existe déjà avec cette adresse e-mail.')
  }

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const account: StoredLocalAccount = {
    userId: crypto.randomUUID?.() ?? `local-${Date.now().toString(36)}`,
    email: normalizedEmail,
    salt: bytesToBase64(salt),
    passwordHash: await passwordHash(password, salt),
    createdAt: new Date().toISOString(),
  }
  saveAccounts([...accounts, account])
  const session = { userId: account.userId, email: account.email }
  saveSession(session)
  return session
}

export async function signInLocalAccount(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email)
  const account = loadAccounts().find((candidate) => candidate.email === normalizedEmail)
  if (!account) throw new LocalAuthError('Adresse e-mail ou mot de passe incorrect.')

  const candidateHash = await passwordHash(password, base64ToBytes(account.salt))
  if (candidateHash !== account.passwordHash) {
    throw new LocalAuthError('Adresse e-mail ou mot de passe incorrect.')
  }

  const session = { userId: account.userId, email: account.email }
  saveSession(session)
  return session
}

export function signOutLocalAccount() {
  storage()?.removeItem(LOCAL_SESSION_KEY)
}
