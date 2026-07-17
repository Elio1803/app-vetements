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

  const panelVariants = mobile
    ? {
        initial: { y: '100%' },
        animate: { y: 0 },
        exit: { y: '100%' },
      }
    : {
        initial: { x: '100%' },
        animate: { x: 0 },
        exit: { x: '100%' },
      }
  const panelTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: mobile ? 0.4 : 0.34, ease: [0.16, 1, 0.3, 1] as const }
  const contentTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.2, delay: 0.06, ease: [0.22, 1, 0.36, 1] as const }

  return (
    <AnimatePresence>
      {open && (
        <div className="sheet-layer" role="presentation">
          <motion.button
            className="sheet-backdrop"
            aria-label="Fermer"
            onClick={onClose}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.28, ease: 'easeOut' }}
          />
          <motion.section
            className={`sheet-panel ${wide ? 'sheet-panel--wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-title"
            variants={shouldReduceMotion ? undefined : panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={panelTransition}
          >
            <div className="sheet-handle" aria-hidden="true" />
            <motion.header
              className="sheet-header"
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={contentTransition}
            >
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
            </motion.header>
            <motion.div
              className="sheet-body"
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={shouldReduceMotion ? { duration: 0 } : { ...contentTransition, delay: 0.08 }}
            >
              {children}
            </motion.div>
            {footer && <motion.footer className="sheet-footer" initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={contentTransition}>{footer}</motion.footer>}
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  )
}
