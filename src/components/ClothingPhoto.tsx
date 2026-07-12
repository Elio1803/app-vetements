import type { ClothingItem } from '../types'

interface ClothingPhotoProps {
  item: ClothingItem
  className?: string
  alt?: string
  eager?: boolean
}

export function ClothingPhoto({
  item,
  className = '',
  alt,
  eager = false,
}: ClothingPhotoProps) {
  const label = alt ?? item.name ?? 'Vêtement'

  if (item.photoPosition) {
    return (
      <div
        className={`clothing-photo ${className}`}
        role="img"
        aria-label={label}
        style={{
          backgroundImage: `url(${item.photoUrl}), ${item.fallbackGradient ?? 'linear-gradient(145deg, #e8e0d4, #f8f5ef)'}`,
          backgroundPosition: `${item.photoPosition}, center`,
          backgroundSize: '300% 300%, cover',
          backgroundRepeat: 'no-repeat',
        }}
      />
    )
  }

  return (
    <img
      className={`clothing-photo ${className}`}
      src={item.photoUrl}
      alt={label}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  )
}
