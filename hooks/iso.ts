export const HW = 20
export const HH = 10

export type Phase = (dur: number, offsetMs?: number) => string

export function n(value: number): string {
  return String(Math.round(value * 2) / 2)
}

export function P(x: number, y: number, z = 0): [number, number] {
  return [(x - y) * HW, (x + y) * HH - z]
}

export function pt(x: number, y: number, z: number): string {
  const [a, b] = P(x, y, z)
  return `${n(a)},${n(b)}`
}

export function poly(points: readonly string[], cls: string): string {
  return `<polygon class="${cls}" points="${points.join(' ')}"/>`
}

function round(value: number): number {
  return Math.round(value * 2) / 2
}

export function face(points: readonly (readonly [number, number])[], cls: string): string {
  const rounded = points.map(([a, b]) => [round(a), round(b)] as const)
  const first = rounded[0]
  if (first === undefined) return ''
  let d = `M${first[0]} ${first[1]}`
  for (let index = 1; index < rounded.length; index += 1) {
    const here = rounded[index]
    const prev = rounded[index - 1]
    if (here === undefined || prev === undefined) continue
    const dx = round(here[0] - prev[0])
    const dy = round(here[1] - prev[1])
    d += dx === 0 ? `v${dy}` : dy === 0 ? `h${dx}` : `l${dx} ${dy}`
  }
  return `<path class="${cls}" d="${d}z"/>`
}

export function box(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, tone: string): string {
  return (
    face([P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], `${tone}2`) +
    face([P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], `${tone}3`) +
    face([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], `${tone}1`)
  )
}

export const TONES = ['or', 'gy', 'bk', 'wh', 'mt', 'dk', 'cb', 'bg', 'tl', 'bl', 'fb', 'lk', 'wd', 'ws', 'rd', 'bp', 'fr'] as const

export const FACE_STYLE = `${TONES.flatMap(tone => [1, 2, 3].map(level => `.${tone}${level}`)).join(',')},.wt,.bb,.f1,.f2{stroke:#4a4452;stroke-width:1;stroke-linejoin:round}`

export function faceY(x0: number, y: number, z: number): string {
  const [a, b] = P(x0, y, z)
  return `matrix(1,.5,0,1,${n(a)},${n(b)})`
}

export function faceX(x: number, y1: number, z: number): string {
  const [a, b] = P(x, y1, z)
  return `matrix(1,-.5,0,1,${n(a)},${n(b)})`
}

export function rects(fill: string, list: readonly (readonly [number, number, number, number])[], extra = ''): string {
  const d = list.map(([x, y, w, h]) => `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`).join('')
  return `<path fill="${fill}"${extra} d="${d}"/>`
}

export function rect(x: number, y: number, w: number, h: number, fill: string, extra = ''): string {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${extra}/>`
}

export function at(x: number, y: number, z = 0): string {
  const [a, b] = P(x, y, z)
  return `x="${n(a)}" y="${n(b)}"`
}
