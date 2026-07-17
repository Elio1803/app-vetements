import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronRight } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { TRANSITIONS } from '../lib/animations'
import { PROFILE_NAME_MAX_LENGTH } from '../lib/profile'
import { isGoogleAuthEnabled, isSupabaseConfigured } from '../lib/supabase-client'
import { BrandMark } from './BrandMark'

export interface LoginScreenProps {
  onLogin: (email: string, password: string, createAccount: boolean, profileName: string) => Promise<string | null>
  onGoogle: () => Promise<string | null>
  onResetPassword: (email: string) => Promise<string>
}

export function LoginScreen({ onLogin, onGoogle, onResetPassword }: LoginScreenProps) {
  const [createAccount, setCreateAccount] = useState(false)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [profileName, setProfileName] = useState('')
  const [authError, setAuthError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setAuthError('')
    const error = await onLogin(email, password, createAccount, profileName)
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
          <h1>Trois idées.<br /><em>Une décision en moins.</em></h1>
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
          <p className="auth-intro">{createAccount ? 'Quelques secondes suffisent pour commencer.' : 'Vos vêtements vous attendent.'}</p>
          <div className="auth-tabs" role="tablist" aria-label="Type de compte">
            <button role="tab" aria-selected={!createAccount} className={!createAccount ? 'is-active' : ''} onClick={() => setCreateAccount(false)}>Se connecter</button>
            <button role="tab" aria-selected={createAccount} className={createAccount ? 'is-active' : ''} onClick={() => setCreateAccount(true)}>Créer un compte</button>
          </div>
          <form onSubmit={submit}>
            {createAccount && (
              <div className="profile-name-field">
                <label className="field-label" htmlFor="profile-name">Nom de profil</label>
                <input
                  className="text-field"
                  id="profile-name"
                  type="text"
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  placeholder="Ex. Élise"
                  maxLength={PROFILE_NAME_MAX_LENGTH}
                  autoComplete="name"
                  required
                />
                <small>Ce nom personnalisera votre expérience dans Le Dressing.</small>
              </div>
            )}
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
          {isSupabaseConfigured && isGoogleAuthEnabled && (
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

export function PasswordRecoveryScreen({
  onSave,
  onContinue,
  onCancel,
}: {
  onSave: (password: string) => Promise<string | null>
  onContinue: () => void
  onCancel: () => Promise<void>
}) {
  const shouldReduceMotion = useReducedMotion()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setBusy(true)
    setError('')
    const message = await onSave(password)
    if (message) setError(message)
    else setSaved(true)
    setBusy(false)
  }

  return (
    <main className="auth-shell">
      <section className="auth-editorial" aria-label="Présentation">
        <BrandMark inverse />
        <div className="auth-quote">
          <p className="eyebrow eyebrow--light">Votre compte, bien protégé</p>
          <h1>Un nouveau mot de passe.<br /><em>Votre dressing vous attend.</em></h1>
          <p>Choisissez un mot de passe personnel d’au moins huit caractères.</p>
        </div>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form-card">
          <div className="auth-mobile-brand"><BrandMark /></div>
          <AnimatePresence mode="wait">
            {saved ? (
              <motion.div key="recovery-success" className="recovery-success" initial={shouldReduceMotion ? false : { opacity: 0, y: 20, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={TRANSITIONS.spring}>
                <motion.div className="recovery-success-check" initial={shouldReduceMotion ? false : { scale: 0, rotate: -18 }} animate={{ scale: 1, rotate: 0 }} transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 16, delay: 0.12 }} aria-hidden="true">
                  <motion.span initial={shouldReduceMotion ? false : { scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: shouldReduceMotion ? 0 : 0.28, duration: 0.25 }}>
                    <Check size={58} strokeWidth={2.6} />
                  </motion.span>
                </motion.div>
                <p className="eyebrow recovery-success-eyebrow">C’est terminé</p>
                <h2>Mot de passe réinitialisé avec succès</h2>
                <p className="auth-intro">Votre compte est sécurisé. Vous pouvez maintenant retourner dans votre dressing.</p>
                <motion.button className="primary-button auth-submit recovery-success-button" type="button" onClick={onContinue} whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}>
                  Retourner dans l’application
                  <ChevronRight size={18} />
                </motion.button>
              </motion.div>
            ) : (
              <motion.div key="recovery-form" initial={false} exit={shouldReduceMotion ? undefined : { opacity: 0, y: -14 }} transition={TRANSITIONS.micro}>
                <p className="eyebrow">Sécurité du compte</p>
                <h2>Créer un nouveau mot de passe</h2>
                <p className="auth-intro">Cette étape est nécessaire avant de retrouver votre dressing.</p>
                <form onSubmit={submit}>
                  <label className="field-label" htmlFor="new-password">Nouveau mot de passe</label>
                  <input className="text-field" id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8 caractères minimum" minLength={8} autoComplete="new-password" required />
                  <label className="field-label password-confirm-label" htmlFor="confirm-password">Confirmer le mot de passe</label>
                  <input className="text-field" id="confirm-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Saisissez-le une seconde fois" minLength={8} autoComplete="new-password" required />
                  <button className="primary-button auth-submit" type="submit" disabled={busy} aria-busy={busy}>
                    {busy ? 'Enregistrement…' : 'Enregistrer le nouveau mot de passe'}
                    {!busy && <ChevronRight size={18} />}
                  </button>
                </form>
                {error && <p className="form-error auth-error" role="alert">{error}</p>}
                <button className="text-link recovery-cancel" type="button" onClick={() => void onCancel()} disabled={busy}>Annuler et revenir à la connexion</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </main>
  )
}
