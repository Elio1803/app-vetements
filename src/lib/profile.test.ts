import { describe, expect, it } from 'vitest'
import { normalizeProfileName, profileNameFromEmail, profileNameFromMetadata } from './profile'

describe('profile personalization', () => {
  it('normalizes a chosen profile name', () => {
    expect(normalizeProfileName('  Élise   Martin  ')).toBe('Élise Martin')
  })

  it('keeps old accounts personalized from their email', () => {
    expect(profileNameFromEmail('elio.painteaux@example.fr')).toBe('Elio Painteaux')
  })

  it('prefers the persisted account metadata', () => {
    expect(profileNameFromMetadata({ display_name: 'Mon Dressing' }, 'elio@example.fr')).toBe('Mon Dressing')
  })
})
