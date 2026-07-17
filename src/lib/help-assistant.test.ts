import { describe, expect, it } from 'vitest'
import { answerHelpQuestion } from './help-assistant'

describe('help assistant', () => {
  it('guides a user who wants to add clothing', () => {
    expect(answerHelpQuestion('Comment ajouter un vêtement ?').action).toBe('add-item')
  })

  it('guides cross-device synchronization', () => {
    const reply = answerHelpQuestion('Je ne retrouve pas mes pièces sur mon Mac')
    expect(reply.action).toBe('profile')
    expect(reply.text).toContain('même adresse e-mail')
  })

  it('explains how to populate outfit history', () => {
    expect(answerHelpQuestion('Comment fonctionne le calendrier ?').action).toBe('history')
  })
})
