import { CalendarDays, ChevronLeft, ChevronRight, Shirt } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ClothingItem, Outfit } from '../types'
import { OCCASION_LABELS } from '../lib/wardrobe-utils'
import { ClothingPhoto } from './ClothingPhoto'

const WEEK_DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function localDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function monthLabel(date: Date): string {
  const value = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date)
  return `${value.charAt(0).toLocaleUpperCase('fr')}${value.slice(1)}`
}

function calendarCells(month: Date): Array<Date | null> {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstDayOffset = (new Date(year, monthIndex, 1).getDay() + 6) % 7
  const dayCount = new Date(year, monthIndex + 1, 0).getDate()
  const cells: Array<Date | null> = Array.from({ length: firstDayOffset }, () => null)
  for (let day = 1; day <= dayCount; day += 1) cells.push(new Date(year, monthIndex, day))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function OutfitHistory({ outfits, items }: { outfits: Outfit[]; items: ClothingItem[] }) {
  const wornOutfits = useMemo(
    () => outfits
      .filter((outfit): outfit is Outfit & { wornAt: string } => Boolean(outfit.wornAt))
      .sort((a, b) => Date.parse(b.wornAt) - Date.parse(a.wornAt)),
    [outfits],
  )
  const initialDate = wornOutfits[0] ? new Date(wornOutfits[0].wornAt) : new Date()
  const [month, setMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(initialDate))
  const outfitsByDay = useMemo(() => {
    const grouped = new Map<string, Array<Outfit & { wornAt: string }>>()
    for (const outfit of wornOutfits) {
      const key = localDateKey(outfit.wornAt)
      grouped.set(key, [...(grouped.get(key) ?? []), outfit])
    }
    return grouped
  }, [wornOutfits])
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const cells = useMemo(() => calendarCells(month), [month])
  const selectedOutfits = outfitsByDay.get(selectedDate) ?? []

  const changeMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1)
    setMonth(next)
    const firstWornDay = cellsForMonth(outfitsByDay, next)[0]
    setSelectedDate(firstWornDay ?? localDateKey(next))
  }

  if (!wornOutfits.length) {
    return (
      <div className="history-empty">
        <span><CalendarDays size={28} /></span>
        <h3>Aucune tenue portée pour le moment</h3>
        <p>Depuis une proposition, choisissez « Porter aujourd’hui ». Elle apparaîtra ensuite dans ce calendrier.</p>
      </div>
    )
  }

  return (
    <div className="outfit-history">
      <section className="history-calendar" aria-label="Calendrier des tenues portées">
        <header>
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Mois précédent"><ChevronLeft size={18} /></button>
          <strong>{monthLabel(month)}</strong>
          <button type="button" onClick={() => changeMonth(1)} aria-label="Mois suivant"><ChevronRight size={18} /></button>
        </header>
        <div className="history-weekdays" aria-hidden="true">
          {WEEK_DAYS.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
        </div>
        <div className="history-days">
          {cells.map((date, index) => {
            if (!date) return <span className="history-day history-day--blank" key={`blank-${index}`} />
            const key = localDateKey(date)
            const count = outfitsByDay.get(key)?.length ?? 0
            const isSelected = key === selectedDate
            const isToday = key === localDateKey(new Date())
            return (
              <button
                type="button"
                className={`history-day${count ? ' has-outfit' : ''}${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                key={key}
                onClick={() => setSelectedDate(key)}
                aria-label={`${date.toLocaleDateString('fr-FR')}${count ? `, ${count} tenue${count > 1 ? 's' : ''}` : ''}`}
              >
                <span>{date.getDate()}</span>
                {count > 0 && <i>{count > 1 ? count : ''}</i>}
              </button>
            )
          })}
        </div>
      </section>

      <section className="history-list" aria-live="polite">
        <div className="history-list-heading">
          <p>Tenues portées</p>
          <strong>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
        </div>
        {selectedOutfits.length ? selectedOutfits.map((outfit) => {
          const outfitItems = outfit.itemIds.map((id) => itemById.get(id)).filter((item): item is ClothingItem => Boolean(item))
          return (
            <article className="history-outfit" key={outfit.id}>
              <div className="history-outfit-photos">
                {outfitItems.slice(0, 4).map((item) => <ClothingPhoto item={item} key={item.id} />)}
                {!outfitItems.length && <span className="history-missing-photo"><Shirt size={20} /></span>}
              </div>
              <div>
                <small>{OCCASION_LABELS[outfit.occasion]}</small>
                <h4>{outfit.name ?? 'Tenue portée'}</h4>
                <p>{outfitItems.length} pièce{outfitItems.length > 1 ? 's' : ''} · {new Date(outfit.wornAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </article>
          )
        }) : (
          <p className="history-no-day">Aucune tenue enregistrée ce jour-là.</p>
        )}
      </section>
    </div>
  )
}

function cellsForMonth(
  outfitsByDay: Map<string, Array<Outfit & { wornAt: string }>>,
  month: Date,
): string[] {
  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-`
  return [...outfitsByDay.keys()].filter((key) => key.startsWith(prefix)).sort()
}
