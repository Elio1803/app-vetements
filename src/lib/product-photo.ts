import type { ClothingCategory } from '../types'

const OUTPUT_WIDTH = 1200
const OUTPUT_HEIGHT = 1500

export type GarmentFocus =
  | 'top_short'
  | 'top_long'
  | 'short_skirt'
  | 'pants'
  | 'shoes'
  | 'outerwear'
  | 'dress'
  | 'accessory'

function canvasAsDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/jpeg', 0.92)
}

function findVisibleBounds(context: CanvasRenderingContext2D, width: number, height: number) {
  const pixels = context.getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (pixels[(y * width + x) * 4 + 3] > 18) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }

  return maxX > minX && maxY > minY
    ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    : { x: 0, y: 0, width, height }
}

function makeCutoutReadable(context: CanvasRenderingContext2D, width: number, height: number) {
  const image = context.getImageData(0, 0, width, height)
  const pixels = image.data

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3]
    if (alpha <= 12) {
      pixels[index + 3] = 0
      continue
    }

    pixels[index + 3] = 255
  }

  context.putImageData(image, 0, 0)
}

export function defaultFocusForCategory(category: ClothingCategory): GarmentFocus {
  const defaults: Record<ClothingCategory, GarmentFocus> = {
    haut: 'top_short',
    bas: 'short_skirt',
    chaussures: 'shoes',
    veste_manteau: 'outerwear',
    accessoire: 'accessory',
    robe: 'dress',
  }
  return defaults[category]
}

function focusBounds(focus: GarmentFocus, width: number, height: number) {
  const presets: Record<GarmentFocus, { x: number; y: number; width: number; height: number }> = {
    top_short: { x: 0.12, y: 0.1, width: 0.76, height: 0.42 },
    top_long: { x: 0.12, y: 0.08, width: 0.76, height: 0.55 },
    short_skirt: { x: 0.2, y: 0.42, width: 0.6, height: 0.26 },
    pants: { x: 0.16, y: 0.38, width: 0.68, height: 0.56 },
    shoes: { x: 0.08, y: 0.72, width: 0.84, height: 0.26 },
    outerwear: { x: 0.1, y: 0.08, width: 0.8, height: 0.74 },
    dress: { x: 0.12, y: 0.12, width: 0.76, height: 0.82 },
    accessory: { x: 0.16, y: 0.12, width: 0.68, height: 0.68 },
  }
  const preset = presets[focus]

  return {
    x: Math.max(0, Math.round(width * preset.x)),
    y: Math.max(0, Math.round(height * preset.y)),
    width: Math.min(width, Math.round(width * preset.width)),
    height: Math.min(height, Math.round(height * preset.height)),
  }
}

export async function focusPhotoOnCategory(file: File, focus: GarmentFocus): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('Ce fichier n’est pas une image.')

  const bitmap = await createImageBitmap(file)
  const bounds = focusBounds(focus, bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  const padding = Math.round(Math.min(bounds.width, bounds.height) * 0.08)
  canvas.width = bounds.width + padding * 2
  canvas.height = bounds.height + padding * 2
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Recadrage indisponible sur cet appareil.')

  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, bounds.x, bounds.y, bounds.width, bounds.height, padding, padding, bounds.width, bounds.height)
  bitmap.close()

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Recadrage indisponible.')), 'image/jpeg', 0.94)
  })

  return new File([blob], file.name || 'vetement.jpg', { type: 'image/jpeg' })
}

export async function createProductPhoto(file: File): Promise<string> {
  const { removeBackground } = await import('@imgly/background-removal')
  const cutout = await removeBackground(file, {
    model: 'isnet_quint8',
    device: 'cpu',
    output: { format: 'image/png', quality: 1 },
  })
  const bitmap = await createImageBitmap(cutout)

  const source = document.createElement('canvas')
  source.width = bitmap.width
  source.height = bitmap.height
  const sourceContext = source.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) throw new Error('Le détourage est indisponible sur cet appareil.')
  sourceContext.drawImage(bitmap, 0, 0)
  makeCutoutReadable(sourceContext, bitmap.width, bitmap.height)
  const bounds = findVisibleBounds(sourceContext, bitmap.width, bitmap.height)

  const output = document.createElement('canvas')
  output.width = OUTPUT_WIDTH
  output.height = OUTPUT_HEIGHT
  const context = output.getContext('2d')
  if (!context) throw new Error('La photo produit ne peut pas être créée.')
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT)

  const maximumWidth = OUTPUT_WIDTH * 0.82
  const maximumHeight = OUTPUT_HEIGHT * 0.82
  const scale = Math.min(maximumWidth / bounds.width, maximumHeight / bounds.height)
  const width = bounds.width * scale
  const height = bounds.height * scale
  const x = (OUTPUT_WIDTH - width) / 2
  const y = (OUTPUT_HEIGHT - height) / 2

  context.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, x, y, width, height)
  bitmap.close()

  return canvasAsDataUrl(output)
}
