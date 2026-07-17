import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Bot, MessageCircleQuestion, Send, Sparkles, Trash2, X } from 'lucide-react'
import { type FormEvent, type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TRANSITIONS } from '../lib/animations'
import {
  answerHelpQuestion,
  getHelpContextLabel,
  getHelpSuggestions,
  type HelpAction,
  type HelpContext,
} from '../lib/help-assistant'

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
  action?: HelpAction
  actionLabel?: string
}

interface HelpChatProps {
  currentView: HelpContext
  onAction: (action: HelpAction) => void
}

const START_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Bonjour ! Je suis l’assistant du Dressing. Comment puis-je vous aider à utiliser l’application ?',
}

export function HelpChat({ currentView, onAction }: HelpChatProps) {
  const shouldReduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([START_MESSAGE])
  const [thinking, setThinking] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const launcher = useRef<HTMLButtonElement>(null)
  const messagesContainer = useRef<HTMLDivElement>(null)
  const responseTimer = useRef<number | null>(null)
  const lastTouchY = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      const container = messagesContainer.current
      if (!container) return
      container.scrollTo({
        top: container.scrollHeight,
        behavior: shouldReduceMotion ? 'auto' : 'smooth',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [messages, open, shouldReduceMotion, thinking])

  useEffect(() => {
    if (!open) return undefined
    const appRoot = document.getElementById('root')
    document.documentElement.classList.add('is-chat-open')
    if (appRoot) appRoot.inert = true
    const frame = window.requestAnimationFrame(() => {
      const mobile = window.matchMedia('(max-width: 680px)').matches
      ;(mobile ? panel.current : input.current)?.focus({ preventScroll: true })
    })

    return () => {
      window.cancelAnimationFrame(frame)
      document.documentElement.classList.remove('is-chat-open')
      if (appRoot) appRoot.inert = false
      window.requestAnimationFrame(() => launcher.current?.focus({ preventScroll: true }))
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const rememberTouchPosition = (event: TouchEvent) => {
      const target = event.target
      lastTouchY.current = target instanceof Element && target.closest('.help-chat-messages')
        ? event.touches[0]?.clientY ?? null
        : null
    }
    const preventBackgroundScroll = (event: TouchEvent | WheelEvent) => {
      const target = event.target
      const messages = target instanceof Element
        ? target.closest<HTMLElement>('.help-chat-messages')
        : null

      if (messages) {
        if (event instanceof TouchEvent) {
          const currentTouchY = event.touches[0]?.clientY
          if (currentTouchY !== undefined && lastTouchY.current !== null) {
            messages.scrollTop += lastTouchY.current - currentTouchY
          }
          lastTouchY.current = currentTouchY ?? null
        } else {
          messages.scrollTop += event.deltaY
        }
      }
      event.preventDefault()
    }

    document.addEventListener('touchstart', rememberTouchPosition, { passive: true, capture: true })
    document.addEventListener('touchmove', preventBackgroundScroll, { passive: false, capture: true })
    document.addEventListener('wheel', preventBackgroundScroll, { passive: false, capture: true })

    return () => {
      document.removeEventListener('touchstart', rememberTouchPosition, true)
      document.removeEventListener('touchmove', preventBackgroundScroll, true)
      document.removeEventListener('wheel', preventBackgroundScroll, true)
      lastTouchY.current = null
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const pageScrollPosition = window.scrollY
    const viewport = window.visualViewport
    const fitVisibleViewport = () => {
      const element = panel.current
      if (!element) return
      element.style.top = `${Math.round(viewport?.offsetTop ?? 0)}px`
      element.style.left = `${Math.round(viewport?.offsetLeft ?? 0)}px`
      element.style.width = `${Math.round(viewport?.width ?? window.innerWidth)}px`
      element.style.height = `${Math.round(viewport?.height ?? window.innerHeight)}px`
    }

    fitVisibleViewport()
    const frame = window.requestAnimationFrame(fitVisibleViewport)
    viewport?.addEventListener('resize', fitVisibleViewport)
    viewport?.addEventListener('scroll', fitVisibleViewport)
    window.addEventListener('resize', fitVisibleViewport)

    return () => {
      window.cancelAnimationFrame(frame)
      viewport?.removeEventListener('resize', fitVisibleViewport)
      viewport?.removeEventListener('scroll', fitVisibleViewport)
      window.removeEventListener('resize', fitVisibleViewport)
      window.requestAnimationFrame(() => window.scrollTo({ top: pageScrollPosition, behavior: 'auto' }))
    }
  }, [open])

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
      const reply = answerHelpQuestion(cleanQuestion, currentView)
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

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      return
    }
    if (event.key !== 'Tab') return

    const focusable = [...(panel.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [])].filter((element) => element.offsetParent !== null)
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable.at(-1)!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className="help-chat">
      <AnimatePresence>
        {open && (
          <motion.div
            className="help-chat-backdrop"
            aria-hidden="true"
            onClick={() => setOpen(false)}
            onTouchMove={(event) => event.preventDefault()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : .18 }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <motion.section
            className="help-chat-panel"
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-chat-title"
            tabIndex={-1}
            onKeyDown={handleDialogKeyDown}
            initial={false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            transition={TRANSITIONS.hero}
          >
            <header className="help-chat-header">
              <span><Bot size={21} /></span>
              <div>
                <strong id="help-chat-title">Assistant Le Dressing</strong>
                <small><i /> Aide · {getHelpContextLabel(currentView)}</small>
              </div>
              <button type="button" onClick={clearConversation} aria-label="Effacer la conversation"><Trash2 size={17} /></button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer l’aide"><X size={19} /></button>
            </header>

            <div className="help-chat-messages" aria-live="polite" ref={messagesContainer}>
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
            </div>

            {messages.length === 1 && (
              <div className="help-suggestions" aria-label="Questions suggérées">
                {getHelpSuggestions(currentView).map((suggestion) => (
                  <button type="button" onClick={() => ask(suggestion)} key={suggestion}>{suggestion}</button>
                ))}
              </div>
            )}

            <form className="help-chat-form" onSubmit={submit}>
              <input
                ref={input}
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
        ref={launcher}
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
    </div>,
    document.body,
  )
}
