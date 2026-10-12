import { P, box, face, faceX, faceY, n, rect, rects } from './iso'
import type { Phase } from './iso'

export type Side = 'r' | 'l'

export type Margin = { l: number; r: number; t: number; b: number }

export type WallItem = {
  label: string
  width: number
  height: number
  overhang: Margin
  depth: number
  shadow: number
  body: (phase: Phase, side: Side) => string
  hands?: (phase: Phase, side: Side) => string
}

export function wq(side: Side, u: number, v: number, depth: number): [number, number] {
  return side === 'r' ? [u - depth, u / 2 + depth / 2 + v] : [u + depth, -u / 2 + depth / 2 + v]
}

export function onWall(side: Side, depth: number): string {
  return side === 'r' ? `matrix(1,.5,0,1,${n(-depth)},${n(depth / 2)})` : `matrix(1,-.5,0,1,${n(depth)},${n(depth / 2)})`
}

function front(side: Side, depth: number, content: string): string {
  return `<g transform="${onWall(side, depth)}">${content}</g>`
}

function slab(side: Side, u0: number, v0: number, u1: number, v1: number, d0: number, d1: number, tone: string): string {
  const q = (u: number, v: number, d: number) => wq(side, u, v, d)
  const end = side === 'r' ? u1 : u0
  return (
    face([q(u0, v0, d0), q(u1, v0, d0), q(u1, v0, d1), q(u0, v0, d1)], `${tone}1`) +
    face([q(end, v0, d0), q(end, v0, d1), q(end, v1, d1), q(end, v1, d0)], `${tone}${side === 'r' ? 3 : 2}`) +
    face([q(u0, v0, d1), q(u1, v0, d1), q(u1, v1, d1), q(u0, v1, d1)], `${tone}${side === 'r' ? 2 : 3}`)
  )
}

function wallShadow(side: Side, u0: number, v0: number, u1: number, v1: number, offset = 1.5): string {
  const q = (u: number, v: number) => wq(side, u, v, 0)
  return face([q(u0 + offset, v0 + offset), q(u1 + offset, v0 + offset), q(u1 + offset, v1 + offset), q(u0 + offset, v1 + offset)], 'sh')
}

function dim(side: Side, x: number, y: number, w: number, h: number): string {
  return side === 'l' ? rect(x, y, w, h, '#1f2a40', ' class="lw"') : ''
}

const margin = (l: number, r: number, t: number, b: number): Margin => ({ l, r, t, b })

function windowItem(w: number, h: number, columns: number, rows: number, plant: boolean): (phase: Phase, side: Side) => string {
  return (phase, side) => {
    const lean = n(h * 0.45)
    const clip = `kw${w}${h}${columns}${plant ? 'p' : ''}${side}`
    const cloud = (x: number, y: number, dur: number, offset: number) =>
      `<g class="day">${rects('#ffffff', [[x, y, 8, 2], [x + 2, y - 2, 4, 2]])}<animateTransform attributeName="transform" type="translate" values="-${w} 0;${w} 0" dur="${dur}s" ${phase(dur, offset)}/></g>`
    let glass = `<clipPath id="${clip}"><rect width="${w}" height="${h}"/></clipPath><g clip-path="url(#${clip})"><rect width="${w}" height="${h}" class="sky"/><rect y="${n(h * 0.62)}" width="${w}" height="${n(h * 0.38)}" class="sky2"/>`
    glass += cloud(4, 8, 34, 5000) + cloud(10, h - 10, 52, 30000)
    glass += `<g class="night">${rects('#ffffff', [[5, 6, 1, 1], [w - 9, 10, 1, 1], [w / 2, 4, 1, 1]])}${rect(w - 6, 4, 3, 3, '#f4f1d0')}</g></g><rect width="${w}" height="${h}" class="tint"/>`
    glass += `<path class="gs" d="M${n(w * 0.12)} ${h}l${lean} -${h}h4l-${lean} ${h}zM${n(w * 0.46)} ${h}l${lean} -${h}h1.5l-${lean} ${h}z"/>`
    glass += rects('#3a2e20', [[0, 0, w, 2.5], side === 'r' ? [0, 0, 2.5, h] : [w - 2.5, 0, 2.5, h]], ' class="rv"')
    const mullions: [number, number, number, number][] = []
    const shine: [number, number, number, number][] = []
    for (let i = 1; i < columns; i += 1) {
      mullions.push([(w / columns) * i - 1, 0, 2, h])
      shine.push([(w / columns) * i - 1, 0, 0.6, h])
    }
    if (rows > 1) {
      mullions.push([0, h / 2 - 1, w, 2])
      shine.push([0, h / 2 - 1, w, 0.6])
    }
    const bars = rects('#d9c193', mullions) + rects('#f6e9cc', shine)
    let out = wallShadow(side, -3, -3, w + 3, h + 3, 1.5)
    out += front(side, -1, glass + dim(side, 0, 0, w, h)) + front(side, 0, bars)
    out += slab(side, -3, 0, 0, h, 0, 2.5, 'fr') + slab(side, w, 0, w + 3, h, 0, 2.5, 'fr') + slab(side, -3, -3, w + 3, 0, 0, 2.5, 'fr')
    out += wallShadow(side, -4, h + 3, w + 4, h + 5, 1)
    out += slab(side, -5, h, w + 5, h + 3, 0, 6, 'wd')
    if (plant) {
      const potU = w / 2
      out += front(side, 3, `<ellipse cx="${potU + 1}" cy="${h - 0.2}" rx="6" ry="1.2" class="sh"/>`)
      out += slab(side, potU - 4, h - 6, potU + 4, h, 1.5, 4.5, 'bl')
      out += front(side, 3, `<use href="#bonsai" transform="translate(${potU - 8},${h - 19}) scale(1.4)"/>`)
    }
    return out
  }
}

function clockHands(phase: Phase, side: Side): string {
  return front(
    side,
    3,
    `<g style="transform:rotate(var(--hh,0deg));transform-origin:10px 10px"><rect x="9.3" y="5.6" width="1.4" height="4.9" fill="#1b1e26"/></g>` +
      `<g style="transform:rotate(var(--mm,0deg));transform-origin:10px 10px"><rect x="9.5" y="3.4" width="1" height="7.1" fill="#1b1e26"/></g>` +
      `<g><rect x="9.75" y="3" width=".5" height="7.5" fill="#d4343d"/><animateTransform attributeName="transform" type="rotate" from="0 10 10" to="360 10 10" dur="60s" ${phase(60)}/></g>` +
      `<circle cx="10" cy="10" r="1" fill="#1b1e26"/>`,
  )
}

function clockItem(_phase: Phase, side: Side): string {
  const band = side === 'r' ? '#121317' : '#2c2e36'
  let out = front(side, 0, `<circle cx="11.5" cy="11.5" r="9.6" class="sh"/>`)
  for (const depth of [0, 1.5]) out += front(side, depth, `<circle cx="10" cy="10" r="9.6" fill="${band}"/>`)
  const dial =
    `<circle cx="10" cy="10" r="9.6" fill="#1f2127" stroke="#0c0d10" stroke-width=".8"/><path d="M3.2 6.2a7.6 7.6 0 0 1 6-4.6" fill="none" stroke="#7a808c" stroke-width="1.1"/>` +
    `<circle cx="10" cy="10" r="7.4" fill="#c7d4e2" stroke="#0c0d10" stroke-width=".6"/>` +
    rects('#2b3040', [[9.4, 3.6, 1.2, 1.2], [15.2, 9.4, 1.2, 1.2], [9.4, 15.2, 1.2, 1.2], [3.6, 9.4, 1.2, 1.2]]) +
    `<path d="M5.2 8.4a5 5 0 0 1 3.4-3.6" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1"/>` +
    (side === 'l' ? `<circle cx="10" cy="10" r="9.6" class="lw" fill="#1f2a40"/>` : '')
  return out + front(side, 3, dial)
}

function ventItem(side: Side): string {
  return (
    wallShadow(side, 0, 0, 18, 7, 1.2) +
    slab(side, 0, 0, 18, 7, 0, 2.5, 'ws') +
    front(side, 2.5, `${rect(1.5, 1.2, 15, 4.6, '#1d1f24')}<rect x="1.5" y="1.2" width="15" height="4.6" fill="url(#k-louvre)"/>${dim(side, 0, 0, 18, 7)}`)
  )
}

function corkItem(side: Side): string {
  const note = (x: number, y: number, color: string, fold: string, pin: string) =>
    `${rect(x + 0.7, y + 0.7, 7, 7, '#000', ' class="sh"')}<path d="M${x} ${y}h7v5l-2 2h-5z" fill="${color}"/><path d="M${x + 7} ${y + 5}l-2 2v-2z" fill="${fold}"/><circle cx="${x + 3.5}" cy="${y + 1.2}" r=".9" fill="${pin}"/>`
  const content =
    `<rect x="2" y="2" width="26" height="20" fill="url(#k-cork)"/>${rect(2, 2, 26, 0.8, '#7a5230')}${rect(2, 2, 0.8, 20, '#7a5230')}` +
    note(4, 4, '#f7d84a', '#cfae25', '#d23b3b') +
    note(13, 3.5, '#ffffff', '#cfd4dc', '#3b7bd4') +
    note(4, 13, '#9fd3ff', '#6fb0e0', '#d23b3b') +
    `${rect(21.6, 4.6, 5, 6, '#000', ' class="sh"')}${rect(21, 4, 5, 6, '#fbfcfd')}${rect(21.8, 4.8, 3.4, 2.6, '#7fc4f0')}${rect(21.8, 7.4, 3.4, 1.4, '#5fa24f')}` +
    note(14, 13, '#f7d84a', '#cfae25', '#3b7bd4') +
    dim(side, 0, 0, 30, 24)
  return wallShadow(side, 0, 0, 30, 24) + slab(side, 0, 0, 30, 24, 0, 2, 'gy') + front(side, 2, content)
}

function whiteboardItem(side: Side): string {
  const node = (x: number, y: number, c: string) => rect(x, y, 10, 6, '#fff', ` stroke="${c}" stroke-width="1"`)
  const surface =
    rect(1.5, 1.5, 51, 29, '#fdfdfd') +
    rect(1.5, 1.5, 51, 0.8, '#d9dde3') +
    node(5, 4, '#3b7bd4') +
    node(38, 4, '#3ba55c') +
    node(21, 20, '#e0403a') +
    rects('#3b4252', [
      [15, 6.5, 23, 0.8],
      [10, 10, 0.8, 13],
      [10, 22.5, 11, 0.8],
      [43, 10, 0.8, 13],
      [31, 22.5, 12, 0.8],
    ]) +
    `<circle cx="48" cy="5" r="1.6" fill="#e0403a" stroke="#8f2420" stroke-width=".5"/><circle cx="47.5" cy="4.5" r=".5" fill="#fff"/>` +
    dim(side, 0, 0, 54, 32)
  return (
    wallShadow(side, 0, 0, 54, 32) +
    slab(side, 0, 0, 54, 32, 0, 2, 'mt') +
    front(side, 2, surface) +
    wallShadow(side, 6, 32, 48, 34, 1) +
    slab(side, 6, 32, 48, 34, 0, 5, 'mt') +
    slab(side, 10, 31, 17, 32, 1.5, 3, 'rd') +
    slab(side, 19, 31, 26, 32, 1.5, 3, 'bl') +
    slab(side, 34, 30.5, 41, 32, 1, 4, 'bk')
  )
}

function posterItem(side: Side): string {
  const sheet =
    rect(1, 1, 16, 22, '#ffffff') +
    rect(2.5, 2.5, 5.5, 5, '#f08a3c') +
    rect(10, 2.5, 5.5, 5, '#3b7bd4') +
    rect(2.5, 9, 13, 2, '#f08a3c') +
    `<circle cx="9" cy="17" r="4.3" fill="#3b7bd4"/><path d="M9 17v-4.3a4.3 4.3 0 0 1 4.1 5.6z" fill="#f08a3c"/>` +
    dim(side, 0, 0, 18, 24)
  return wallShadow(side, 0, 0, 18, 24, 2) + slab(side, 0, 0, 18, 24, 0, 1.2, 'dk') + front(side, 1.2, sheet)
}

function stickiesItem(side: Side): string {
  const notes: readonly [number, number, string, string, number][] = [
    [0, 0, '#f7d84a', '#cfae25', -6],
    [7.5, 1, '#ff9db5', '#d9708d', 5],
    [15, 0, '#a8e6a1', '#79c171', -3],
    [2, 9, '#9fd3ff', '#6fb0e0', 4],
    [9.5, 9.5, '#f7d84a', '#cfae25', -5],
    [16, 8.5, '#ffffff', '#cfd4dc', 7],
  ]
  const content =
    notes
      .map(
        ([x, y, c, fold, turn]) =>
          `<g transform="rotate(${turn} ${x + 3} ${y + 3})">${rect(x + 0.8, y + 0.8, 6, 6, '#000', ' class="sh"')}<path d="M${x} ${y}h6v4.4l-1.6 1.6h-4.4z" fill="${c}"/><path d="M${x + 6} ${y + 4.4}l-1.6 1.6v-1.6z" fill="${fold}"/>${rect(x, y, 6, 1, fold)}</g>`,
      )
      .join('') + dim(side, 0, 0, 22, 18)
  return front(side, 0.6, content)
}

function scheduleItem(side: Side): string {
  let content = rect(1, 1, 28, 18, '#ffffff') + rect(1, 1, 28, 3.5, '#d6443c') + rect(1, 4.5, 28, 0.6, '#9c2e28')
  const colors = ['#a8e6a1', '#9fd3ff', '#f7d84a', '#ff9db5']
  colors.forEach((color, index) => {
    const cells: [number, number, number, number][] = []
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 4; c += 1) if ((r + c) % colors.length === index) cells.push([2.5 + c * 5.4, 6.5 + r * 4, 4.4, 3])
    content += rects(color, cells)
  })
  content += rect(24.2, 6.5, 3.6, 3.6, '#c8d4e6') + rect(24.2, 12, 3.6, 3.6, '#e6d2c8') + dim(side, 0, 0, 30, 20)
  return wallShadow(side, 0, 0, 30, 20) + slab(side, 0, 0, 30, 20, 0, 1.6, 'gy') + front(side, 1.6, content)
}

export const WALL_ITEMS: Readonly<Record<string, WallItem>> = {
  'window-2': { label: 'window (2-pane)', width: 24, height: 40, overhang: margin(5, 5, 3, 3), depth: 6, shadow: 2, body: windowItem(24, 40, 2, 1, false) },
  window: { label: 'window (4-pane)', width: 40, height: 40, overhang: margin(5, 5, 3, 3), depth: 6, shadow: 2, body: windowItem(40, 40, 2, 2, false) },
  'window-plant': { label: 'window (2-pane) + potted plant', width: 28, height: 40, overhang: margin(5, 5, 3, 3), depth: 6, shadow: 2, body: windowItem(28, 40, 2, 1, true) },
  'window-wide': { label: 'window (wide)', width: 48, height: 28, overhang: margin(5, 5, 3, 3), depth: 6, shadow: 2, body: windowItem(48, 28, 3, 1, false) },
  vent: { label: 'air vent', width: 18, height: 7, overhang: margin(0, 0, 0, 0), depth: 2.5, shadow: 1.2, body: (_, side) => ventItem(side) },
  cork: { label: 'cork board', width: 30, height: 24, overhang: margin(0, 0, 0, 0), depth: 2, shadow: 1.5, body: (_, side) => corkItem(side) },
  whiteboard: { label: 'whiteboard', width: 54, height: 36, overhang: margin(0, 0, 0, 0), depth: 5, shadow: 1.5, body: (_, side) => whiteboardItem(side) },
  clock: { label: 'round clock', width: 20, height: 20, overhang: margin(0, 0, 0, 0), depth: 3, shadow: 1.5, body: clockItem, hands: clockHands },
  poster: { label: 'poster (chart)', width: 18, height: 24, overhang: margin(0, 0, 0, 0), depth: 1.2, shadow: 2, body: (_, side) => posterItem(side) },
  stickies: { label: 'sticky notes', width: 22, height: 18, overhang: margin(1, 1, 1, 1), depth: 0.6, shadow: 0.8, body: (_, side) => stickiesItem(side) },
  schedule: { label: 'schedule board', width: 30, height: 20, overhang: margin(0, 0, 0, 0), depth: 1.6, shadow: 1.5, body: (_, side) => scheduleItem(side) },
}

export function wallMargin(item: WallItem, side: Side): Margin {
  return {
    l: item.overhang.l + (side === 'r' ? item.depth : 0),
    r: item.overhang.r + item.shadow + (side === 'l' ? item.depth : 0),
    t: item.overhang.t,
    b: item.overhang.b + item.shadow + item.depth,
  }
}

export type Orient = 'r' | 'l'

export type FurnitureItem = { label: string; blocks: boolean; bias: number; height: number; body: (phase: Phase, orient: Orient) => string }

function fbox(o: Orient, u0: number, d0: number, u1: number, d1: number, z0: number, z1: number, tone: string): string {
  return o === 'r' ? box(u0, d0, u1, d1, z0, z1, tone) : box(d0, 1 - u1, d1, 1 - u0, z0, z1, tone)
}

function ffront(o: Orient, u0: number, d: number, z: number): string {
  return o === 'r' ? faceY(u0, d, z) : faceX(d, 1 - u0, z)
}

function fpt(o: Orient, u: number, d: number, z: number): [number, number] {
  return o === 'r' ? P(u, d, z) : P(d, 1 - u, z)
}

function grounded(o: Orient, u0: number, d0: number, u1: number, d1: number, height: number): string {
  const floor = face([fpt(o, u0 + 0.06, d0, 0), fpt(o, u1 + 0.1, d0, 0), fpt(o, u1 + 0.1, d1 + 0.08, 0), fpt(o, u0 + 0.06, d1 + 0.08, 0)], 'sh')
  const wall = face([fpt(o, u1, 0, 0), fpt(o, u1 + 0.09, 0, 0), fpt(o, u1 + 0.09, 0, height - 3), fpt(o, u1, 0, height)], 'sh')
  return wall + floor
}

function onFront(o: Orient, u0: number, d: number, z: number, content: string, width: number, height: number): string {
  return `<g transform="${ffront(o, u0, d, z)}">${content}${o === 'l' ? rect(0, 0, width, height, '#1f2a40', ' class="lw"') : ''}</g>`
}

function handleBar(x: number, y: number, h: number): string {
  return rect(x, y, 1.4, h, '#d6dae0', ' stroke="#6f7682" stroke-width=".4"') + rect(x + 0.2, y + 0.5, 0.4, h - 1, '#ffffff')
}

function wardrobe(o: Orient): string {
  const doors = rect(8.6, 2, 0.8, 58, '#9c4a18') + rect(9.4, 2, 0.4, 58, '#f6b06c') + handleBar(6.4, 24, 12) + handleBar(10.4, 24, 12) + rect(0.6, 1.2, 16.6, 0.8, '#ffc58a')
  return grounded(o, 0.04, 0.02, 0.96, 0.72, 66) + fbox(o, 0.06, 0.04, 0.94, 0.7, 0, 3, 'dk') + fbox(o, 0.04, 0.02, 0.96, 0.72, 3, 66, 'or') + onFront(o, 0.04, 0.72, 66, doors, 18.4, 63)
}

function locker(o: Orient): string {
  const rows = [0, 1, 2, 3, 4, 5].map(i => 1.2 + i * 9.7)
  const drawers =
    rects('#8e9db2', rows.map(y => [0.9, y, 15, 8.8] as const), ' stroke="#5d6b80" stroke-width=".6"') +
    rects('#b9c5d5', rows.map(y => [0.9, y, 15, 0.6] as const)) +
    rects('#e3e8ef', rows.map(y => [6.4, y + 4.2, 4, 1.3] as const), ' stroke="#5d6b80" stroke-width=".4"') +
    rects('#f7f8fa', rows.map(y => [6.9, y + 1.4, 3, 1.6] as const), ' stroke="#8a95a5" stroke-width=".3"')
  return grounded(o, 0.08, 0.02, 0.92, 0.62, 62) + fbox(o, 0.1, 0.04, 0.9, 0.6, 0, 2, 'dk') + fbox(o, 0.08, 0.02, 0.92, 0.62, 2, 62, 'lk') + onFront(o, 0.08, 0.62, 62, drawers, 16.8, 60)
}

function wallCabinet(o: Orient): string {
  const arch = (x: number) =>
    `<path d="M${x} 19v-11a3 3 0 0 1 6 0v11z" fill="#bcc2cb" stroke="#e4e7eb" stroke-width=".6"/><path d="M${x + 6} 8v11h-6" fill="none" stroke="#7d848f" stroke-width=".6"/>`
  const doors = rect(9.4, 0.5, 0.8, 21, '#7d848f') + arch(2) + arch(12) + rect(7.6, 14, 0.9, 3.5, '#5d6470') + rect(11.1, 14, 0.9, 3.5, '#5d6470')
  return fbox(o, 0.02, 0.02, 0.98, 0.36, 50, 70, 'gy') + fbox(o, 0.02, 0.02, 0.98, 0.38, 70, 72.5, 'dk') + onFront(o, 0.02, 0.36, 70, doors, 19.2, 20)
}

function counter(o: Orient): string {
  const doors = rect(9.4, 1.5, 0.8, 21, '#b8bec6') + rect(7, 5, 1, 4, '#7d848f') + rect(11.6, 5, 1, 4, '#7d848f') + rect(0.5, 0.5, 18.2, 0.6, '#ffffff')
  return grounded(o, 0.02, 0.04, 0.98, 0.72, 26) + fbox(o, 0.04, 0.06, 0.96, 0.7, 0, 2, 'dk') + fbox(o, 0.02, 0.04, 0.98, 0.72, 2, 26, 'wh') + onFront(o, 0.02, 0.72, 26, doors, 19.2, 24) + fbox(o, 0, 0.02, 1, 0.8, 26, 29.5, 'ws')
}

function fridge(o: Orient): string {
  const door =
    rect(0, 21.6, 17.6, 1.2, '#7f9fb6') +
    rect(14.2, 7, 1.4, 11, '#e8f2f8', ' stroke="#6d8aa0" stroke-width=".4"') +
    rect(14.2, 26, 1.4, 16, '#e8f2f8', ' stroke="#6d8aa0" stroke-width=".4"') +
    rect(4, 29, 5, 4, '#f7d84a', ' stroke="#b59a1f" stroke-width=".5"') +
    rect(8.4, 36, 4, 5, '#7fd18a', ' stroke="#4f9c5a" stroke-width=".5"') +
    `<circle cx="6.5" cy="10.5" r="1.4" fill="#ff7b72" stroke="#b84c45" stroke-width=".4"/>` +
    rect(0.6, 0.8, 16.4, 0.6, '#ffffff')
  return grounded(o, 0.06, 0.04, 0.94, 0.7, 66) + fbox(o, 0.08, 0.06, 0.92, 0.68, 0, 2, 'dk') + fbox(o, 0.06, 0.04, 0.94, 0.7, 2, 66, 'fb') + onFront(o, 0.06, 0.7, 66, door, 17.6, 64)
}

function cooler(phase: Phase, o: Orient): string {
  const [a, b] = fpt(o, 0.5, 0.62, 34)
  const bubble = (dx: number, offset: number) =>
    `<rect x="${n(a + dx)}" y="${n(b)}" width="1.5" height="1.5" fill="#e8f7ff"><animate attributeName="y" values="${n(b)};${n(b - 10)}" dur="2.6s" ${phase(2.6, offset)}/></rect>`
  const taps = rect(3, 6, 1.6, 2.5, '#e04b4b') + rect(6.5, 6, 1.6, 2.5, '#3f8fe0') + rect(2, 12, 6, 1, '#b8bec6') + rect(0.5, 0.5, 9, 0.6, '#ffffff')
  const bands = rect(0, 3, 7.6, 1, '#d8f1ff', ' fill-opacity=".85"') + rect(0, 10, 7.6, 1, '#d8f1ff', ' fill-opacity=".85"') + rect(1, 0, 1.2, 18, '#ffffff', ' fill-opacity=".45"')
  return (
    grounded(o, 0.25, 0.22, 0.75, 0.62, 50) +
    fbox(o, 0.25, 0.22, 0.75, 0.62, 0, 30, 'wh') +
    onFront(o, 0.25, 0.62, 30, taps, 10, 30) +
    fbox(o, 0.31, 0.28, 0.69, 0.58, 30, 48, 'bl') +
    onFront(o, 0.31, 0.58, 48, bands, 7.6, 18) +
    fbox(o, 0.43, 0.38, 0.57, 0.5, 48, 50.5, 'bl') +
    bubble(-2, 0) +
    bubble(2, 1100)
  )
}

function paperDrawers(count: number, width: number, height: number): string {
  const rows = Array.from({ length: count }, (_, i) => 3 + (i * (height - 4)) / count)
  return (
    rects('#7d848f', rows.map(y => [1, y, width - 2, 0.8] as const)) +
    rects('#ffffff', rows.map(y => [1, y + 0.8, width - 2, 0.4] as const), ' fill-opacity=".5"') +
    rects('#5d6470', rows.map(y => [width / 2 - 2.5, y + 2, 5, 1.2] as const))
  )
}

function copier(phase: Phase, o: Orient, dark: boolean): string {
  const body = dark ? 'bk' : 'wh'
  const top = dark ? 'dk' : 'bk'
  const height = dark ? 30 : 26
  const led = dark ? `<rect x="2" y="2" width="1.6" height="1.6" fill="#3ddc84"><animate attributeName="opacity" values="1;.25;1" dur="2.2s" ${phase(2.2)}/></rect>` : ''
  return (
    grounded(o, 0.08, 0.04, 0.92, 0.84, height + 6) +
    fbox(o, 0.08, 0.04, 0.92, 0.84, 0, height, body) +
    onFront(o, 0.08, 0.84, height, paperDrawers(3, 16.8, height - 2) + led, 16.8, height) +
    fbox(o, 0.25, 0.84, 0.75, 1.0, 14, 16, 'wh') +
    fbox(o, 0.1, 0.06, 0.9, 0.8, height, height + 4, top) +
    fbox(o, 0.14, 0.12, 0.4, 0.4, height + 4, height + 6, 'gy')
  )
}

function flipchart(o: Orient): string {
  const sheet =
    rect(2, 4, 0.8, 22, '#9aa1ab') +
    rect(2, 25.2, 12, 0.8, '#9aa1ab') +
    `<polyline points="3,22 6,15 9,19 12,9 14,12" fill="none" stroke="#e0403a" stroke-width="1.4"/>` +
    rect(3, 1.5, 7, 1.2, '#3b4252')
  return (
    face([fpt(o, 0.1, 0.12, 0), fpt(o, 0.98, 0.12, 0), fpt(o, 0.98, 0.5, 0), fpt(o, 0.1, 0.5, 0)], 'sh') +
    fbox(o, 0.2, 0.3, 0.26, 0.36, 0, 50, 'bk') +
    fbox(o, 0.74, 0.3, 0.8, 0.36, 0, 50, 'bk') +
    fbox(o, 0.47, 0.12, 0.53, 0.18, 0, 50, 'bk') +
    fbox(o, 0.1, 0.38, 0.9, 0.44, 24, 54, 'wh') +
    onFront(o, 0.1, 0.44, 54, sheet, 16, 30) +
    fbox(o, 0.08, 0.36, 0.92, 0.46, 52, 55, 'bk')
  )
}

function rack(o: Orient): string {
  let out = grounded(o, 0.06, 0.1, 0.94, 0.66, 64) + fbox(o, 0.06, 0.1, 0.12, 0.16, 0, 64, 'dk') + fbox(o, 0.88, 0.1, 0.94, 0.16, 0, 64, 'dk')
  ;[2, 22, 42, 62].forEach((z, index) => {
    out += fbox(o, 0.06, 0.1, 0.94, 0.66, z, z + 2, 'dk')
    if (index === 3) return
    const zb = z + 2
    const [px, py] = fpt(o, 0.3, 0.38, zb)
    const [qx, qy] = fpt(o, 0.72, 0.38, zb)
    if (index !== 1) out += fbox(o, 0.22, 0.3, 0.38, 0.46, zb, zb + 5, 'cb') + `<use href="#rack-plant" x="${n(px - 4)}" y="${n(py - 10)}"/>`
    else out += fbox(o, 0.18, 0.2, 0.26, 0.56, zb, zb + 13, 'gy') + fbox(o, 0.28, 0.2, 0.36, 0.56, zb, zb + 13, 'gy')
    if (index !== 2) out += fbox(o, 0.62, 0.22, 0.82, 0.54, zb, zb + 10, 'gy')
    else out += fbox(o, 0.64, 0.3, 0.8, 0.46, zb, zb + 5, 'cb') + `<use href="#rack-plant" x="${n(qx - 4)}" y="${n(qy - 10)}"/>`
  })
  return out + fbox(o, 0.06, 0.6, 0.12, 0.66, 0, 64, 'dk') + fbox(o, 0.88, 0.6, 0.94, 0.66, 0, 64, 'dk')
}

export const FURNITURE: Readonly<Record<string, FurnitureItem>> = {
  wardrobe: { label: 'orange wardrobe', blocks: true, bias: 0.2, height: 66, body: (_, o) => wardrobe(o) },
  locker: { label: 'filing locker', blocks: true, bias: 0.2, height: 62, body: (_, o) => locker(o) },
  'copier-black': { label: 'black copier', blocks: true, bias: 0.2, height: 36, body: (phase, o) => copier(phase, o, true) },
  'copier-white': { label: 'white MFP copier', blocks: true, bias: 0.2, height: 32, body: (phase, o) => copier(phase, o, false) },
  flipchart: { label: 'flip chart', blocks: true, bias: 0.2, height: 55, body: (_, o) => flipchart(o) },
  rack: { label: 'shelving rack', blocks: true, bias: 0.2, height: 64, body: (_, o) => rack(o) },
  cooler: { label: 'water cooler', blocks: true, bias: 0.2, height: 50, body: cooler },
  fridge: { label: 'fridge', blocks: true, bias: 0.2, height: 66, body: (_, o) => fridge(o) },
  counter: { label: 'kitchen cabinet + countertop', blocks: true, bias: 0.2, height: 30, body: (_, o) => counter(o) },
  'wall-cabinet': { label: 'wall cabinet (arched doors)', blocks: false, bias: 0.25, height: 72, body: (_, o) => wallCabinet(o) },
}

export const WALL_PATTERNS = `<pattern id="k-louvre" patternUnits="userSpaceOnUse" width="15" height="1.5"><rect width="15" height=".9" fill="#5c626c"/><rect width="15" height=".3" fill="#9aa1ab"/><rect y=".9" width="15" height=".3" fill="#121418"/></pattern><pattern id="k-cork" patternUnits="userSpaceOnUse" width="5" height="4"><rect width="5" height="4" fill="#c58f55"/><rect x="1" y="1" width=".7" height=".7" fill="#9a6a3a"/><rect x="3.4" y="2.6" width=".7" height=".7" fill="#a87545"/><rect x="2.6" y=".4" width=".5" height=".5" fill="#e0b07a"/></pattern>`

export const WALL_STYLE = `.sh{fill:#1d2230;fill-opacity:.16;stroke:none}.gr{fill:#ffffff;fill-opacity:.28;stroke:none}.ge{fill:none;stroke:#ffffff;stroke-opacity:.8;stroke-width:.8}.lw{fill-opacity:.1}.rv{fill-opacity:.22}.tint{fill:#5fc6c9;fill-opacity:.18}.gs{fill:#ffffff;fill-opacity:.42}
.fr1{fill:#f0dfbd}.fr2{fill:#dcc296}.fr3{fill:#bfa477}`
