// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createLocalAccount,
  getLocalSession,
  signInLocalAccount,
  signOutLocalAccount,
} from './local-auth'

describe('local account authentication', () => {
  beforeEach(() => localStorage.clear())

  it('creates, restores and signs out of an account', async () => {
    const account = await createLocalAccount('Moi@Exemple.fr', 'motdepasse-solide')
    expect(account.email).toBe('moi@exemple.fr')
    expect(getLocalSession()).toEqual(account)

    signOutLocalAccount()
    expect(getLocalSession()).toBeNull()
    await expect(signInLocalAccount('moi@exemple.fr', 'motdepasse-solide')).resolves.toEqual(account)
  })

  it('rejects an incorrect password', async () => {
    await createLocalAccount('moi@exemple.fr', 'motdepasse-solide')
    signOutLocalAccount()
    await expect(signInLocalAccount('moi@exemple.fr', 'mauvais-mot-de-passe')).rejects.toThrow(
      'Adresse e-mail ou mot de passe incorrect.',
    )
  })
})
