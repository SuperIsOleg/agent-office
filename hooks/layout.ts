import type { OfficeTile } from '../types'

import { KIT } from './kit'
import { FURNITURE, wallMargin } from './kit-wall'

export const GRID_W = 21
export const GRID_H = 15

export type Facing = 'front' | 'back'

export type ScreenKind = 'monitor' | 'imac' | 'none'

export type Desk = { desk: OfficeTile; seat: OfficeTile; facing: Facing; screen: ScreenKind }

export type Placed = { sprite: string; x: number; y: number; z?: number; desk?: number; mirror?: boolean }

export type WallPlaced = { sprite: string; plane: 'x' | 'y'; x: number; y: number; z: number; depth?: number }

export type EdgePlaced = { sprite: string; x: number; y: number }

const floor: Placed[] = []
const edges: EdgePlaced[] = []
const desks: Desk[] = []

const place = (sprite: string, x: number, y: number, extra: Partial<Placed> = {}) => floor.push({ sprite, x, y, ...extra })

function backDesk(x: number, y: number, lamp = false): number {
  const index = desks.length
  desks.push({ desk: { x, y }, seat: { x, y: y + 1 }, facing: 'back', screen: 'monitor' })
  place('bin', x + 0.18, y + 0.62)
  place('desk-back', x, y)
  place('monitor', x, y, { desk: index })
  place('keyboard', x + 0.28, y + 0.52)
  place('mouse', x + 0.8, y + 0.56)
  place('mug', x + 0.1, y + 0.6)
  place('pencil-cup', x + 0.84, y + 0.3)
  if (lamp) place('lamp', x + 0.06, y + 0.3)
  else place('notepad', x + 0.08, y + 0.32)
  place('chair-back', x, y + 1)
  return index
}

function frontDesk(x: number, y: number, lamp = false): number {
  const index = desks.length
  desks.push({ desk: { x, y }, seat: { x, y: y - 1 }, facing: 'front', screen: 'none' })
  place('bin', x + 0.66, y + 0.2)
  place('desk-front', x, y)
  place('monitor-back', x, y)
  place('keyboard', x + 0.28, y + 0.3)
  place('mouse', x + 0.8, y + 0.34)
  place('notepad', x + 0.7, y + 0.56)
  if (lamp) place('lamp', x + 0.08, y + 0.56)
  else place('mug', x + 0.12, y + 0.58)
  place('chair-front', x, y - 1)
  return index
}

function single(x: number, y: number, isBoss: boolean): Desk {
  const desk: Desk = { desk: { x, y }, seat: { x, y: y + 1 }, facing: 'back', screen: 'imac' }
  const index = isBoss ? -1 : desks.length
  if (!isBoss) desks.push(desk)
  place('tower', x + 0.16, y + 0.36)
  place('desk-white', x, y)
  place('imac', x, y, { desk: index })
  place('keyboard', x + 0.3, y + 0.52)
  place('mouse', x + 0.8, y + 0.56)
  place('binders', x + 0.06, y + 0.52)
  place('trash', x + 0.98, y + 0.56)
  place('chair-back', x, y + 1)
  return desk
}

function wall(sprite: string, plane: 'x' | 'y', along: number, z: number): WallPlaced {
  return plane === 'y' ? { sprite, plane, x: along, y: 0, z } : { sprite, plane, x: 0, y: along, z }
}

for (let x = 0; x < GRID_W; x += 1) floor.push({ sprite: 'wall-right', x, y: 0 }, { sprite: 'wall-top', x, y: 0 })
for (let y = 0; y < GRID_H; y += 1) floor.push({ sprite: 'wall-left', x: 0, y }, { sprite: 'wall-top-left', x: 0, y })

place('boxes', 0, 0)
place('wardrobe', 2, 0)
place('wardrobe', 3, 0)
place('locker', 4, 0)
place('locker', 5, 0)
place('cooler', 18, 0)
place('fridge', 19, 0)
place('counter', 20, 0)
place('wall-cabinet', 20, 0)
place('coffee-machine', 20, 0, { z: 14 })
place('mug', 20.3, 0.3, { z: 14 })
place('mug', 20.55, 0.45, { z: 14 })

place('flipchart-l', 0, 3)
place('copier-white-l', 0, 4)
place('copier-white-l', 0, 5)
place('copier-black-l', 0, 6)

for (let x = 0; x <= 6; x += 1) edges.push({ sprite: 'glass-y', x, y: 8 })
for (let y = 8; y <= 12; y += 1) edges.push({ sprite: 'glass-x', x: 7, y })
place('rack-l', 0, 10)
place('rack-l', 0, 11)
place('rug', 1, 9)
place('side-table', 1, 9)
place('sofa-left', 2, 9)
place('sofa-mid', 3, 9)
place('sofa-right', 4, 9)

place('table-orange', 18, 13)
place('chair-wood', 17, 13)
place('chair-wood', 18, 12, { mirror: true })
place('lamp-red', 18.42, 13.42)
place('mug', 18.7, 13.62, { z: 1 })

for (let x = 0; x < GRID_W; x += 1) edges.push({ sprite: 'partition', x, y: GRID_H })
for (let y = 2; y < GRID_H; y += 1) if (y !== 12) edges.push({ sprite: 'glass-x', x: GRID_W, y })

const backOrder = [
  [9, 5, false],
  [12, 5, true],
  [15, 5, false],
  [9, 11, false],
  [12, 11, true],
] as const
for (const [x, y, lamp] of backOrder) backDesk(x, y, lamp)
single(15, 11, false)
single(4, 4, false)
const frontOrder = [
  [9, 4, true],
  [12, 4, false],
  [15, 4, false],
  [9, 10, false],
  [12, 10, true],
] as const
for (const [x, y, lamp] of frontOrder) frontDesk(x, y, lamp)

export const BOSS_DESK: Desk = single(18, 5, true)

export const FLOOR: readonly Placed[] = floor
export const EDGES: readonly EdgePlaced[] = edges
export const DESKS: readonly Desk[] = desks

export const DOOR: OfficeTile = { x: GRID_W - 1, y: 12 }

export const PORCH: OfficeTile = { x: GRID_W, y: DOOR.y }

export const EXIT: OfficeTile = { x: GRID_W, y: DOOR.y + 1 }

export function queueTile(index: number): OfficeTile {
  return { x: GRID_W, y: DOOR.y - index }
}

export type SeatSpot = { tile: OfficeTile; facing: Facing; mirror: boolean }

export const MEETING_SEATS: readonly SeatSpot[] = [
  { tile: { x: 17, y: 13 }, facing: 'front', mirror: true },
  { tile: { x: 18, y: 12 }, facing: 'front', mirror: false },
]

export const LAPTOP_SPOTS: readonly OfficeTile[] = [
  { x: 6, y: 11 },
  { x: 5, y: 12 },
  { x: 6, y: 9 },
  { x: 5, y: 10 },
  { x: 6, y: 12 },
]

export const WALLS: readonly WallPlaced[] = [
  wall('clock', 'y', 2.5, 95),
  wall('vent', 'y', 4.3, 99),
  wall('window-wide', 'y', 7.0, 84),
  wall('poster', 'y', 10.4, 80),
  wall('stickies', 'y', 12.3, 78),
  wall('whiteboard', 'y', 14.4, 80),
  wall('vent', 'y', 15.2, 99),
  wall('window-plant', 'x', 2.55, 88),
  wall('clock', 'x', 4.25, 95),
  wall('vent', 'x', 6.5, 99),
  wall('whiteboard', 'x', 7.5, 84),
  wall('schedule', 'x', 9.9, 92),
  wall('cork', 'x', 12.0, 96),
  wall('vent', 'x', 14.0, 102),
  wall('window-2', 'x', 14.5, 84),
]

export const FURNITURE_HEIGHT: Readonly<Record<string, number>> = {
  boxes: 32,
  ...Object.fromEntries(Object.entries(FURNITURE).flatMap(([id, item]) => [
    [id, item.height],
    [`${id}-l`, item.height],
  ])),
}

export const SUPPORTS: ReadonlySet<string> = new Set(['desk-back', 'desk-front', 'desk-white', 'table-orange', 'counter'])

export const NEEDS_SUPPORT: ReadonlySet<string> = new Set(['monitor', 'monitor-back', 'imac', 'keyboard', 'mouse', 'mug', 'pencil-cup', 'notepad', 'lamp', 'lamp-red', 'binders', 'coffee-machine'])

export type WallSlot = { what: string; plane: 'x' | 'y'; from: number; to: number; z0: number; z1: number; isDecor: boolean }

export function wallSlots(): WallSlot[] {
  const slots: WallSlot[] = []
  for (const item of WALLS) {
    const sprite = KIT[item.sprite]
    if (sprite?.kind !== 'wall') continue
    const span = sprite.width / 20
    const edge = wallMargin(sprite.item, item.plane === 'y' ? 'r' : 'l')
    const z1 = item.z + edge.t
    const z0 = item.z - sprite.height - edge.b
    if (item.plane === 'y') slots.push({ what: item.sprite, plane: 'y', from: item.x - edge.l / 20, to: item.x + span + edge.r / 20, z0, z1, isDecor: true })
    else slots.push({ what: item.sprite, plane: 'x', from: item.y - span - edge.r / 20, to: item.y + edge.l / 20, z0, z1, isDecor: true })
  }
  for (const item of floor) {
    const height = FURNITURE_HEIGHT[item.sprite]
    if (height === undefined) continue
    const z0 = item.sprite === 'wall-cabinet' ? 50 : 0
    if (item.y === 0) slots.push({ what: item.sprite, plane: 'y', from: item.x, to: item.x + 1, z0, z1: height, isDecor: false })
    if (item.x === 0) slots.push({ what: item.sprite, plane: 'x', from: item.y, to: item.y + 1, z0, z1: height, isDecor: false })
  }
  for (const item of edges) {
    if (item.sprite === 'glass-y' && item.x === 0) slots.push({ what: 'glass', plane: 'x', from: item.y - 0.1, to: item.y + 0.1, z0: 0, z1: 58, isDecor: false })
  }
  return slots
}

export const KITCHEN: readonly SeatSpot[] = [
  { tile: { x: 20, y: 1 }, facing: 'back', mirror: false },
  { tile: { x: 19, y: 1 }, facing: 'back', mirror: false },
  { tile: { x: 18, y: 1 }, facing: 'back', mirror: false },
  { tile: { x: 20, y: 2 }, facing: 'back', mirror: false },
  { tile: { x: 19, y: 2 }, facing: 'back', mirror: false },
  { tile: { x: 18, y: 2 }, facing: 'back', mirror: false },
]

export const COFFEE_SPOTS: readonly OfficeTile[] = KITCHEN.map(spot => spot.tile)

export const SOFA_SPOTS = 3

export const LOUNGE_SPOTS: readonly OfficeTile[] = [
  { x: 2, y: 9 },
  { x: 3, y: 9 },
  { x: 4, y: 9 },
]

export const STUDY_SPOTS: readonly OfficeTile[] = [
  { x: 1, y: 3 },
  { x: 2, y: 4 },
  { x: 2, y: 2 },
]

export const OVERFLOW_SPOTS: readonly OfficeTile[] = [MEETING_SEATS[0]?.tile ?? DOOR, ...LAPTOP_SPOTS, MEETING_SEATS[1]?.tile ?? DOOR]

export type Seat = SeatSpot & { key: string; desk?: Desk; chair?: Placed }

function chairAt(tile: OfficeTile): Placed | undefined {
  return floor.find(item => item.sprite.startsWith('chair') && item.x === tile.x && item.y === tile.y)
}

function seatOf(key: string, tile: OfficeTile, facing: Facing, mirror: boolean, desk?: Desk): Seat {
  const chair = chairAt(tile)
  return { key, tile, facing, mirror, ...(desk !== undefined ? { desk } : {}), ...(chair !== undefined ? { chair } : {}) }
}

export const SEATS: readonly Seat[] = [
  ...desks.map((desk, index) => seatOf(`desk:${index}`, desk.seat, desk.facing, false, desk)),
  seatOf('boss', BOSS_DESK.seat, BOSS_DESK.facing, false, BOSS_DESK),
  ...MEETING_SEATS.map((seat, index) => seatOf(`meet:${index}`, seat.tile, seat.facing, seat.mirror)),
  ...LOUNGE_SPOTS.map((tile, index) => seatOf(`sofa:${index}`, tile, 'front', false)),
]

export const SEAT_TILES: ReadonlySet<string> = new Set(SEATS.map(seat => `${seat.tile.x},${seat.tile.y}`))

function deriveBlocked(): ReadonlySet<string> {
  const blocked = new Set<string>()
  for (const item of floor) {
    const sprite = KIT[item.sprite]
    if (sprite?.kind !== 'floor' || !sprite.blocks) continue
    const x0 = Math.floor(item.x)
    const y0 = Math.floor(item.y)
    for (let dx = 0; dx < Math.max(1, sprite.w); dx += 1) for (let dy = 0; dy < Math.max(1, sprite.d); dy += 1) blocked.add(`${x0 + dx},${y0 + dy}`)
  }
  return blocked
}

function deriveEdges(): ReadonlySet<string> {
  const blocked = new Set<string>()
  for (const item of edges) {
    const sprite = KIT[item.sprite]
    if (sprite?.kind !== 'edge' || !sprite.blocks) continue
    const a = sprite.plane === 'y' ? `${item.x},${item.y - 1}` : `${item.x - 1},${item.y}`
    const b = `${item.x},${item.y}`
    blocked.add(`${a}|${b}`)
    blocked.add(`${b}|${a}`)
  }
  return blocked
}

export const BLOCKED: ReadonlySet<string> = deriveBlocked()
export const BLOCKED_EDGES: ReadonlySet<string> = deriveEdges()
