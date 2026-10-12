import type { OfficeActKind, OfficeAgent, OfficeCoordinator, OfficeTile } from '../types'

import { HH, HW, P, box, face, faceY, n, pt, rect } from './iso'
import { KIT, KIT_STYLE, WALL, doorFrame, kitDefs } from './kit'
import type { FloorSprite } from './kit'
import { BOSS_DESK, EDGES, FLOOR, FURNITURE_HEIGHT, KITCHEN, MEETING_SEATS, SEATS, SOFA_SPOTS, WALLS } from './layout'
import type { Desk, EdgePlaced, Placed, WallPlaced } from './layout'
import { COORDINATOR_ROLE, STATUS_WORD, formatCost, outfitOf, roleOf } from './roles'
import type { AnyStatus, Icon, Outfit, Role } from './roles'
import { AVATAR_CX, HAIR_COLORS, HAIR_COUNT, POSES, SKINS, SPRITE_STYLE, hashOf, poseHeight, spriteDefs, wearId } from './sprites'
import type { PoseId } from './sprites'
import { DESKS, DOOR, GRID_H, GRID_W, bossLabel, completedOfType, deskOf, isBossAtDesk, isSame, isStaff, nameOf } from './world'
import type { Facing } from './world'

export const OX = 12 + GRID_H * HW
export const OY = 118
export const ROOM_W = OX + GRID_W * HW + 12
export const ROOM_H = OY + (GRID_W + GRID_H) * HH + 12

type FigureInput = {
  now: number
  allAgents: Readonly<Record<string, OfficeAgent>>
  coordinator: OfficeCoordinator
}

export function setArtClock(now: number): void {
  renderNow = now
}

const SEAT_Z = 10

let renderNow = 0

export function loop(dur: number, offsetMs = 0): string {
  const period = Math.max(1, Math.round(dur * 1000))
  const phase = (((renderNow + offsetMs) % period) + period) % period
  return `begin="-${(phase / 1000).toFixed(2)}s" repeatCount="indefinite"`
}

const STYLE = `<style>
${SPRITE_STYLE}
${KIT_STYLE}
.bp1{fill:#3b7bd4}.bp2{fill:#2d63b0}.bp3{fill:#245192}
text{font-family:Verdana,Tahoma,'DejaVu Sans',sans-serif;font-weight:bold}
.tg{font-size:5.6px;fill:#fff}.tc{font-size:5.4px;fill:#5fe08f}.tb{font-size:6.5px;fill:#1f2230}
.hv{font-size:8.5px;fill:#f4f1ea}
.ev{font-size:6.5px;fill:#c9cfdc;font-weight:normal}.et{font-size:6.5px;fill:#7f889c;font-weight:normal}
.dh{font-size:8px;fill:#1f2430}.dn{font-size:10px;fill:#1f2430}.ds{font-size:6px;fill:#6b7280;font-weight:normal}.dv{font-size:8.5px;fill:#1f2430}.dl{font-size:4.6px;fill:#8a909c;letter-spacing:.3px}.dt{font-size:5.6px;fill:#30343e;font-weight:normal}.dc{font-size:5.2px}.dk{font-size:5.8px;fill:#2f6fe0}
</style>`

const SCREEN_X = 1.5

const SCREEN_Y = 1.5

const SCREEN_W = 13.8

const SCREEN_H = 14

function lines(spec: readonly [number, number, number, string][]): string {
  return spec.map(([x, y, w, c]) => rect(SCREEN_X + x, SCREEN_Y + y, w, 1.5, c)).join('')
}

const CURSOR = (x: number, y: number, c: string) =>
  `<rect x="${n(SCREEN_X + x)}" y="${n(SCREEN_Y + y)}" width="1.5" height="2" fill="${c}"><animate attributeName="opacity" values="1;0" dur="1s" calcMode="discrete" ${loop(1)}/></rect>`

function screenDefs(): Map<string, string> {
  const bg = (c: string) => rect(SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H, c)
  const code = bg('#1d2433') + lines([[1, 1.5, 5, '#ff7b72'], [2, 4, 8, '#79c0ff'], [2, 6.5, 6, '#d2a8ff'], [3, 9, 7, '#a5d6ff'], [1, 11.5, 4, '#7ee787']]) + CURSOR(6, 11.3, '#fff')
  const term = bg('#0c130f') + lines([[1, 1.5, 9, '#4be37a'], [1, 4, 6, '#2fa758'], [1, 6.5, 10, '#4be37a'], [1, 9, 4, '#2fa758']]) + CURSOR(1, 11.3, '#4be37a')
  const read = bg('#f4f6f9') + lines([[1, 1.5, 7, '#3b4252'], [1, 4.5, 11, '#a9b1c0'], [1, 7, 10, '#a9b1c0'], [1, 9.5, 11, '#a9b1c0'], [1, 12, 6, '#a9b1c0']])
  const web = bg('#ffffff') + rect(SCREEN_X, SCREEN_Y, SCREEN_W, 2.5, '#4a90e2') + rect(SCREEN_X + 1, SCREEN_Y + 4, 5.5, 5, '#9fd3ff') + lines([[7.5, 4.5, 5, '#a9b1c0'], [7.5, 7, 4, '#a9b1c0'], [1, 10.5, 11, '#c3c9d4']])
  const sim = bg('#262a33') + rect(SCREEN_X + 4, SCREEN_Y + 1, 6, 12, '#f4f6f9') + rect(SCREEN_X + 5, SCREEN_Y + 3, 1.8, 1.8, '#ef6fa8') + rect(SCREEN_X + 7.2, SCREEN_Y + 3, 1.8, 1.8, '#5d8fe0') + rect(SCREEN_X + 5, SCREEN_Y + 5.5, 1.8, 1.8, '#3ddc84') + rect(SCREEN_X + 7.2, SCREEN_Y + 5.5, 1.8, 1.8, '#ffc93c')
  const chart =
    bg('#ffffff') +
    rect(SCREEN_X + 1, SCREEN_Y + 12.5, 11.8, 0.8, '#8d96aa') +
    rect(SCREEN_X + 2, SCREEN_Y + 8, 2, 4.5, '#ef6fa8') +
    rect(SCREEN_X + 5, SCREEN_Y + 5, 2, 7.5, '#5d8fe0') +
    rect(SCREEN_X + 8, SCREEN_Y + 7, 2, 5.5, '#3ddc84') +
    rect(SCREEN_X + 11, SCREEN_Y + 3, 1.6, 9.5, '#ffc93c')
  const plan =
    bg('#1f5aa6') +
    rect(SCREEN_X + 1.5, SCREEN_Y + 1.5, 4.5, 3.5, 'none', ' stroke="#fff" stroke-width=".8"') +
    rect(SCREEN_X + 8, SCREEN_Y + 7, 4.5, 3.5, 'none', ' stroke="#fff" stroke-width=".8"') +
    rect(SCREEN_X + 3.5, SCREEN_Y + 5, 0.8, 4, '#cfe3ff') +
    rect(SCREEN_X + 3.5, SCREEN_Y + 8.5, 4.5, 0.8, '#cfe3ff')
  const diff = bg('#1d2433') + rect(SCREEN_X, SCREEN_Y + 3.5, SCREEN_W, 2, '#3a1f26') + rect(SCREEN_X, SCREEN_Y + 7.5, SCREEN_W, 2, '#1d3a27') + lines([[1, 1.5, 7, '#a5d6ff'], [1, 4, 9, '#f85149'], [1, 8, 8, '#3fb950'], [1, 11, 6, '#a5d6ff']])
  const git =
    bg('#1d2433') +
    rect(SCREEN_X + 3, SCREEN_Y + 1, 1, 12, '#79c0ff') +
    rect(SCREEN_X + 4, SCREEN_Y + 5, 4, 1, '#d2a8ff') +
    rect(SCREEN_X + 8, SCREEN_Y + 5, 1, 6, '#d2a8ff') +
    rect(SCREEN_X + 2.5, SCREEN_Y + 2, 2, 2, '#ffc93c') +
    rect(SCREEN_X + 7.5, SCREEN_Y + 9, 2, 2, '#3ddc84') +
    rect(SCREEN_X + 2.5, SCREEN_Y + 10, 2, 2, '#ff7b72')
  const mail = bg('#f4f6f9') + rect(SCREEN_X + 2.5, SCREEN_Y + 3, 9, 7, '#ffffff', ' stroke="#4a90e2" stroke-width=".8"') + `<path d="M${SCREEN_X + 2.5} ${SCREEN_Y + 3}l4.5 4 4.5-4" fill="none" stroke="#4a90e2" stroke-width=".8"/>` + rect(SCREEN_X + 3, SCREEN_Y + 11.5, 8, 1.5, '#3ddc84')
  const ask = bg('#fff1bf') + `<text x="${SCREEN_X + 5}" y="${SCREEN_Y + 11}" style="font-size:11px;fill:#8a6a00">?</text>`
  const err = bg('#d93b3b') + `<text x="${SCREEN_X + 5.5}" y="${SCREEN_Y + 11}" style="font-size:11px;fill:#fff">!</text>`
  const ok = bg('#2fbf71') + `<path d="M${SCREEN_X + 3} ${SCREEN_Y + 7.5}l3 3 5-6" fill="none" stroke="#fff" stroke-width="1.6"/>`
  const off = bg('#141822') + `<path d="M${SCREEN_X + 8} ${SCREEN_Y}h3l-6 ${SCREEN_H}h-3z" fill="#222a39"/>`
  const photo =
    bg('#7cc4f0') +
    rect(SCREEN_X, SCREEN_Y + 8, SCREEN_W, 6, '#5fae5a') +
    `<path d="M${SCREEN_X} ${SCREEN_Y + 9}l4-4 3 2.5 3.5-4.5 3.3 6v1H${SCREEN_X}z" fill="#3f8f4a"/>` +
    rect(SCREEN_X + 10, SCREEN_Y + 2, 2.5, 2.5, '#ffe27a')
  const all: Record<string, string> = { code, term, read, web, sim, chart, plan, diff, git, mail, ask, err, ok, off, photo }
  return new Map(Object.entries(all).map(([id, body]) => [`sc-${id}`, `<g id="sc-${id}">${body}</g>`]))
}

const SHARED_DEFS: ReadonlyMap<string, string> = new Map([
  ['shd', '<ellipse id="shd" rx="9" ry="3.5" fill="#1b1f2a" fill-opacity=".18"/>'],
  ['ci', '<path id="ci" d="M0 2h5v3.2h-3l-1.2 1.2v-1.2h-.8z" fill="none" stroke="#c9cdd6" stroke-width=".7"/>'],
])

function refsOf(markup: string): string[] {
  return [...markup.matchAll(/(?:href="#|url\(#)([^")]+)/g)].map(match => match[1] ?? '')
}

export function defsFor(body: string): string {
  const all = new Map<string, string>([...spriteDefs(loop), ...kitDefs(loop), ...screenDefs(), ...SHARED_DEFS])
  const need = new Set<string>()
  const queue = refsOf(body)
  while (queue.length > 0) {
    const id = queue.pop()
    if (id === undefined || need.has(id)) continue
    need.add(id)
    const def = all.get(id)
    if (def !== undefined) queue.push(...refsOf(def))
  }
  let out = ''
  for (const [id, markup] of all) if (need.has(id)) out += markup
  return `<defs>${STYLE}${out}</defs>`
}

export type Drawable = { depth: number; svg: string; box?: Box2 }

type DayPart = 'day' | 'dusk' | 'night'

export function dayPart(now: number): DayPart {
  const hour = new Date(now).getHours()
  return hour >= 7 && hour < 17 ? 'day' : hour >= 17 && hour < 20 ? 'dusk' : 'night'
}

const SKY: Readonly<Record<DayPart, readonly [string, string, number]>> = {
  day: ['#bfe6ff', '#e3f4ff', 0],
  dusk: ['#f4a873', '#f8d8a4', 0],
  night: ['#26355f', '#3a4b7a', 1],
}

export function roomVars(now: number): string {
  const [sky, low, night] = SKY[dayPart(now)]
  return `--sky:${sky};--sky2:${low};--night:${night};--day:${1 - night}`
}

function handVars(now: number): string {
  const date = new Date(now)
  const hours = ((date.getHours() % 12) + date.getMinutes() / 60) * 30
  const minutes = (date.getMinutes() + date.getSeconds() / 60) * 6
  return `--hh:${n(hours)}deg;--mm:${n(minutes)}deg`
}

export function skyVars(now: number): string {
  return `${roomVars(now)};${handVars(now)}`
}

function useAt(id: string, x: number, y: number, z = 0, mirror = false): string {
  const [a, b] = P(x, y, z)
  if (mirror) return `<use href="#k-${id}" transform="translate(${n(a)} ${n(b)}) scale(-1 1)"/>`
  return `<use href="#k-${id}" x="${n(a)}" y="${n(b)}"/>`
}

function floorDepth(item: Placed, sprite: FloorSprite): number {
  return Math.floor(item.x) + Math.floor(item.y) + Math.max(0, sprite.w - 1) + Math.max(0, sprite.d - 1) + sprite.bias
}

function edgeDepth(item: EdgePlaced, plane: 'x' | 'y', bias: number): number {
  return plane === 'y' ? item.x + item.y - 1 + bias : item.x - 1 + item.y + bias
}

function wallUse(item: WallPlaced): string {
  const [a, b] = P(item.x, item.y, item.z)
  return `<use href="#k-${item.sprite}-${item.plane === 'y' ? 'r' : 'l'}" x="${n(a)}" y="${n(b)}"/>`
}

const HEIGHT_HINT: Readonly<Record<string, number>> = {
  'desk-back': 16,
  'desk-front': 16,
  'desk-white': 16,
  monitor: 36,
  'monitor-back': 36,
  imac: 42,
  'chair-back': 26,
  'chair-front': 26,
  'chair-wood': 25,
  'table-orange': 17,
  'lamp-red': 31,
  'side-table': 15,
  'sofa-left': 24,
  'sofa-mid': 24,
  'sofa-right': 24,
  plant: 40,
  partition: 19,
  'glass-x': 60,
  'glass-y': 60,
  door: 65,
  'door-open': 65,
}

function spanBox(corners: readonly (readonly [number, number])[], height: number): Box2 {
  const xs = corners.map(([x, y]) => P(x, y)[0])
  const ys = corners.map(([x, y]) => P(x, y)[1])
  const top = Math.min(...ys) - height
  return { x: Math.min(...xs), y: top, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - top }
}

function floorBox(item: Placed, sprite: FloorSprite): Box2 {
  const x0 = Math.floor(item.x)
  const y0 = Math.floor(item.y)
  const height = (FURNITURE_HEIGHT[item.sprite] ?? HEIGHT_HINT[item.sprite] ?? 30) + (item.z ?? 0)
  const w = Math.max(1, sprite.w)
  const d = Math.max(1, sprite.d)
  return spanBox(
    [
      [x0, y0],
      [x0 + w, y0],
      [x0 + w, y0 + d],
      [x0, y0 + d],
    ],
    height,
  )
}

function edgeBox(item: EdgePlaced, plane: 'x' | 'y', sprite: string): Box2 {
  const height = HEIGHT_HINT[sprite] ?? 60
  const far = plane === 'y' ? ([item.x + 1, item.y] as const) : ([item.x, item.y + 1] as const)
  return spanBox([[item.x - 0.1, item.y - 0.1], far], height)
}

export function roomLayers(doorOpen: boolean, skip: (item: Placed) => boolean = () => false): { ground: string; drawables: Drawable[] } {
  let walls = ''
  let ground = ''
  const drawables: Drawable[] = []
  for (const item of FLOOR) {
    const sprite = KIT[item.sprite]
    if (sprite?.kind !== 'floor' || skip(item)) continue
    const svg = useAt(item.sprite, item.x, item.y, item.z ?? 0, item.mirror === true)
    if (sprite.ground && sprite.bias < 0) walls += svg
    else if (sprite.ground) ground += svg
    else drawables.push({ depth: floorDepth(item, sprite), svg, box: floorBox(item, sprite) })
  }
  for (const item of [...EDGES, { sprite: doorOpen ? 'door-open' : 'door', x: GRID_W, y: DOOR.y }]) {
    const sprite = KIT[item.sprite]
    if (sprite?.kind !== 'edge') continue
    drawables.push({ depth: edgeDepth(item, sprite.plane, sprite.bias), svg: useAt(item.sprite, item.x, item.y), box: edgeBox(item, sprite.plane, item.sprite) })
  }
  for (const item of WALLS) {
    if (item.depth !== undefined) drawables.push({ depth: item.depth, svg: wallUse(item) })
    else walls += wallUse(item)
  }
  const ends =
    face([P(GRID_W, -0.14, WALL), P(GRID_W, 0, WALL), P(GRID_W, 0, 0), P(GRID_W, -0.14, 0)], 'wb') +
    face([P(-0.14, GRID_H, WALL), P(0, GRID_H, WALL), P(0, GRID_H, 0), P(-0.14, GRID_H, 0)], 'wa')
  const slab =
    face([P(0, GRID_H, 0), P(GRID_W, GRID_H, 0), P(GRID_W, GRID_H, -8), P(0, GRID_H, -8)], 'f1') +
    face([P(GRID_W, 0, 0), P(GRID_W, GRID_H, 0), P(GRID_W, GRID_H, -8), P(GRID_W, 0, -8)], 'f2') +
    `<polygon points="${pt(0, 0, 0)} ${pt(GRID_W, 0, 0)} ${pt(GRID_W, GRID_H, 0)} ${pt(0, GRID_H, 0)}" fill="url(#k-floor-p)" style="stroke:none"/>`
  return { ground: walls + ends + slab + ground, drawables }
}

export type SeatChair = { key: string; item: Placed; depth: number; svg: (isOut: boolean) => string; box: (isOut: boolean) => Box2 }

const TUCK = 0.14

function tuckOf(facing: Facing, mirror: boolean): [number, number] {
  if (facing === 'front') return mirror ? [TUCK, 0] : [0, TUCK]
  return mirror ? [-TUCK, 0] : [0, -TUCK]
}

export function seatChairs(): SeatChair[] {
  return SEATS.flatMap(seat => {
    const item = seat.chair
    const sprite = item !== undefined ? KIT[item.sprite] : undefined
    if (item === undefined || sprite?.kind !== 'floor') return []
    const [tx, ty] = tuckOf(seat.facing, seat.mirror)
    const [sx, sy] = P(tx, ty)
    const base = floorBox(item, sprite)
    return [
      {
        key: seat.key,
        item,
        depth: floorDepth(item, sprite),
        svg: (isOut: boolean) => useAt(item.sprite, item.x + (isOut ? 0 : tx), item.y + (isOut ? 0 : ty), item.z ?? 0, item.mirror === true),
        box: (isOut: boolean) => (isOut ? base : { ...base, x: base.x + sx, y: base.y + sy }),
      },
    ]
  })
}

const SEAT_CHAIRS: ReadonlySet<Placed> = new Set(SEATS.flatMap(seat => (seat.chair !== undefined ? [seat.chair] : [])))

export function isSeatChair(item: Placed): boolean {
  return SEAT_CHAIRS.has(item)
}

const SCREEN_FIT: Readonly<Record<'monitor' | 'imac', string>> = {
  monitor: ' translate(-0.7,-0.18) scale(1.13,.786)',
  imac: ' translate(-0.52,-0.12) scale(1.015,.75)',
}

export function screenTransform(desk: Desk): string {
  const { x, y } = desk.desk
  return desk.screen === 'imac' ? faceY(x + 0.1, y + 0.25, 38) + SCREEN_FIT.imac : faceY(x + 0.06, y + 0.25, 35) + SCREEN_FIT.monitor
}

export function deskOverlay(desk: Desk, kind: string, thinking: boolean, blueprint: boolean): Drawable | undefined {
  const { x, y } = desk.desk
  let svg = ''
  if (desk.screen !== 'none') {
    svg += `<use href="#sc-${kind}" transform="${screenTransform(desk)}"/>`
    if (thinking) svg += `<rect x="1.5" y="1.5" width="13.8" height="14" fill="#000" fill-opacity=".35" transform="${screenTransform(desk)}"/>`
  }
  if (blueprint) {
    svg += desk.facing === 'back' ? box(x + 0.5, y + 0.7, x + 0.94, y + 0.94, 15, 15.6, 'bp') + box(x + 0.12, y + 0.78, x + 0.46, y + 0.86, 15, 17, 'bp') : box(x + 0.5, y + 0.08, x + 0.94, y + 0.3, 15, 15.6, 'bp')
  }
  return svg ? { depth: x + y + 0.205, svg } : undefined
}

export function seatedAt(agent: OfficeAgent, desk: Desk): boolean {
  return agent.goal === 'desk' && agent.path.length === 0 && isSame(agent.pos, desk.seat)
}

export function idleScreen(desk: Desk): string {
  return desk.screen === 'imac' ? 'photo' : 'off'
}

export function deskBox(desk: Desk): Box2 {
  const { x, y } = desk.desk
  return spanBox(
    [
      [x, y],
      [x + 1, y],
      [x + 1, y + 1],
      [x, y + 1],
    ],
    44,
  )
}

export function idleScreens(): Drawable[] {
  return [...DESKS, BOSS_DESK].flatMap(desk => {
    const overlay = deskOverlay(desk, idleScreen(desk), false, false)
    return overlay === undefined ? [] : [overlay]
  })
}

type BubbleKind = 'say' | 'ask' | 'fail' | 'done' | 'stop'

export type Figure = {
  key: string
  role: Role
  outfit: Outfit
  label: string
  model: string
  status: AnyStatus
  pose: PoseId
  facing: Facing
  mirror: boolean
  anchor: [number, number]
  floorDy: number
  world: [number, number]
  depth: number
  skin: string
  hair: number
  hairColor: string
  beard: boolean
  bubble?: { text: string; kind: BubbleKind }
  icon: Icon
  title: string
  completed: number
  goal: string
  tile: string
  seed: number
}

function seatPoint(tile: OfficeTile, facing: Facing): [number, number] {
  return [tile.x + 0.5, tile.y + (facing === 'back' ? 0.38 : 0.62)]
}

export function center(tile: OfficeTile): [number, number] {
  return [tile.x + 0.5, tile.y + 0.5]
}

export function walkingFacing(dx: number, dy: number): { facing: Facing; mirror: boolean } {
  if (dx > 0) return { facing: 'front', mirror: true }
  if (dy > 0) return { facing: 'front', mirror: false }
  if (dx < 0) return { facing: 'back', mirror: true }
  return { facing: 'back', mirror: false }
}

function workingPose(act: OfficeActKind, role: Role): PoseId {
  if (act === 'sim') return 'phone'
  if (role.prop === 'tablet' && act !== 'code' && act !== 'bash') return 'tablet'
  if (act === 'read') return 'read'
  if (act === 'code') return 'typeFast'
  if (act === 'web') return 'browse'
  return 'type'
}

function seatedPose(agent: OfficeAgent, role: Role): PoseId {
  if (agent.status === 'working') return workingPose(agent.act, role)
  if (agent.status === 'thinking') return 'think'
  if (agent.status === 'decision' || agent.status === 'blocked') return 'raise'
  if (agent.status === 'failed') return 'fail'
  return 'type'
}

const SOFA_X = [0.62, 0.5, 0.38] as const
const SOFA_DEPTH = 1.25

export function sofaPoint(tile: OfficeTile, spot: number): [number, number] {
  return [tile.x + (SOFA_X[spot] ?? 0.5) + 0.15, tile.y + 0.65]
}

function kitchenPoint(tile: OfficeTile): [number, number] {
  return [tile.x + 0.5, tile.y + 0.42]
}

function seatAnchor(world: [number, number], facing: Facing, pose: PoseId): { anchor: [number, number]; floorDy: number } {
  const meta = POSES[pose]
  if (!meta.seated || pose === 'sofa') return { anchor: P(world[0], world[1], 0), floorDy: 0 }
  const z = facing === 'back' ? SEAT_Z : SEAT_Z - 4
  return { anchor: P(world[0], world[1], z), floorDy: z }
}

export function looksOf(id: string, role?: Role): { skin: string; hair: number; hairColor: string; seed: number; beard: boolean } {
  const hash = hashOf(id)
  const fixed = role?.looks
  return {
    skin: SKINS[fixed?.skin ?? hash % SKINS.length] ?? '#f3cba5',
    hair: fixed?.hair ?? (hash >>> 5) % HAIR_COUNT,
    hairColor: HAIR_COLORS[fixed?.hairColor ?? (hash >>> 9) % HAIR_COLORS.length] ?? '#4a3121',
    seed: hash % 997,
    beard: fixed?.beard === true,
  }
}

function agentTitle(agent: OfficeAgent, statusWord: string): string {
  return [
    `${nameOf(agent)}${agent.model ? ` · ${agent.model}` : ''} · ≈${formatCost(agent.cost)}`,
    `status: ${statusWord}`,
    `now: ${agent.activity}`,
    `task: ${agent.description}`,
  ].join('\n')
}

export function agentFigure(id: string, agent: OfficeAgent, input: FigureInput): Figure {
  const role = roleOf(agent.type)
  const looks = looksOf(id, role)
  const outfit = outfitOf(role, id, hashOf(`${id}:outfit`))
  let pose: PoseId = 'stand'
  let facing: Facing = 'front'
  let mirror = false
  let world: [number, number] = center(agent.pos)
  let depth = agent.pos.x + agent.pos.y + 0.5
  let isSeatedWorker = false
  if (agent.goal === 'board') {
    pose = 'study'
    facing = 'back'
    mirror = true
  } else if (agent.goal === 'desk') {
    const desk = deskOf(agent)
    const meeting = agent.desk < 0 ? MEETING_SEATS.find(seat => isSame(seat.tile, agent.pos)) : undefined
    if (desk !== undefined && isSame(agent.pos, desk.seat)) {
      if (agent.status === 'done' && agent.restUntil > 0 && isStaff(agent.type)) {
        facing = desk.facing
        world = seatPoint(desk.seat, desk.facing)
        pose = 'bossCup'
      } else if (agent.status === 'done') {
        pose = 'happy'
        world = seatPoint(desk.seat, desk.facing)
      } else {
        facing = desk.facing
        world = seatPoint(desk.seat, desk.facing)
        pose = seatedPose(agent, role)
        isSeatedWorker = agent.status === 'working'
      }
    } else if (meeting !== undefined && isSame(agent.pos, meeting.tile) && agent.status !== 'done') {
      facing = meeting.facing
      mirror = meeting.mirror
      pose = agent.status === 'working' ? 'tablet' : seatedPose(agent, role)
      isSeatedWorker = agent.status === 'working'
    } else if (agent.desk < 0 && agent.status === 'working') {
      pose = 'laptop'
    } else if (agent.status === 'done') {
      pose = 'happy'
    } else {
      pose = agent.status === 'decision' || agent.status === 'blocked' ? 'standRaise' : 'stand'
    }
  } else if (agent.goal === 'door') {
    pose = 'stand'
  } else if (agent.goal === 'coffee') {
    const spot = KITCHEN[agent.spot]
    pose = 'cup'
    facing = spot?.facing ?? 'front'
    mirror = spot?.mirror ?? false
    world = kitchenPoint(agent.pos)
  } else if (agent.goal === 'lounge') {
    if (agent.spot < SOFA_SPOTS) {
      pose = 'sofa'
      world = sofaPoint(agent.pos, agent.spot)
      depth = agent.pos.x + agent.pos.y + SOFA_DEPTH
    } else {
      pose = agent.seq % 2 === 0 ? 'cup' : 'stand'
    }
  }
  const placed = seatAnchor(world, facing, pose)
  const statusWord = STATUS_WORD[agent.status]
  let bubble: Figure['bubble']
  if (agent.status === 'stopped') bubble = { text: '×', kind: 'stop' }
  else if (agent.goal === 'door') bubble = undefined
  else if (agent.status === 'thinking') bubble = { text: 'Думает…', kind: 'say' }
  else if (agent.status === 'working') bubble = { text: agent.activity, kind: 'say' }
  else if (agent.status === 'decision' || agent.status === 'blocked') bubble = { text: '?', kind: 'ask' }
  else if (agent.status === 'failed') bubble = { text: '!', kind: 'fail' }
  else if (agent.status === 'done' && agent.restUntil === 0) bubble = { text: 'Done', kind: 'done' }
  return {
    key: id,
    role,
    outfit,
    label: nameOf(agent),
    model: agent.model,
    status: agent.status,
    pose,
    facing,
    mirror,
    anchor: placed.anchor,
    floorDy: placed.floorDy,
    world,
    depth,
    skin: looks.skin,
    hair: looks.hair,
    hairColor: looks.hairColor,
    beard: looks.beard,
    ...(bubble !== undefined ? { bubble } : {}),
    icon: isSeatedWorker ? role.icon : 'none',
    title: agentTitle(agent, statusWord),
    completed: completedOfType(input.allAgents, agent.type),
    goal: agent.goal,
    tile: `${agent.pos.x},${agent.pos.y}`,
    seed: looks.seed,
  }
}

export function coordinatorFigure(input: FigureInput): Figure {
  const boss = input.coordinator
  const label = bossLabel(boss)
  const atDesk = isBossAtDesk(boss)
  let pose: PoseId = 'bossCup'
  let facing: Facing = 'back'
  let world: [number, number] = seatPoint(BOSS_DESK.seat, 'back')
  let depth = BOSS_DESK.seat.x + BOSS_DESK.seat.y + 0.5
  if (boss.goal === 'coffee' || !atDesk) {
    const spot = boss.goal === 'coffee' ? KITCHEN[boss.spot] : undefined
    pose = 'cup'
    facing = spot?.facing ?? 'front'
    world = spot !== undefined ? kitchenPoint(boss.pos) : center(boss.pos)
    depth = boss.pos.x + boss.pos.y + 0.5
  } else if (boss.status === 'asking') {
    pose = 'standRaise'
    facing = 'front'
  } else if (boss.status === 'working') {
    pose = workingPose(boss.act, COORDINATOR_ROLE)
  } else if (boss.status === 'thinking') {
    pose = 'think'
  } else if (boss.status === 'done') {
    pose = 'happy'
    facing = 'front'
  }
  const placed = seatAnchor(world, facing, pose)
  const title = [`${label}${boss.model ? ` · ${boss.model}` : ''} · ≈${formatCost(boss.cost)}`, `status: ${STATUS_WORD[boss.status]}`, `now: ${boss.activity || '—'}`].join('\n')
  const bubble: Figure['bubble'] =
    boss.status === 'asking'
      ? { text: '?', kind: 'ask' }
      : boss.status === 'done'
        ? { text: 'Done', kind: 'done' }
        : boss.status === 'thinking'
          ? { text: 'Думает…', kind: 'say' }
          : boss.status === 'working' && boss.activity
            ? { text: boss.activity, kind: 'say' }
            : undefined
  return {
    key: 'coordinator',
    role: COORDINATOR_ROLE,
    outfit: COORDINATOR_ROLE.outfit,
    label,
    model: boss.model,
    status: boss.status,
    pose,
    facing,
    mirror: false,
    anchor: placed.anchor,
    floorDy: placed.floorDy,
    world,
    depth,
    skin: SKINS[0],
    hair: 0,
    hairColor: HAIR_COLORS[1],
    beard: false,
    ...(bubble !== undefined ? { bubble } : {}),
    icon: 'none',
    title,
    completed: Math.max(0, boss.turns - boss.flagged - (boss.status === 'working' || boss.status === 'thinking' || boss.status === 'asking' ? 1 : 0)),
    goal: boss.goal === 'coffee' ? 'coffee' : 'office',
    tile: `${boss.pos.x},${boss.pos.y}`,
    seed: 11,
  }
}

export function spriteTop(figure: Figure): number {
  return -poseHeight(figure.pose, figure.facing)
}


function armsSvg(ids: readonly string[], dur: number, seed: number): string {
  const [first, second] = ids
  if (first === undefined) return ''
  if (second === undefined || dur <= 0) return `<use href="#A-${first}"/>`
  const timing = `dur="${dur}s" calcMode="discrete" ${loop(dur, seed)}`
  return (
    `<use href="#A-${first}"><animate attributeName="opacity" values="1;0" ${timing}/></use>` +
    `<use href="#A-${second}" opacity="0"><animate attributeName="opacity" values="0;1" ${timing}/></use>`
  )
}

export function avatarSvg(figure: Figure, arms?: string, legs?: string): string {
  const meta = POSES[figure.pose]
  const side = meta[figure.facing]
  const height = poseHeight(figure.pose, figure.facing)
  const head = figure.facing === 'front' ? 'f' : 'b'
  const headY = meta.headDy === 0 ? '' : ` y="${meta.headDy}"`
  const wear = wearId(figure.role.wear, figure.facing)
  const outfit = figure.outfit
  const vars = `--a:${outfit.accent};--b:${outfit.second};--p:${outfit.pants};--f:${outfit.shoes};--h:${figure.hairColor}`
  return (
    `<g transform="${figure.mirror ? 'scale(-1,1) ' : ''}translate(-${AVATAR_CX},-${height})" fill="${figure.skin}" color="${outfit.main}" style="${vars}">` +
    `<use href="#L-${legs ?? side.legs}"/><use href="#T-${outfit.family}-${head}"/>` +
    (arms !== undefined ? `<use href="#A-${arms}"/>` : armsSvg(side.arms, meta.frameDur, figure.seed)) +
    `<use href="#h${head}"${headY}/>` +
    (head === 'f' && arms === undefined ? `<use href="#blink"${headY}/>` : '') +
    `<use href="#h${figure.hair}${head}"${headY}/>` +
    (figure.beard && head === 'f' ? `<use href="#w-beardf"${headY}/>` : '') +
    (wear ? `<use href="#${wear}"${headY}/>` : '') +
    (side.top !== undefined ? `<use href="#A-${side.top}"/>` : '') +
    (meta.carry && figure.role.prop !== 'none' ? `<use href="#c-${figure.role.prop}"/>` : '') +
    `</g>`
  )
}

function avatarFrame(figure: Figure, frame: number, legs?: string, arms?: string): string {
  const side = POSES[figure.pose][figure.facing]
  const chosen = arms ?? side.arms[frame % Math.max(1, side.arms.length)] ?? 'down'
  return avatarSvg(figure, chosen, legs)
}

export type Box2 = { x: number; y: number; w: number; h: number }

export function screenKind(agent: OfficeAgent, role: Role): string {
  if (agent.status === 'decision' || agent.status === 'blocked') return 'ask'
  if (agent.status === 'failed') return 'err'
  if (agent.status === 'done') return 'ok'
  if (role.icon === 'chart') return 'chart'
  if (agent.act === 'sim') return 'sim'
  if (agent.act === 'web') return 'web'
  if (role.prop === 'blueprint' && agent.act !== 'bash') return 'plan'
  if (role.label === 'Ревьюер' && (agent.act === 'code' || agent.act === 'read')) return 'diff'
  if (role.wear === 'hardhat') return 'git'
  if (role.prop === 'envelope') return 'mail'
  if (agent.act === 'bash') return 'term'
  if (agent.act === 'read') return 'read'
  return 'code'
}

export function touches(a: Box2, b: Box2): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

export function doorSwingSvg(openness: number): string {
  const share = Math.max(0, Math.min(1, openness))
  const angle = (share * Math.PI) / 2
  const length = 0.86 - 0.24 * share
  const endX = -length * Math.sin(angle)
  const endY = 0.07 + length * Math.cos(angle)
  const doorway = face([P(0, 0.07, 0), P(0, 0.93, 0), P(0, 0.93, 60), P(0, 0.07, 60)], 'bk3')
  const leaf = face([P(0, 0.07, 0), P(endX, endY, 0), P(endX, endY, 60), P(0, 0.07, 60)], share > 0.5 ? 'wd1' : 'wd2')
  const [hx, hy] = P(endX * 0.85, 0.07 + (endY - 0.07) * 0.85, 30)
  return doorway + leaf + rect(hx - 1, hy - 0.5, 2, 1.2, '#d6dae0') + doorFrame()
}

export type AvatarLook = Pick<Figure, 'role' | 'outfit' | 'skin' | 'hair' | 'hairColor' | 'beard' | 'seed'>

export function lookOf(id: string, type: string): AvatarLook {
  if (type === 'coordinator') {
    return { role: COORDINATOR_ROLE, outfit: COORDINATOR_ROLE.outfit, skin: SKINS[0] ?? '#f3cba5', hair: 0, hairColor: HAIR_COLORS[1] ?? '#4a3121', beard: false, seed: 11 }
  }
  const role = roleOf(type)
  const looks = looksOf(id, role)
  return { role, outfit: outfitOf(role, id, hashOf(`${id}:outfit`)), skin: looks.skin, hair: looks.hair, hairColor: looks.hairColor, beard: looks.beard, seed: looks.seed }
}

export function avatarPose(look: AvatarLook, pose: PoseId, facing: Facing, frame: number, legs?: string, arms?: string): string {
  const figure = { ...look, pose, facing, mirror: false } as Figure
  return avatarFrame(figure, frame, legs, arms)
}
