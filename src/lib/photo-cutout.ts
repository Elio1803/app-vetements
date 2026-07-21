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
