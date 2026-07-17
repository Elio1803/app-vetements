import type { ClothingItem } from '../types'
import { motion } from 'framer-motion'
import { Shirt } from 'lucide-react'
import { memo, useEffect, useState } from 'react'

interface ClothingPhotoProps {
  item: ClothingItem
  className?: string
  alt?: string
  eager?: boolean
  layoutId?: string
}

export const ClothingPhoto = memo(function ClothingPhoto({
  item,
  className = '',
  alt,
  eager = false,
  layoutId,
}: ClothingPhotoProps) {
  const label = alt ?? item.name ?? 'Vêtement'
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setFailed(false)
    setLoaded(false)
    if (!item.photoPosition) return undefined

    const image = new Image()
    image.onload = () => setLoaded(true)
    image.onerror = () => setFailed(true)
    image.src = item.photoUrl
    return () => {
      image.onload = null
      image.onerror = null
    }
  }, [item.photoPosition, item.photoUrl])

  if (failed) {
    return (
      <motion.div
        layoutId={layoutId}
        className={`clothing-photo clothing-photo--fallback ${className}`}
        role="img"
        aria-label={`${label}, photo indisponible`}
        style={{ background: item.fallbackGradient ?? 'linear-gradient(145deg, #e8e0d4, #f8f5ef)' }}
      >
        <Shirt aria-hidden="true" size={28} />
      </motion.div>
    )
  }

  if (item.photoPosition) {
    return (
      <motion.div
        layoutId={layoutId}
        className={`clothing-photo ${loaded ? 'is-loaded' : 'is-loading'} ${className}`}
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
      className={`clothing-photo ${loaded ? 'is-loaded' : 'is-loading'} ${className}`}
      src={item.photoUrl}
      alt={label}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : 'auto'}
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  )
})
