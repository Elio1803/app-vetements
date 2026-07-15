export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton-card-image" />
      <div className="skeleton-card-line skeleton-card-line--wide" />
      <div className="skeleton-card-line" />
    </div>
  )
}
