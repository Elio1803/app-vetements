import type { ClothingItem } from '../types'
import { ClothingPhoto } from './ClothingPhoto'

interface OutfitBoardProps {
  items: ClothingItem[]
  lookNumber: number
  variant?: 'outfit' | 'garment'
}

export function OutfitBoard({ items, lookNumber, variant = 'outfit' }: OutfitBoardProps) {
  const bodyItems = [...items]
    .sort((left, right) => {
      const order: ClothingItem['category'][] = ['bas', 'haut', 'veste_manteau', 'robe', 'chaussures', 'accessoire']
      return order.indexOf(left.category) - order.indexOf(right.category)
    })

  return (
    <div
      className={`outfit-board outfit-board--${variant}`}
      role="img"
      aria-label={`Planche de la tenue ${lookNumber} : ${items.map((item) => item.name).join(', ')}`}
    >
      <span className="outfit-board-kicker">{variant === 'garment' ? 'Aperçu mannequin' : `Look 0${lookNumber}`}</span>
      <div className="outfit-board-model" aria-hidden="true">
        <svg viewBox="0 0 180 430" focusable="false">
          <defs>
            <linearGradient id={`shop-shell-${variant}`} x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#fffdf7" />
              <stop offset="0.52" stopColor="#e7e1d7" />
              <stop offset="1" stopColor="#c7beb0" />
            </linearGradient>
            <radialGradient id={`shop-head-${variant}`} cx="35%" cy="26%" r="78%">
              <stop offset="0" stopColor="#fffef9" />
              <stop offset="1" stopColor="#d2cabd" />
            </radialGradient>
          </defs>
          <ellipse className="mannequin-shadow" cx="91" cy="414" rx="57" ry="10" />
          <path className="mannequin-stand" d="M87 369h8v38h35v8H52v-8h35v-38Z" />
          <ellipse className="mannequin-head" cx="90" cy="45" rx="23" ry="31" fill={`url(#shop-head-${variant})`} />
          <path className="mannequin-neck" d="M78 70c5 6 19 6 24 0l4 31H74l4-31Z" fill={`url(#shop-shell-${variant})`} />
          <path className="mannequin-torso" d="M58 101c8-8 19-12 32-12s25 4 33 12l12 78c2 18-8 31-22 37l-8 5H75l-8-5c-14-6-24-19-22-37l13-78Z" fill={`url(#shop-shell-${variant})`} />
          <path className="mannequin-limb" d="M58 101c-10 5-15 13-17 27L27 225c-1 9 2 14 8 15 7 1 11-4 13-13l25-108-15-18Z" fill={`url(#shop-shell-${variant})`} />
          <path className="mannequin-limb" d="M123 101c10 5 15 14 17 27l13 78c2 10 7 25 11 36 3 8 0 14-6 16-7 2-12-2-15-10l-17-40-18-89 15-18Z" fill={`url(#shop-shell-${variant})`} />
          <path className="mannequin-limb" d="M74 208h31l-2 86 18 100c2 10-3 16-11 17-8 1-13-4-14-13L89 300l-7 99c-1 9-6 14-14 13-8-1-12-7-10-17l18-101-2-86Z" fill={`url(#shop-shell-${variant})`} />
          <path className="mannequin-joint" d="M47 205c5 3 9 4 14 1M126 205c5 1 9 0 13-3M75 217c10 4 21 4 31 0M89 91v122" />
          <path className="mannequin-face" d="M84 43h2m9 0h2M87 58c2 1 4 1 6 0" />
        </svg>

        {bodyItems.map((item) => (
          <div
            className={`outfit-board-worn outfit-board-worn--${item.category}`}
            key={`worn-${item.id}`}
          >
            <ClothingPhoto item={item} alt="" eager />
          </div>
        ))}
      </div>

      <div className="outfit-board-pieces" aria-hidden="true">
        {items.slice(0, 4).map((item) => (
          <div className={`outfit-board-piece outfit-board-piece--${item.category}`} key={item.id}>
            <ClothingPhoto item={item} alt="" eager />
            <span>{item.name}</span>
          </div>
        ))}
      </div>
      <span className="outfit-board-script">le dressing</span>
    </div>
  )
}
