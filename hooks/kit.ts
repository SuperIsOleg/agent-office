import { FACE_STYLE, P, box, face, faceX, faceY, n, pt, rect } from './iso'
import type { Phase } from './iso'
import { art } from './sprites'
import { FURNITURE, WALL_ITEMS, WALL_PATTERNS, WALL_STYLE } from './kit-wall'
import type { Side, WallItem } from './kit-wall'

export const WALL = 104

export type FloorSprite = {
  kind: 'floor'
  label: string
  w: number
  d: number
  blocks: boolean
  bias: number
  ground?: true
  body: (phase: Phase) => string
}

export type WallSprite = { kind: 'wall'; label: string; width: number; height: number; item: WallItem }

export type EdgeSprite = { kind: 'edge'; label: string; plane: 'x' | 'y'; blocks: boolean; bias: number; body: (phase: Phase) => string }

export type Sprite = FloorSprite | WallSprite | EdgeSprite

export const KIT_STYLE = `polygon{stroke:#4a4452;stroke-width:1;stroke-linejoin:round}
${FACE_STYLE}
${WALL_STYLE}
.or1{fill:#f59d48}.or2{fill:#dc7c2f}.or3{fill:#bb6325}
.gy1{fill:#cdd1d8}.gy2{fill:#adb3bd}.gy3{fill:#9198a3}
.bk1{fill:#474b55}.bk2{fill:#2d2f36}.bk3{fill:#202228}
.wh1{fill:#fbfcfd}.wh2{fill:#e4e7eb}.wh3{fill:#cbd0d7}
.mt1{fill:#d5d9df}.mt2{fill:#b4bac3}.mt3{fill:#979ea8}
.dk1{fill:#4b505b}.dk2{fill:#363a43}.dk3{fill:#292c33}
.cb1{fill:#ddb279}.cb2{fill:#c5975f}.cb3{fill:#a87d4c}
.bg1{fill:#efe2c7}.bg2{fill:#dbc9a5}.bg3{fill:#c3af8b}
.tl1{fill:#4fb3a9}.tl2{fill:#3a968d}.tl3{fill:#2d7a73}
.bl1{fill:#a3defb}.bl2{fill:#68c0ee}.bl3{fill:#47a2d6}
.fb1{fill:#eef7fc}.fb2{fill:#d4e9f5}.fb3{fill:#b7d6e8}
.lk1{fill:#a9b6c8}.lk2{fill:#8e9db2}.lk3{fill:#76869c}
.wd1{fill:#e2c08f}.wd2{fill:#c9a271}.wd3{fill:#ad8559}
.ws1{fill:#737a85}.ws2{fill:#5c626c}.ws3{fill:#4b5059}
.rd1{fill:#d6544c}.rd2{fill:#ba443c}.rd3{fill:#9c362f}
.gl{fill:#c4e8ff;fill-opacity:.3;stroke:#8fb5cb}
.wa{fill:#eceef1}.wb{fill:#dfe2e7}.wt{fill:#3e434d}.bb{fill:#b9bec6}.f1{fill:#c4ccd6}.f2{fill:#aeb7c3}
.sky{fill:var(--sky,#bfe6ff)}.sky2{fill:var(--sky2,#e3f4ff)}.night{opacity:var(--night,0)}.day{opacity:var(--day,1)}`

const LEAF = ['..tt.t..', '.tTTttt.', 'tTTtTTtt', '.tTTTtT.', '..tTTt..']

const BASE: Readonly<Record<string, Sprite>> = {
  floor: {
    kind: 'floor',
    label: 'floor tile',
    w: 1,
    d: 1,
    blocks: false,
    bias: 0,
    ground: true,
    body: () => `<polygon points="${pt(0, 0, 0)} ${pt(1, 0, 0)} ${pt(1, 1, 0)} ${pt(0, 1, 0)}" style="fill:#dfe5ec;stroke:#c3cdd8"/>`,
  },
  'wall-right': {
    kind: 'floor',
    label: 'wall segment (right)',
    w: 1,
    d: 0,
    blocks: false,
    bias: -9,
    ground: true,
    body: () => face([P(0, 0, 0), P(1, 0, 0), P(1, 0, WALL), P(0, 0, WALL)], 'wa') + face([P(0, 0, 0), P(1, 0, 0), P(1, 0, 5), P(0, 0, 5)], 'bb'),
  },
  'wall-left': {
    kind: 'floor',
    label: 'wall segment (left)',
    w: 0,
    d: 1,
    blocks: false,
    bias: -9,
    ground: true,
    body: () => face([P(0, 0, 0), P(0, 1, 0), P(0, 1, WALL), P(0, 0, WALL)], 'wb') + face([P(0, 0, 0), P(0, 1, 0), P(0, 1, 5), P(0, 0, 5)], 'bb'),
  },
  'wall-top': {
    kind: 'floor',
    label: 'wall top edge',
    w: 1,
    d: 0,
    blocks: false,
    bias: -9,
    ground: true,
    body: () => face([P(0, -0.14, WALL), P(1, -0.14, WALL), P(1, 0, WALL), P(0, 0, WALL)], 'wt'),
  },
  'wall-top-left': {
    kind: 'floor',
    label: 'wall top edge (left)',
    w: 0,
    d: 1,
    blocks: false,
    bias: -9,
    ground: true,
    body: () => face([P(-0.14, 0, WALL), P(0, 0, WALL), P(0, 1, WALL), P(-0.14, 1, WALL)], 'wt'),
  },
  boxes: {
    kind: 'floor',
    label: 'cardboard boxes',
    w: 1,
    d: 1,
    blocks: true,
    bias: 0.2,
    body: () => {
      const tape = (x0: number, x1: number, y: number, z: number) => `<polyline points="${pt(x0, y, z)} ${pt(x1, y, z)}" fill="none" stroke="#8a6234" stroke-width="1.2"/>`
      return box(0.08, 0.08, 0.88, 0.82, 0, 18, 'cb') + tape(0.08, 0.88, 0.45, 18) + box(0.18, 0.16, 0.74, 0.64, 18, 32, 'cb') + tape(0.18, 0.74, 0.4, 32)
    },
  },
  plant: {
    kind: 'floor',
    label: 'floor plant',
    w: 1,
    d: 1,
    blocks: true,
    bias: 0.2,
    body: phase => {
      const [a, b] = P(0.5, 0.5, 13)
      return (
        box(0.3, 0.3, 0.7, 0.7, 0, 13, 'wh') +
        `<g transform="translate(${n(a)},${n(b)})"><g><use href="#leaves" transform="translate(-11,-17) scale(2)"/><animateTransform attributeName="transform" type="rotate" values="-2 0 0;2 0 0;-2 0 0" dur="5s" ${phase(5)}/></g></g>`
      )
    },
  },
  'sofa-left': { kind: 'floor', label: 'sofa (left)', w: 1, d: 1, blocks: true, bias: 0.2, body: () => sofa('left') },
  'sofa-mid': { kind: 'floor', label: 'sofa (middle, cushion)', w: 1, d: 1, blocks: true, bias: 0.2, body: () => sofa('mid') },
  'sofa-right': { kind: 'floor', label: 'sofa (right)', w: 1, d: 1, blocks: true, bias: 0.2, body: () => sofa('right') },
  rug: {
    kind: 'floor',
    label: 'red rug',
    w: 4,
    d: 3,
    blocks: false,
    bias: 0,
    ground: true,
    body: () =>
      `<polygon points="${pt(0.1, 0.1, 0)} ${pt(3.9, 0.1, 0)} ${pt(3.9, 2.9, 0)} ${pt(0.1, 2.9, 0)}" style="fill:#9c332d;stroke:#7d2621"/>` +
      `<polygon points="${pt(0.35, 0.35, 0)} ${pt(3.65, 0.35, 0)} ${pt(3.65, 2.65, 0)} ${pt(0.35, 2.65, 0)}" style="fill:#cc4a41;stroke:none"/>`,
  },
  'side-table': {
    kind: 'floor',
    label: 'side table',
    w: 1,
    d: 1,
    blocks: true,
    bias: 0.2,
    body: () => box(0.32, 0.38, 0.68, 0.72, 0, 1.5, 'gy') + box(0.46, 0.5, 0.54, 0.6, 1.5, 12, 'mt') + box(0.2, 0.24, 0.8, 0.84, 12, 14, 'gy'),
  },
  'desk-back': { kind: 'floor', label: 'desk (orange, drawer)', w: 1, d: 1, blocks: true, bias: 0.1, body: () => desk(true) },
  'desk-front': { kind: 'floor', label: 'desk (orange, facing back)', w: 1, d: 1, blocks: true, bias: 0.1, body: () => desk(false) },
  'desk-white': {
    kind: 'floor',
    label: 'white pedestal desk',
    w: 1,
    d: 1,
    blocks: true,
    bias: 0.1,
    body: () =>
      box(0.05, 0.1, 0.12, 0.92, 0, 12, 'wh') +
      box(0.56, 0.1, 0.94, 0.92, 0, 12, 'wh') +
      `<g transform="${faceY(0.56, 0.92, 12)}">${rect(0.6, 3.5, 6.4, 0.7, '#b8bec6')}${rect(0.6, 7.5, 6.4, 0.7, '#b8bec6')}${rect(2.6, 1.6, 2.2, 0.9, '#8d939c')}${rect(2.6, 5.6, 2.2, 0.9, '#8d939c')}${rect(2.6, 9.4, 2.2, 0.9, '#8d939c')}</g>` +
      box(0.03, 0.04, 0.97, 0.96, 12, 15, 'or'),
  },
  monitor: {
    kind: 'floor',
    label: 'monitor (screen side)',
    w: 1,
    d: 1,
    blocks: false,
    bias: 0.2,
    body: () =>
      box(0.36, 0.14, 0.64, 0.3, 15, 16, 'bk') +
      box(0.46, 0.18, 0.54, 0.24, 16, 20, 'bk') +
      box(0.06, 0.18, 0.94, 0.25, 20, 35, 'bk') +
      `<rect x="14" y="0.6" width="3" height="3" fill="#f7d84a" transform="${faceY(0.06, 0.25, 35)}"/>`,
  },
  'monitor-back': {
    kind: 'floor',
    label: 'monitor (back side)',
    w: 1,
    d: 1,
    blocks: false,
    bias: 0.2,
    body: () =>
      box(0.36, 0.66, 0.64, 0.84, 15, 16, 'bk') +
      box(0.46, 0.72, 0.54, 0.8, 16, 20, 'bk') +
      box(0.06, 0.74, 0.94, 0.81, 20, 35, 'bk') +
      `<rect x="7.8" y="5.5" width="2" height="2" fill="#5d626d" transform="${faceY(0.06, 0.81, 35)}"/>`,
  },
  imac: {
    kind: 'floor',
    label: 'iMac-like monitor',
    w: 1,
    d: 1,
    blocks: false,
    bias: 0.2,
    body: () =>
      box(0.4, 0.18, 0.6, 0.3, 15, 16, 'mt') +
      box(0.46, 0.2, 0.54, 0.24, 16, 22, 'mt') +
      box(0.1, 0.2, 0.9, 0.25, 22, 38, 'mt') +
      `<g transform="${faceY(0.1, 0.25, 38)}">${rect(0, 12.5, 16, 3.5, '#e9ecf0')}</g>`,
  },
  keyboard: { kind: 'floor', label: 'keyboard', w: 1, d: 1, blocks: false, bias: 0.21, body: () => box(0, 0, 0.44, 0.16, 15, 16, 'bk') },
  mouse: { kind: 'floor', label: 'mouse', w: 1, d: 1, blocks: false, bias: 0.21, body: () => box(0, 0, 0.08, 0.1, 15, 16.5, 'bk') },
  mug: {
    kind: 'floor',
    label: 'mug',
    w: 1,
    d: 1,
    blocks: false,
    bias: 0.22,
    body: () => box(0, 0, 0.1, 0.1, 15, 19.5, 'wh') + `<rect width="1.5" height="2.5" fill="#cbd0d7" transform="translate(${n(P(0.1, 0.05, 18.5)[0])},${n(P(0.1, 0.05, 18.5)[1])})"/>`,
  },
  'coffee-machine': {
    kind: 'floor',
    label: 'coffee machine',
    w: 1,
    d: 1,
    blocks: false,
    bias: 0.24,
    body: () =>
      box(0.58, 0.08, 0.9, 0.36, 15, 16.5, 'dk') +
      box(0.6, 0.08, 0.9, 0.18, 16.5, 31, 'dk') +
      box(0.6, 0.08, 0.9, 0.36, 31, 34, 'dk') +
      box(0.68, 0.24, 0.8, 0.3, 26, 28.5, 'mt') +
      box(0.68, 0.2, 0.78, 0.3, 16.5, 20, 'wh') +
      `<rect width="1.5" height="1.5" fill="#ff5a4f" transform="translate(${n(P(0.86, 0.36, 32.5)[0])},${n(P(0.86, 0.36, 32.5)[1])})"/>`,
  },
  'pencil-cup': {
    kind: 'floor',
    label: 'pencil cup',
    w: 1,
    d: 1,
    blocks: false,
    bias: 0.22,
    body: () => {
      const [a, b] = P(0.04, 0.04, 20)
      return box(0, 0, 0.08, 0.08, 15, 20, 'gy') + rect(a - 1, b - 4, 1, 4, '#e0403a') + rect(a + 0.5, b - 5, 1, 5, '#3b7bd4') + rect(a + 2, b - 3.5, 1, 3.5, '#f7d84a')
    },
  },
  notepad: { kind: 'floor', label: 'notepad', w: 1, d: 1, blocks: false, bias: 0.205, body: () => box(0, 0, 0.22, 0.16, 15, 15.6, 'wh') },
  lamp: {
    kind: 'floor',
    label: 'desk lamp',
    w: 1,
    d: 1,
    blocks: false,
    bias: 0.22,
    body: () => box(0, 0, 0.14, 0.14, 15, 16.5, 'gy') + box(0.05, 0.05, 0.09, 0.09, 16.5, 27, 'mt') + box(-0.04, -0.02, 0.14, 0.12, 26, 29, 'gy'),
  },
  binders: {
    kind: 'floor',
    label: 'ring binders',
    w: 1,
    d: 1,
    blocks: false,
    bias: 0.22,
    body: () => box(0, 0, 0.07, 0.3, 15, 27, 'gy') + box(0.08, 0, 0.15, 0.3, 15, 27, 'gy') + rect(P(0, 0.3, 24)[0] + 1, P(0, 0.3, 24)[1], 3, 4, '#ffffff'),
  },
  tower: {
    kind: 'floor',
    label: 'PC tower',
    w: 1,
    d: 1,
    blocks: false,
    bias: 0.05,
    body: () => box(0, 0, 0.2, 0.46, 0, 12, 'bk') + `<rect width="1.4" height="1.4" fill="#4fc3ff" transform="${faceY(0.02, 0.46, 10)}"/>`,
  },
  bin: { kind: 'floor', label: 'desk bin with lid', w: 1, d: 1, blocks: false, bias: 0.05, body: () => box(0, 0, 0.16, 0.18, 0, 7, 'wh') + box(-0.01, -0.01, 0.17, 0.19, 7, 8.2, 'gy') },
  trash: {
    kind: 'floor',
    label: 'round trash bin',
    w: 1,
    d: 1,
    blocks: false,
    bias: 0.05,
    body: () => {
      const [a, b] = P(0.12, 0.12, 0)
      return `<path d="M${n(a - 5)} ${n(b - 9)}h10l-1 9.5a4 1.5 0 0 1-8 0z" fill="#9aa1ab" stroke="#4a4452" stroke-width="1"/><ellipse cx="${n(a)}" cy="${n(b - 9)}" rx="5" ry="2" fill="#5d636e" stroke="#4a4452" stroke-width="1"/>`
    },
  },
  'chair-back': { kind: 'floor', label: 'office chair (backrest +y)', w: 1, d: 1, blocks: false, bias: 0.3, body: () => chair(0.38, true) },
  'chair-front': { kind: 'floor', label: 'office chair (backrest −y)', w: 1, d: 1, blocks: false, bias: 0.3, body: () => chair(0.62, false) },
  'chair-wood': {
    kind: 'floor',
    label: 'wooden chair',
    w: 1,
    d: 1,
    blocks: true,
    bias: 0.2,
    body: () =>
      box(0.3, 0.3, 0.36, 0.36, 0, 9, 'wd') +
      box(0.64, 0.3, 0.7, 0.36, 0, 9, 'wd') +
      box(0.3, 0.64, 0.36, 0.7, 0, 9, 'wd') +
      box(0.64, 0.64, 0.7, 0.7, 0, 9, 'wd') +
      box(0.28, 0.28, 0.72, 0.72, 9, 11, 'wd') +
      box(0.28, 0.28, 0.34, 0.72, 11, 24, 'wd'),
  },
  'table-orange': {
    kind: 'floor',
    label: 'meeting table',
    w: 1,
    d: 1,
    blocks: true,
    bias: 0.2,
    body: () => box(0.46, 0.46, 0.54, 0.54, 0, 13, 'mt') + box(0.3, 0.3, 0.7, 0.7, 0, 1.5, 'gy') + box(0.06, 0.06, 0.94, 0.94, 13, 16, 'or'),
  },
  'lamp-red': {
    kind: 'floor',
    label: 'red desk lamp',
    w: 1,
    d: 1,
    blocks: false,
    bias: 0.22,
    body: () => box(0, 0, 0.14, 0.14, 16, 17.5, 'rd') + box(0.05, 0.05, 0.09, 0.09, 17.5, 27, 'rd') + box(-0.04, -0.02, 0.16, 0.14, 26, 30, 'rd'),
  },
  'glass-y': {
    kind: 'edge',
    label: 'glass pane (along x)',
    plane: 'y',
    blocks: true,
    bias: 0.9,
    body: () =>
      face([P(0, 0, 0), P(1, 0, 0), P(1, 0, 58), P(0, 0, 58)], 'gl') +
      face([P(0.2, 0, 4), P(0.32, 0, 4), P(0.62, 0, 54), P(0.5, 0, 54)], 'gr') +
      `<polyline points="${pt(0, 0, 58)} ${pt(1, 0, 58)}" stroke="#aab2bc" stroke-width="1.2" fill="none"/><polyline points="${pt(0.03, 0, 57)} ${pt(0.97, 0, 57)}" class="ge"/>` +
      box(-0.018, -0.018, 0.018, 0.018, 0, 59, 'mt'),
  },
  'glass-x': {
    kind: 'edge',
    label: 'glass pane (along y)',
    plane: 'x',
    blocks: true,
    bias: 0.9,
    body: () =>
      face([P(0, 0, 0), P(0, 1, 0), P(0, 1, 58), P(0, 0, 58)], 'gl') +
      face([P(0, 0.68, 4), P(0, 0.8, 4), P(0, 0.5, 54), P(0, 0.38, 54)], 'gr') +
      `<polyline points="${pt(0, 0, 58)} ${pt(0, 1, 58)}" stroke="#aab2bc" stroke-width="1.2" fill="none"/><polyline points="${pt(0, 0.03, 57)} ${pt(0, 0.97, 57)}" class="ge"/>` +
      box(-0.018, 0.982, 0.018, 1.018, 0, 59, 'mt'),
  },
  partition: { kind: 'edge', label: 'low orange partition', plane: 'y', blocks: true, bias: 0.95, body: () => box(0, -0.14, 1, 0, 0, 18, 'or') },
  door: {
    kind: 'edge',
    label: 'door (closed)',
    plane: 'x',
    blocks: false,
    bias: 0.95,
    body: () =>
      face([P(0, 0.07, 0), P(0, 0.93, 0), P(0, 0.93, 60), P(0, 0.07, 60)], 'wd2') +
      `<g transform="${faceX(0, 0.93, 60)}">${rect(2, 4, 13.2, 22, 'none', ' stroke="#ad8559" stroke-width="1"')}${rect(2, 30, 13.2, 26, 'none', ' stroke="#ad8559" stroke-width="1"')}${rect(2.5, 4.5, 12.2, 0.6, '#ecd3a8')}${rect(2.5, 30.5, 12.2, 0.6, '#ecd3a8')}${rect(13, 30, 3.2, 1.6, '#d6dae0', ' stroke="#6f7682" stroke-width=".4"')}${rect(13.3, 30.3, 1.4, 0.5, '#ffffff')}</g>` +
      doorFrame(),
  },
  'door-open': {
    kind: 'edge',
    label: 'door (open)',
    plane: 'x',
    blocks: false,
    bias: 0.95,
    body: () =>
      face([P(0, 0.07, 0), P(0, 0.93, 0), P(0, 0.93, 60), P(0, 0.07, 60)], 'bk3') +
      box(-0.62, 0.07, 0, 0.11, 0, 60, 'wd') +
      `<g transform="${faceY(-0.62, 0.11, 60)}">${rect(1.5, 30, 1.6, 3.2, '#d6dae0', ' stroke="#6f7682" stroke-width=".4"')}${rect(1.8, 30.3, 0.5, 1.4, '#ffffff')}</g>` +
      doorFrame(),
  },}

function generated(): Record<string, Sprite> {
  const out: Record<string, Sprite> = {}
  for (const [id, item] of Object.entries(WALL_ITEMS)) out[id] = { kind: 'wall', label: item.label, width: item.width, height: item.height, item }
  for (const [id, item] of Object.entries(FURNITURE)) {
    const base = { kind: 'floor' as const, w: 1, d: 1, blocks: item.blocks, bias: item.bias }
    out[id] = { ...base, label: item.label, body: phase => item.body(phase, 'r') }
    out[`${id}-l`] = { ...base, label: `${item.label} · left wall`, body: phase => item.body(phase, 'l') }
  }
  return out
}

export const KIT: Readonly<Record<string, Sprite>> = { ...BASE, ...generated() }

export const SIDES: readonly Side[] = ['r', 'l']

export function doorFrame(): string {
  return box(-0.06, 0, 0.05, 0.07, 0, 62, 'wd') + box(-0.06, 0.93, 0.05, 1, 0, 62, 'wd') + box(-0.06, 0, 0.05, 1, 60, 64, 'wd')
}

function sofa(part: 'left' | 'mid' | 'right'): string {
  const arm = (isLeft: boolean) => (isLeft ? box(0, 0.06, 0.2, 0.95, 0, 13, 'bg') : box(0.8, 0.06, 1, 0.95, 0, 13, 'bg'))
  const cushion = part === 'mid' ? box(0.25, 0.3, 0.75, 0.42, 7, 20, 'tl') : ''
  return (
    box(0, 0.05, 1, 0.32, 0, 23, 'bg') +
    (part === 'left' ? arm(true) : '') +
    box(0, 0.3, 1, 0.95, 0, 7, 'bg') +
    cushion +
    `<polyline points="${pt(part === 'left' ? 0.2 : 0, 0.62, 7)} ${pt(part === 'right' ? 0.8 : 1, 0.62, 7)}" fill="none" stroke="#c3af8b" stroke-width="1"/>` +
    (part === 'right' ? arm(false) : '')
  )
}

function desk(hasDrawer: boolean): string {
  return (
    box(0.05, 0.1, 0.12, 0.94, 0, 12, 'or') +
    (hasDrawer ? box(0.13, 0.08, 0.87, 0.14, 2, 12, 'or') : '') +
    box(0.88, 0.1, 0.95, 0.94, 0, 12, 'or') +
    (hasDrawer
      ? box(0.5, 0.5, 0.87, 0.92, 7, 12, 'or') + `<g transform="${faceY(0.5, 0.92, 12)}">${rect(3.4, 2, 2.6, 0.9, '#8a4718')}</g>`
      : '') +
    box(0.03, 0.04, 0.97, 0.96, 12, 15, 'or')
  )
}

function chair(cy: number, backAtPlusY: boolean): string {
  const back = backAtPlusY ? box(0.3, cy + 0.18, 0.7, cy + 0.26, 11, 25, 'bk') : box(0.3, cy - 0.26, 0.7, cy - 0.18, 11, 25, 'bk')
  const uprightY = backAtPlusY ? cy + 0.2 : cy - 0.22
  return (
    box(0.3, cy - 0.2, 0.34, cy + 0.2, 0, 1.2, 'mt') +
    box(0.66, cy - 0.2, 0.7, cy + 0.2, 0, 1.2, 'mt') +
    box(0.31, uprightY, 0.34, uprightY + 0.03, 1.2, 9, 'mt') +
    box(0.66, uprightY, 0.69, uprightY + 0.03, 1.2, 9, 'mt') +
    box(0.31, cy - 0.17, 0.34, cy - 0.14, 1.2, 9, 'mt') +
    box(0.66, cy - 0.17, 0.69, cy - 0.14, 1.2, 9, 'mt') +
    (backAtPlusY ? '' : back) +
    box(0.28, cy - 0.2, 0.72, cy + 0.2, 8, 11, 'bk') +
    (backAtPlusY ? back : '')
  )
}

export function kitDefs(phase: Phase): Map<string, string> {
  const defs = new Map<string, string>()
  defs.set('leaves', `<g id="leaves">${art({ rows: ['....tt.....', '..ttTTt.t..', '.tTTTtTTtt.', 'ttTTtTTTTtt', '.tTtTTtTtT.', 'tTTTTtTTTt.', '.TtTTTTtTT.', '..TTTtTTT..', '...TttTT...'] })}</g>`)
  defs.set('bonsai', `<g id="bonsai">${art({ rows: ['...tttt....', '.tttTTttt..', 'tTTtttTTtt.', '.ttTTtttt..', '....TT.....', '....T......'] })}</g>`)
  defs.set('rack-plant', `<g id="rack-plant">${art({ rows: LEAF })}</g>`)
  defs.set('k-floor-p', `<pattern id="k-floor-p" patternUnits="userSpaceOnUse" width="40" height="20"><rect width="40" height="20" fill="#dfe5ec"/><path d="M0 0L40 20M40 0L0 20" stroke="#c3cdd8" stroke-width="1"/></pattern>`)
  defs.set('k-louvre', WALL_PATTERNS.slice(0, WALL_PATTERNS.indexOf('</pattern>') + 10))
  defs.set('k-cork', WALL_PATTERNS.slice(WALL_PATTERNS.indexOf('</pattern>') + 10))
  for (const [id, sprite] of Object.entries(KIT)) {
    if (sprite.kind === 'wall')
      for (const side of SIDES) {
        defs.set(`k-${id}-${side}`, `<g id="k-${id}-${side}">${sprite.item.body(phase, side)}</g>`)
        const hands = sprite.item.hands
        if (hands !== undefined) defs.set(`k-${id}-hands-${side}`, `<g id="k-${id}-hands-${side}">${hands(phase, side)}</g>`)
      }
    else defs.set(`k-${id}`, `<g id="k-${id}">${sprite.body(phase)}</g>`)
  }
  return defs
}

export function isFloorSprite(sprite: Sprite | undefined): sprite is FloorSprite {
  return sprite?.kind === 'floor'
}

