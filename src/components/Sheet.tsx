import { type KeyboardEvent as ReactKeyboardEvent, type PropsWithChildren, type ReactNode, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { TRANSITIONS } from '../lib/animations'

interface SheetProps extends PropsWithChildren {
  open: boolean
  title: string
  eyebrow?: string
  onClose: () => void
  footer?: ReactNode
  wide?: boolean
}

export function Sheet({ open, title, eyebrow, onClose, footer, wide = false, children }: SheetProps) {
  const shouldReduceMotion = useReducedMotion()
  const panelRef = useRef<HTMLElement>(null)
  const [mobile, setMobile] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 680px)').matches
  ))

  useEffect(() => {
    const query = window.matchMedia('(max-width: 680px)')
    const update = () => setMobile(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.documentElement.classList.add('is-sheet-open')
    const frame = window.requestAnimationFrame(() => {
      const firstControl = panelRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      ;(firstControl ?? panelRef.current)?.focus({ preventScroll: true })
    })

    return () => {
      window.cancelAnimationFrame(frame)
      document.documentElement.classList.remove('is-sheet-open')
      previouslyFocused?.focus({ preventScroll: true })
    }
  }, [open])

  const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [])].filter((element) => element.offsetParent !== null)
    if (!focusable.length) {
      event.preventDefault()
      panelRef.current?.focus()
      return
    }
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

  const panelExit = mobile ? { y: '100%' } : { x: '100%' }
  const exitTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: mobile ? 0.3 : 0.26, ease: [0.4, 0, 1, 1] as const }

  return (
    <AnimatePresence>
      {open && (
        <div className="sheet-layer" role="presentation">
          <motion.button
            className="sheet-backdrop"
            aria-label="Fermer"
            onClick={onClose}
            initial={false}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
          />
          <motion.section
            ref={panelRef}
            className={`sheet-panel ${wide ? 'sheet-panel--wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-title"
            tabIndex={-1}
            onKeyDown={handlePanelKeyDown}
            initial={false}
            exit={shouldReduceMotion ? undefined : panelExit}
            transition={exitTransition}
          >
            <div className="sheet-handle" aria-hidden="true" />
            <header className="sheet-header">
              <div>
                {eyebrow && <p className="eyebrow">{eyebrow}</p>}
                <h2 id="sheet-title">{title}</h2>
              </div>
              <motion.button
                className="icon-button"
                onClick={onClose}
                aria-label="Fermer"
                whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                transition={TRANSITIONS.spring}
              >
                <X size={20} />
              </motion.button>
            </header>
            <div className="sheet-body">
              {children}
            </div>
            {footer && <footer className="sheet-footer">{footer}</footer>}
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  )
}
