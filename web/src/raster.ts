import { defsFor } from '../../hooks/art'

const done = new Map<string, HTMLCanvasElement>()
const pending = new Set<string>()

export function svgDoc(x: number, y: number, w: number, h: number, body: string, style = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges" style="${style}">${defsFor(body)}${body}</svg>`
}

async function draw(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(width))
    canvas.height = Math.max(1, Math.ceil(height))
    const context = canvas.getContext('2d')
    if (context === null) return canvas
    context.imageSmoothingEnabled = false
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function raster(key: string, make: () => { svg: string; width: number; height: number }): HTMLCanvasElement | undefined {
  const ready = done.get(key)
  if (ready !== undefined || pending.has(key)) return ready
  pending.add(key)
  const { svg, width, height } = make()
  void draw(svg, width, height)
    .then(canvas => done.set(key, canvas))
    .catch(() => undefined)
    .finally(() => pending.delete(key))
  return undefined
}

export function rasterNow(key: string, make: () => { svg: string; width: number; height: number }): Promise<HTMLCanvasElement> {
  const ready = done.get(key)
  if (ready !== undefined) return Promise.resolve(ready)
  const { svg, width, height } = make()
  return draw(svg, width, height).then(canvas => {
    done.set(key, canvas)
    return canvas
  })
}

export function forget(prefix: string): void {
  for (const key of [...done.keys()]) if (key.startsWith(prefix)) done.delete(key)
}

export function pendingCount(): number {
  return pending.size
}
