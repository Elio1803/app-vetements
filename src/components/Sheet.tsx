import type { PropsWithChildren, ReactNode } from 'react'
import { X } from 'lucide-react'

interface SheetProps extends PropsWithChildren {
  open: boolean
  title: string
  eyebrow?: string
  onClose: () => void
  footer?: ReactNode
  wide?: boolean
}

export function Sheet({ open, title, eyebrow, onClose, footer, wide = false, children }: SheetProps) {
  if (!open) return null

  return (
    <div className="sheet-layer" role="presentation">
      <button className="sheet-backdrop" aria-label="Fermer" onClick={onClose} />
      <section
        className={`sheet-panel ${wide ? 'sheet-panel--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id="sheet-title">{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-footer">{footer}</footer>}
      </section>
    </div>
  )
}
