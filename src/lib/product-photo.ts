const OUTPUT_WIDTH = 900
const OUTPUT_HEIGHT = 1125

function canvasAsDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/webp', 0.86)
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
