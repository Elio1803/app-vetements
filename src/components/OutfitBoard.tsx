import type { ClothingItem } from '../types'
import { ClothingPhoto } from './ClothingPhoto'

interface OutfitBoardProps {
  items: ClothingItem[]
  lookNumber: number
}

const BODY_CATEGORIES = new Set<ClothingItem['category']>([
  'bas',
  'haut',
  'veste_manteau',
  'robe',
])

export function OutfitBoard({ items, lookNumber }: OutfitBoardProps) {
  const bodyItems = [...items]
    .filter((item) => BODY_CATEGORIES.has(item.category))
    .sort((left, right) => {
      const order: ClothingItem['category'][] = ['bas', 'haut', 'veste_manteau', 'robe']
      return order.indexOf(left.category) - order.indexOf(right.category)
    })

  return (
    <div
      className="outfit-board"
      role="img"
      aria-label={`Planche de la tenue ${lookNumber} : ${items.map((item) => item.name).join(', ')}`}
    >
      <span className="outfit-board-kicker">Look 0{lookNumber}</span>
      <div className="outfit-board-model" aria-hidden="true">
        <svg viewBox="0 0 180 430" focusable="false">
          <path className="mannequin-hair" d="M54 55C54 20 77 5 100 10c23 5 31 27 26 53-6-10-12-17-23-22-14 12-30 17-49 14Z" />
          <circle className="mannequin-skin" cx="91" cy="54" r="26" />
          <path className="mannequin-skin" d="M79 76h24l3 27H76l3-27Z" />
          <path className="mannequin-body" d="M61 101c15-10 45-10 60 0l15 87-29 16H75l-29-16 15-87Z" />
          <path className="mannequin-skin" d="M52 105 31 205l13 5 31-94-23-11ZM127 105l22 100-13 5-32-94 23-11Z" />
          <path className="mannequin-skin" d="M76 194h31l5 207-16 1-6-162-7 162-17-1 10-207Z" />
          <ellipse className="mannequin-shoe" cx="73" cy="407" rx="19" ry="8" />
          <ellipse className="mannequin-shoe" cx="105" cy="407" rx="19" ry="8" />
          <path className="mannequin-detail" d="M83 45c5 3 12 3 17 0M87 62c3 2 6 2 9 0" />
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
