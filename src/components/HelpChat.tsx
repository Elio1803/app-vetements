import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Bot, MessageCircleQuestion, Send, Sparkles, Trash2, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { TRANSITIONS } from '../lib/animations'
import { answerHelpQuestion, type HelpAction } from '../lib/help-assistant'

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
  action?: HelpAction
  actionLabel?: string
}

interface HelpChatProps {
  onAction: (action: HelpAction) => void
}

const START_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Bonjour ! Je suis l’assistant du Dressing. Comment puis-je vous aider à utiliser l’application ?',
}

const SUGGESTIONS = [
  'Ajouter un vêtement',
  'Générer une tenue',
  'Synchroniser mon Mac',
  'Utiliser l’historique',
]

export function HelpChat({ onAction }: HelpChatProps) {
  const shouldReduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([START_MESSAGE])
  const [thinking, setThinking] = useState(false)
  const messagesEnd = useRef<HTMLDivElement>(null)
  const responseTimer = useRef<number | null>(null)

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth' })
  }, [messages, open, shouldReduceMotion, thinking])

  useEffect(() => () => {
    if (responseTimer.current !== null) window.clearTimeout(responseTimer.current)
  }, [])

  const ask = (value: string) => {
    const cleanQuestion = value.trim()
    if (!cleanQuestion || thinking) return
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: cleanQuestion,
    }
    setMessages((current) => [...current, userMessage])
    setQuestion('')
    setThinking(true)
    responseTimer.current = window.setTimeout(() => {
      const reply = answerHelpQuestion(cleanQuestion)
      setMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        ...reply,
      }])
      setThinking(false)
    }, shouldReduceMotion ? 0 : 320)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    ask(question)
  }

  const runAction = (action: HelpAction) => {
    setOpen(false)
    onAction(action)
  }

  const clearConversation = () => {
    if (responseTimer.current !== null) window.clearTimeout(responseTimer.current)
    responseTimer.current = null
    setThinking(false)
    setMessages([START_MESSAGE])
  }

  return (
    <div className="help-chat">
      <AnimatePresence>
        {open && (
          <motion.section
            className="help-chat-panel"
            role="dialog"
            aria-modal="false"
            aria-labelledby="help-chat-title"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 18, scale: .97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: .98 }}
            transition={TRANSITIONS.hero}
          >
            <header className="help-chat-header">
              <span><Bot size={21} /></span>
              <div>
                <strong id="help-chat-title">Assistant Le Dressing</strong>
                <small><i /> Aide instantanée</small>
              </div>
              <button type="button" onClick={clearConversation} aria-label="Effacer la conversation"><Trash2 size={17} /></button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer l’aide"><X size={19} /></button>
            </header>

            <div className="help-chat-messages" aria-live="polite">
              {messages.map((message) => (
                <div className={`help-message help-message--${message.role}`} key={message.id}>
                  {message.role === 'assistant' && <span className="help-message-icon"><Sparkles size={13} /></span>}
                  <div>
                    <p>{message.text}</p>
                    {message.action && (
                      <button type="button" onClick={() => runAction(message.action!)}>{message.actionLabel}</button>
                    )}
                  </div>
                </div>
              ))}
              {thinking && <div className="help-typing" aria-label="L’assistant écrit"><i /><i /><i /></div>}
              <div ref={messagesEnd} />
            </div>

            {messages.length === 1 && (
              <div className="help-suggestions" aria-label="Questions suggérées">
                {SUGGESTIONS.map((suggestion) => (
                  <button type="button" onClick={() => ask(suggestion)} key={suggestion}>{suggestion}</button>
                ))}
              </div>
            )}

            <form className="help-chat-form" onSubmit={submit}>
              <input
                type="text"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Posez votre question…"
                aria-label="Question pour l’assistant"
                maxLength={180}
              />
              <button type="submit" disabled={!question.trim() || thinking} aria-label="Envoyer"><Send size={18} /></button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <motion.button
        className={open ? 'help-chat-launcher is-open' : 'help-chat-launcher'}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? 'Fermer l’assistant' : 'Ouvrir l’assistant d’aide'}
        aria-expanded={open}
        whileTap={shouldReduceMotion ? undefined : { scale: .94 }}
        transition={TRANSITIONS.spring}
      >
        {open ? <X size={22} /> : <MessageCircleQuestion size={23} />}
        {!open && <span>Aide</span>}
      </motion.button>
    </div>
  )
}
