interface BrandMarkProps {
  compact?: boolean
  inverse?: boolean
}

export function BrandMark({ compact = false, inverse = false }: BrandMarkProps) {
  return (
    <div className="brand-mark" aria-label="Le Dressing">
      <span className={`brand-monogram ${inverse ? 'brand-monogram--inverse' : ''}`} aria-hidden="true">
        D
      </span>
      {!compact && (
        <span className="brand-copy">
          <span>Le</span>
          <strong>Dressing</strong>
        </span>
      )}
    </div>
  )
}
