import { type PropsWithChildren, type ReactNode, useEffect, useState } from 'react'
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
            className={`sheet-panel ${wide ? 'sheet-panel--wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-title"
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
