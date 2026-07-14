import { Shirt } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'

interface LoadingScreenProps {
  brand?: string
  onFinish?: () => void
  persistent?: boolean
}

interface IconProps {
  size?: number
  color?: string
}

const ITEM_TYPES = ['shirt', 'hanger', 'pants'] as const

const FALLING_ITEMS = Array.from({ length: 10 }).map((_, index) => {
  const type = ITEM_TYPES[index % ITEM_TYPES.length]
  const left = 8 + ((index * 10.5) % 84)
  const size = 38 + ((index * 9) % 30)
  const delay = (index % 5) * 0.14
  const duration = 1.95 + ((index * 13) % 6) / 10
  const drift = (index % 2 === 0 ? 1 : -1) * (26 + (index % 4) * 8)
  const rotateStart = (index % 2 === 0 ? -1 : 1) * (15 + (index % 3) * 10)
  const rotateEnd = (index % 2 === 0 ? 1 : -1) * (25 + (index % 4) * 8)
  return { id: index, type, left, size, delay, duration, drift, rotateStart, rotateEnd }
})

function HangerIcon({ size = 28, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3a1.5 1.5 0 1 1 1.5 1.5c-.3 0-.5.2-.5.5v1l7 4.2c.9.5 1.3 1.6.9 2.6-.3.7-1 1.2-1.8 1.2H5c-.8 0-1.5-.5-1.8-1.2-.4-1 0-2.1.9-2.6l7-4.2v-1c0-.3-.2-.5-.5-.5"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <line x1="4" y1="16.8" x2="20" y2="16.8" stroke={color} strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  )
}

function PantsIcon({ size = 28, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3h12l.7 8.5.9 8a1 1 0 0 1-1 1.1h-2.4a1 1 0 0 1-1-.9L14.3 12h-.6l-.9 7.7a1 1 0 0 1-1 .9H9.4a1 1 0 0 1-1-1.1l.9-8L10 3"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <line x1="6.2" y1="6.4" x2="17.8" y2="6.4" stroke={color} strokeWidth="1.4" />
    </svg>
  )
}

function renderItem(type: (typeof ITEM_TYPES)[number], size: number, color: string) {
  if (type === 'hanger') return <HangerIcon size={size} color={color} />
  if (type === 'pants') return <PantsIcon size={size} color={color} />
  return <Shirt size={size} color={color} strokeWidth={1.4} />
}

export function LoadingScreen({ brand = 'Le Dressing', onFinish, persistent = false }: LoadingScreenProps) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (persistent) return undefined

    const leaveTimer = window.setTimeout(() => setLeaving(true), 2100)
    const finishTimer = window.setTimeout(() => onFinish?.(), 2600)
    return () => {
      window.clearTimeout(leaveTimer)
      window.clearTimeout(finishTimer)
    }
  }, [onFinish, persistent])

  return (
    <div className={leaving ? 'loading-screen is-leaving' : 'loading-screen'} aria-label="Ouverture de Le Dressing" role="status">
      {FALLING_ITEMS.map((item) => (
        <span
          className="loading-falling-item"
          key={item.id}
          style={{
            '--delay': `${item.delay}s`,
            '--drift': `${item.drift}px`,
            '--duration': `${item.duration}s`,
            '--left': `${item.left}%`,
            '--rotate-end': `${item.rotateEnd}deg`,
            '--rotate-start': `${item.rotateStart}deg`,
          } as CSSProperties}
        >
          {renderItem(item.type, item.size, 'currentColor')}
        </span>
      ))}

      <div className="loading-brand">
        <span className="loading-hanger"><HangerIcon size={48} /></span>
        <strong>{brand}</strong>
        <small>Préparation de votre dressing</small>
      </div>
    </div>
  )
}
