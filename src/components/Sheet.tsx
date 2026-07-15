import type { PropsWithChildren, ReactNode } from 'react'
import { X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { sheetVariants, TRANSITIONS } from '../lib/animations'

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
            transition={TRANSITIONS.screen}
          />
          <motion.section
            className={`sheet-panel ${wide ? 'sheet-panel--wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-title"
            variants={shouldReduceMotion ? undefined : sheetVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={TRANSITIONS.hero}
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
            <div className="sheet-body">{children}</div>
            {footer && <footer className="sheet-footer">{footer}</footer>}
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  )
}
