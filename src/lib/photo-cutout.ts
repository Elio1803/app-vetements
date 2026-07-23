export interface PixelBounds {
  x: number
  y: number
  width: number
  height: number
}

const BOUNDS_ALPHA_THRESHOLD = 18
const BOUNDS_SAFETY_MARGIN_RATIO = 0.02
const TRANSPARENT_ALPHA_THRESHOLD = 12

export function computeNormalizedDimensions(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function findVisibleBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): PixelBounds {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > BOUNDS_ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width, height }
  }

  const visibleWidth = maxX - minX + 1
  const visibleHeight = maxY - minY + 1
  const marginX = Math.round(visibleWidth * BOUNDS_SAFETY_MARGIN_RATIO)
  const marginY = Math.round(visibleHeight * BOUNDS_SAFETY_MARGIN_RATIO)
  const x = Math.max(0, minX - marginX)
  const y = Math.max(0, minY - marginY)
  const rightEdge = Math.min(width, maxX + 1 + marginX)
  const bottomEdge = Math.min(height, maxY + 1 + marginY)

  return { x, y, width: rightEdge - x, height: bottomEdge - y }
}

export function softenCutoutEdges(pixels: Uint8ClampedArray): void {
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] <= TRANSPARENT_ALPHA_THRESHOLD) {
      pixels[index + 3] = 0
    }
  }
}

const DEFAULT_MIN_RELATIVE_AREA = 0.2

export function removeDetachedFragments(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  minRelativeArea = DEFAULT_MIN_RELATIVE_AREA,
): void {
  const labels = new Int32Array(width * height).fill(-1)
  const areas: number[] = []
  const queue = new Int32Array(width * height)

  for (let start = 0; start < width * height; start++) {
    if (labels[start] !== -1 || pixels[start * 4 + 3] <= BOUNDS_ALPHA_THRESHOLD) continue

    const label = areas.length
    let queueEnd = 0
    let queueStart = 0
    queue[queueEnd++] = start
    labels[start] = label
    let area = 0

    while (queueStart < queueEnd) {
      const index = queue[queueStart++]
      area++
      const x = index % width
      const y = (index - x) / width

      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ]
      for (const neighbor of neighbors) {
        if (neighbor === -1 || labels[neighbor] !== -1) continue
        if (pixels[neighbor * 4 + 3] <= BOUNDS_ALPHA_THRESHOLD) continue
        labels[neighbor] = label
        queue[queueEnd++] = neighbor
      }
    }

    areas.push(area)
  }

  if (areas.length <= 1) return

  let largestArea = 0
  for (const area of areas) {
    if (area > largestArea) largestArea = area
  }
  const minArea = largestArea * minRelativeArea

  for (let index = 0; index < width * height; index++) {
    const label = labels[index]
    if (label === -1) continue
    if (areas[label] < minArea) {
      pixels[index * 4 + 3] = 0
    }
  }
}

const OUTPUT_WIDTH = 900
const OUTPUT_HEIGHT = 1125
const MAX_FILL_RATIO = 0.82
const MAX_UPLOAD_DIMENSION = 2200
const NORMALIZED_JPEG_QUALITY = 0.9

export async function normalizePhotoForUpload(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = computeNormalizedDimensions(bitmap.width, bitmap.height, MAX_UPLOAD_DIMENSION)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Le traitement de la photo est indisponible sur cet appareil.')
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', NORMALIZED_JPEG_QUALITY),
    )
    if (!blob) throw new Error('La photo n’a pas pu être préparée.')
    return new File([blob], file.name || 'vetement.jpg', { type: 'image/jpeg' })
  } catch {
    // If the browser can't decode/process this file client-side (e.g. an
    // unusual source format), fall back to the original file unchanged so
    // whichever pipeline runs next (remove.bg server-side, local model, ...)
    // still gets a chance to handle it, instead of failing the whole flow.
    return file
  }
}

export async function removeBackgroundLocally(file: File): Promise<ImageBitmap> {
  const { removeBackground } = await import('@imgly/background-removal')
  const cutout = await removeBackground(file, {
    model: 'isnet_quint8',
    device: 'cpu',
    output: { format: 'image/png', quality: 1 },
    publicPath: new URL('bg-removal/', document.baseURI).toString(),
  })
  return createImageBitmap(cutout)
}

export async function composeProductPhoto(bitmap: ImageBitmap): Promise<string> {
  const source = document.createElement('canvas')
  source.width = bitmap.width
  source.height = bitmap.height
  const sourceContext = source.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) throw new Error('Le détourage est indisponible sur cet appareil.')
  sourceContext.drawImage(bitmap, 0, 0)

  const image = sourceContext.getImageData(0, 0, bitmap.width, bitmap.height)
  softenCutoutEdges(image.data)
  sourceContext.putImageData(image, 0, 0)
  const bounds = findVisibleBounds(image.data, bitmap.width, bitmap.height)

  const output = document.createElement('canvas')
  output.width = OUTPUT_WIDTH
  output.height = OUTPUT_HEIGHT
  const context = output.getContext('2d')
  if (!context) throw new Error('La photo produit ne peut pas être créée.')
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT)

  const maximumWidth = OUTPUT_WIDTH * MAX_FILL_RATIO
  const maximumHeight = OUTPUT_HEIGHT * MAX_FILL_RATIO
  const scale = Math.min(maximumWidth / bounds.width, maximumHeight / bounds.height)
  const width = bounds.width * scale
  const height = bounds.height * scale
  const x = (OUTPUT_WIDTH - width) / 2
  const y = (OUTPUT_HEIGHT - height) / 2

  context.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, x, y, width, height)
  bitmap.close()

  return output.toDataURL('image/webp', 0.86)
}

export async function createProductPhoto(file: File): Promise<string> {
  const bitmap = await removeBackgroundLocally(file)
  return composeProductPhoto(bitmap)
}
