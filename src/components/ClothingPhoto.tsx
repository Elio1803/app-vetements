import type { ClothingItem } from '../types'
import { motion } from 'framer-motion'

interface ClothingPhotoProps {
  item: ClothingItem
  className?: string
  alt?: string
  eager?: boolean
  layoutId?: string
}

export function ClothingPhoto({
  item,
  className = '',
  alt,
  eager = false,
  layoutId,
}: ClothingPhotoProps) {
  const label = alt ?? item.name ?? 'Vêtement'

  if (item.photoPosition) {
    return (
      <motion.div
        layoutId={layoutId}
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
    <motion.img
      layoutId={layoutId}
      className={`clothing-photo ${className}`}
      src={item.photoUrl}
      alt={label}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  )
}
