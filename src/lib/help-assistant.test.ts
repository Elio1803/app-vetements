import { describe, expect, it } from 'vitest'
import { answerHelpQuestion, getHelpSuggestions, type HelpAction } from './help-assistant'

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

  it.each<[string, HelpAction]>([
    ['Je veux réinitialiser mon mot de passe', 'profile'],
    ['Comment isoler le haut sur une tenue complète ?', 'add-item'],
    ['Le détourage laisse encore le fond', 'add-item'],
    ["Pourquoi l'article ne se met pas dans le dressing ?", 'add-item'],
    ['Comment voir uniquement mes chaussures ?', 'wardrobe'],
    ['Pourquoi le bouton Générer est bloqué ?', 'wardrobe'],
    ['Peux-tu tenir compte de la pluie ?', 'generate'],
    ["Je voudrais une tenue pour le travail", 'generate'],
    ["Comment enregistrer ce que je porte aujourd'hui ?", 'generate'],
    ['Comment changer le nom du dressing ?', 'profile'],
    ["Comment l'installer sur mon iPhone ?", 'profile'],
  ])('understands “%s”', (question, action) => {
    expect(answerHelpQuestion(question).action).toBe(action)
  })

  it('adapts its fallback to the current page', () => {
    const reply = answerHelpQuestion('Explique-moi ce bouton mystérieux', 'history')
    expect(reply.text).toContain('Historique')
  })

  it('offers different quick questions on each page', () => {
    expect(getHelpSuggestions('wardrobe')).not.toEqual(getHelpSuggestions('profile'))
    expect(getHelpSuggestions('generate')).toContain('Utiliser la météo')
  })

  it('tolerates small typos in the question', () => {
    expect(answerHelpQuestion('Comment ajouuter un vetement ?').action).toBe('add-item')
    expect(answerHelpQuestion('Commnet synchronizer mon compte ?').action).toBe('profile')
  })

  it('replies to small talk without a generic fallback', () => {
    expect(answerHelpQuestion('Merci beaucoup !').text).toContain('plaisir')
    expect(answerHelpQuestion('Au revoir').text).toContain('bientôt')
  })

  it('personalizes the greeting with the profile name', () => {
    expect(answerHelpQuestion('Bonjour', 'wardrobe', 'Elio').text).toContain('Elio')
    expect(answerHelpQuestion('Bonjour', 'wardrobe').text).not.toContain('undefined')
  })
})
