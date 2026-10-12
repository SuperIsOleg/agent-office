import { OX, OY, ROOM_H, ROOM_W, deskBox, seatChairs } from '../../hooks/art'
import type { Box2 } from '../../hooks/art'
import { P } from '../../hooks/iso'
import { BOSS_DESK, COFFEE_SPOTS, LAPTOP_SPOTS, LOUNGE_SPOTS, MEETING_SEATS, OVERFLOW_SPOTS, PORCH, STUDY_SPOTS, queueTile } from '../../hooks/layout'
import { buildSnapshot } from '../../hooks/snapshot'
import type { SnapPerson } from '../../hooks/snapshot'
import { DESKS, DOOR, GRID_W, IDLE_COORDINATOR, REST_MS, exitPath, findPath, spawnAgent } from '../../hooks/world'
import type { OfficeAgent, OfficeCoordinator, OfficeTile } from '../../types'
import { drawFrame } from './draw'
import { figureRect } from './pose'
import { drawLabels } from './labels'
import type { Rect } from './labels'
import { stepPeople, syncPeople } from './people'
import type { Shown } from './people'
import { isAtDoor, isSeated, propsOf } from './props'
import { pendingCount } from './raster'
import { roomPieces, roomRaster } from './room'

const SCALE = 2
const NOW = new Date(2026, 9, 8, 12, 0, 0).getTime()
const DT = 1000 / 60
const STEP_MS = 500
const FRAMES_PER_STEP = 30
const CROP = { w: 96, h: 104 }

type Spot = {
  name: string
  id: string
  tile: OfficeTile
  start: OfficeTile
  into: OfficeTile[]
  seat?: string
  props: Box2[]
  allow: Box2[]
  person: (pos: OfficeTile, path: OfficeTile[]) => SnapPerson
  wantsSeat: boolean
  wantsScreen: boolean
}

export type SpotResult = {
  name: string
  seatedAt: number
  outside: number
  after: number
  leaks: number
  seated: boolean
  screen: boolean
  wantsSeat: boolean
  wantsScreen: boolean
}

const canvas = document.createElement('canvas')
canvas.width = ROOM_W * SCALE
canvas.height = ROOM_H * SCALE
const context = canvas.getContext('2d', { willReadFrequently: true })
const pieces = roomPieces()
const chairs = seatChairs()

function agentOf(id: string, type: string): OfficeAgent {
  const made = spawnAgent({}, {}, id, { type, description: 'check the props', model: 'claude-sonnet-4-6', background: true, brief: 'x' }, NOW - 60_000).agents[id]
  if (made === undefined) throw new Error('no agent')
  return made
}

function personOf(agent: OfficeAgent, id: string): SnapPerson {
  const snapshot = buildSnapshot({ version: 1, now: NOW, startedAt: NOW - 60_000, agents: { [id]: agent }, coordinator: IDLE_COORDINATOR, events: [] })
  const person = snapshot.people[0]
  if (person === undefined) throw new Error('no person')
  return person
}

function agentSpot(id: string, type: string, change: Partial<OfficeAgent>): (pos: OfficeTile, path: OfficeTile[]) => SnapPerson {
  const base = { ...agentOf(id, type), ...change }
  return (pos, path) => personOf({ ...base, pos, from: pos, path, movedAt: NOW - 10_000 }, id)
}

function bossSpot(pos: OfficeTile, path: OfficeTile[]): SnapPerson {
  const boss: OfficeCoordinator = { ...IDLE_COORDINATOR, hasEntered: true, isLead: true, status: 'working', act: 'code', activity: 'Правит HomeModel.swift', pos, from: pos, path, goal: 'desk', lastAt: NOW, statusAt: NOW }
  return buildSnapshot({ version: 1, now: NOW, startedAt: NOW - 60_000, agents: {}, coordinator: boss, events: [] }).boss
}

function leaverOf(spot: Spot): (pos: OfficeTile, path: OfficeTile[]) => SnapPerson {
  const make = agentSpot('leaver', 'general-purpose', { goal: 'door', exit: 'done', status: 'done', activity: 'completed' })
  return (pos, path) => ({ ...make(pos, path), id: spot.id })
}

function chairBoxes(key: string): Box2[] {
  const chair = chairs.find(one => one.key === key)
  return chair === undefined ? [] : [chair.box(false), chair.box(true)]
}

function doorBox(): Box2 {
  const [hx, hy] = P(GRID_W, DOOR.y)
  return { x: hx - 24, y: hy - 70, w: 40, h: 90 }
}

function spots(): Spot[] {
  const list: Spot[] = []
  const walkIn = (tile: OfficeTile) => findPath(DOOR, tile)
  DESKS.forEach((desk, index) => {
    const seat = `desk:${index}`
    list.push({
      name: `desk ${index} · ${desk.facing} · ${desk.screen}`,
      id: `d${index}`,
      tile: desk.seat,
      start: DOOR,
      into: walkIn(desk.seat),
      seat,
      props: [...chairBoxes(seat), deskBox(desk)],
      allow: [],
      person: agentSpot(`d${index}`, 'ios-team:ios-engineer', { desk: index, goal: 'desk', status: 'working', act: 'code', activity: 'Правит HomeModel.swift' }),
      wantsSeat: true,
      wantsScreen: true,
    })
  })
  list.push({ name: 'coordinator desk', id: 'coordinator', tile: BOSS_DESK.seat, start: DOOR, into: walkIn(BOSS_DESK.seat), seat: 'boss', props: [...chairBoxes('boss'), deskBox(BOSS_DESK)], allow: [], person: bossSpot, wantsSeat: true, wantsScreen: true })
  MEETING_SEATS.forEach((meeting, index) => {
    const seat = `meet:${index}`
    list.push({
      name: `meeting chair ${index}`,
      id: `m${index}`,
      tile: meeting.tile,
      start: DOOR,
      into: walkIn(meeting.tile),
      seat,
      props: chairBoxes(seat),
      allow: [],
      person: agentSpot(`m${index}`, 'general-purpose', { desk: -1, spot: index === 0 ? 0 : OVERFLOW_SPOTS.length - 1, goal: 'desk', status: 'working', act: 'read', activity: 'Читает задачу' }),
      wantsSeat: true,
      wantsScreen: false,
    })
  })
  LOUNGE_SPOTS.forEach((tile, index) =>
    list.push({
      name: `sofa ${index}`,
      id: `s${index}`,
      tile,
      start: DOOR,
      into: walkIn(tile),
      seat: `sofa:${index}`,
      props: [],
      allow: [],
      person: agentSpot(`s${index}`, 'ios-team:reviewer', { goal: 'lounge', spot: index, status: 'done', restUntil: NOW + REST_MS, activity: 'completed' }),
      wantsSeat: true,
      wantsScreen: false,
    }),
  )
  COFFEE_SPOTS.forEach((tile, index) =>
    list.push({
      name: `kitchen ${index}`,
      id: `c${index}`,
      tile,
      start: DOOR,
      into: walkIn(tile),
      props: [],
      allow: [],
      person: agentSpot(`c${index}`, 'ios-team:qa-tester', { goal: 'coffee', spot: index, status: 'decision', activity: 'Проверять на iPad?' }),
      wantsSeat: false,
      wantsScreen: false,
    }),
  )
  STUDY_SPOTS.forEach((tile, index) =>
    list.push({
      name: `flip chart ${index}`,
      id: `f${index}`,
      tile,
      start: DOOR,
      into: walkIn(tile),
      props: [],
      allow: [],
      person: agentSpot(`f${index}`, 'Explore', { goal: 'board', spot: index, status: 'working', act: 'read', activity: 'Ищет "Router" в Modules' }),
      wantsSeat: false,
      wantsScreen: false,
    }),
  )
  LAPTOP_SPOTS.forEach((tile, index) =>
    list.push({
      name: `laptop spot ${index}`,
      id: `l${index}`,
      tile,
      start: DOOR,
      into: walkIn(tile),
      props: [],
      allow: [],
      person: agentSpot(`l${index}`, 'general-purpose', { desk: -1, spot: index + 1, goal: 'desk', status: 'working', act: 'code', activity: 'Создаёт notes.md' }),
      wantsSeat: false,
      wantsScreen: false,
    }),
  )
  list.push({
    name: 'door',
    id: 'door',
    tile: DOOR,
    start: queueTile(1),
    into: [PORCH, DOOR],
    props: [],
    allow: [doorBox()],
    person: agentSpot('door', 'general-purpose', { desk: -1, goal: 'desk', status: 'thinking', activity: 'Думает…' }),
    wantsSeat: false,
    wantsScreen: false,
  })
  return list
}

function toCanvas(box: Box2, pad = 0): Rect {
  return { x: (OX + box.x - pad) * SCALE, y: (OY + box.y - pad) * SCALE, w: (box.w + pad * 2) * SCALE, h: (box.h + pad * 2) * SCALE }
}

function idle(): Promise<void> {
  return new Promise(done => setTimeout(done, 20))
}

type Shot = { data: Uint8ClampedArray; masks: Rect[] }

let room: HTMLCanvasElement | undefined

function paint(people: Map<string, Shown>, door: { openness: number }): Rect[] {
  if (context === null) return []
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, canvas.width, canvas.height)
  drawFrame({ context, scale: SCALE, now: NOW, people, pieces, door }, room)
  const labels = drawLabels(context, people, SCALE, NOW, 1000).map(rect => ({ x: rect.x - 6 * SCALE, y: rect.y - 6 * SCALE, w: rect.w + 12 * SCALE, h: rect.h + 12 * SCALE }))
  const figures = [...people.values()].map(shown => {
    const box = figureRect(shown, NOW)
    return { x: box.x * SCALE - 2, y: box.y * SCALE - 2, w: box.w * SCALE + 4, h: box.h * SCALE + 4 }
  })
  return [...labels, ...figures]
}

async function shot(people: Map<string, Shown>, door: { openness: number }): Promise<Shot> {
  for (let tries = 0; tries < 400; tries += 1) {
    const masks = paint(people, door)
    if (pendingCount() === 0 && context !== null) return { data: context.getImageData(0, 0, canvas.width, canvas.height).data, masks }
    while (pendingCount() > 0) await idle()
  }
  throw new Error('rasters never finished')
}

function within(rects: readonly Rect[], x: number, y: number): boolean {
  return rects.some(rect => x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h)
}

function differs(a: Uint8ClampedArray, b: Uint8ClampedArray, index: number): boolean {
  return a[index] !== b[index] || a[index + 1] !== b[index + 1] || a[index + 2] !== b[index + 2] || a[index + 3] !== b[index + 3]
}

function count(a: Shot, b: Shot, keep: (x: number, y: number) => boolean): number {
  let found = 0
  for (let y = 0; y < canvas.height; y += 1)
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4
      if (differs(a.data, b.data, index) && keep(x, y)) found += 1
    }
  return found
}

function step(people: Map<string, Shown>, door: { openness: number }): void {
  stepPeople(people, DT, STEP_MS)
  door.openness += ((isAtDoor(people) ? 1 : 0) - door.openness) * Math.min(1, DT / 120)
}

async function leakOf(spot: Spot, people: Map<string, Shown>, door: { openness: number }, empty: Shot): Promise<number> {
  const props = spot.props.map(box => toCanvas(box, 1))
  if (props.length === 0) return 0
  const frame = await shot(people, door)
  return count(empty, frame, (x, y) => within(props, x, y) && !within(frame.masks, x, y))
}

function isWatched(spot: Spot, people: Map<string, Shown>): boolean {
  const shown = people.get(spot.id)
  return shown !== undefined && !isSeated(shown)
}

async function run(spot: Spot): Promise<{ result: SpotResult; frames: [Shot, Shot, Shot] }> {
  const people = new Map<string, Shown>()
  const door = { openness: 0 }
  const empty = await shot(people, door)
  const route = [spot.start, ...spot.into]
  let index = 0
  let frame = 0
  let leaks = 0
  let seatedAt = -1
  syncPeople(people, [spot.person(spot.start, spot.into)], 0)
  while (frame < 6000) {
    frame += 1
    step(people, door)
    if (frame % FRAMES_PER_STEP === 0 && index < route.length - 1) {
      index += 1
      syncPeople(people, [spot.person(route[index] ?? spot.tile, route.slice(index + 1))], frame * DT)
    }
    const shown = people.get(spot.id)
    if (shown !== undefined && isSeated(shown) && index === route.length - 1) {
      seatedAt = frame
      break
    }
    if (frame % 6 === 0 && isWatched(spot, people)) leaks = Math.max(leaks, await leakOf(spot, people, door, empty))
  }
  for (let settle = 0; settle < 40; settle += 1) step(people, door)
  const props = propsOf(people)
  const occupied = await shot(people, door)
  const allowed = [...occupied.masks, ...[...spot.props, ...spot.allow].map(box => toCanvas(box, 1))]
  const outside = count(empty, occupied, (x, y) => !within(allowed, x, y))
  const leaver = leaverOf(spot)
  const away = spot.name === 'door' ? [DOOR, ...exitPath(DOOR)] : [spot.tile, ...exitPath(spot.tile)]
  index = 0
  syncPeople(people, [leaver(away[0] ?? spot.tile, away.slice(1))], frame * DT)
  let gone = false
  for (let tick = 0; tick < 8000 && (people.size > 0 || Math.round(door.openness * 4) > 0); tick += 1) {
    frame += 1
    step(people, door)
    if (frame % FRAMES_PER_STEP === 0 && index < away.length - 1) {
      index += 1
      syncPeople(people, [leaver(away[index] ?? spot.tile, away.slice(index + 1))], frame * DT)
    }
    const shown = people.get(spot.id)
    if (!gone && shown !== undefined && index === away.length - 1 && isSeated(shown)) {
      gone = true
      syncPeople(people, [], frame * DT)
    }
    if (frame % 6 === 0 && isWatched(spot, people)) leaks = Math.max(leaks, await leakOf(spot, people, door, empty))
  }
  const after = await shot(people, door)
  const result: SpotResult = {
    name: spot.name,
    seatedAt,
    outside,
    after: count(empty, after, () => true),
    leaks,
    seated: spot.seat !== undefined && props.chairs.has(spot.seat),
    screen: props.screens.length > 0,
    wantsSeat: spot.wantsSeat,
    wantsScreen: spot.wantsScreen,
  }
  return { result, frames: [empty, occupied, after] }
}

function focusOf(spot: Spot): [number, number] {
  const [px, py] = P(spot.tile.x + 0.5, spot.tile.y + 0.5)
  const boxes = [{ x: px - 20, y: py - 62, w: 40, h: 68 }, ...spot.props, ...spot.allow]
  const x0 = Math.min(...boxes.map(box => box.x))
  const y0 = Math.min(...boxes.map(box => box.y))
  const x1 = Math.max(...boxes.map(box => box.x + box.w))
  const y1 = Math.max(...boxes.map(box => box.y + box.h))
  return [(x0 + x1) / 2, (y0 + y1) / 2]
}

function crop(target: CanvasRenderingContext2D, data: Uint8ClampedArray, spot: Spot, dx: number, dy: number): void {
  const [cx, cy] = focusOf(spot)
  const x0 = Math.round((OX + cx - CROP.w / 2) * SCALE)
  const y0 = Math.round((OY + cy - CROP.h / 2) * SCALE)
  const w = CROP.w * SCALE
  const h = CROP.h * SCALE
  const image = target.createImageData(w, h)
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const sx = x0 + x
      const sy = y0 + y
      if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) continue
      const from = (sy * canvas.width + sx) * 4
      const to = (y * w + x) * 4
      image.data[to] = data[from] ?? 0
      image.data[to + 1] = data[from + 1] ?? 0
      image.data[to + 2] = data[from + 2] ?? 0
      image.data[to + 3] = data[from + 3] ?? 0
    }
  target.putImageData(image, dx, dy)
}

function isOk(result: SpotResult): boolean {
  return result.seatedAt > 0 && result.outside === 0 && result.after === 0 && result.leaks === 0 && result.seated === result.wantsSeat && result.screen === result.wantsScreen
}

async function main(): Promise<void> {
  room = await roomRaster(NOW, SCALE)
  const list = spots()
  const sheet = document.querySelector('canvas')
  const perRow = 3
  const cellW = CROP.w * SCALE
  const cellH = CROP.h * SCALE
  const gap = 10
  const head = 26
  const rows = Math.ceil(list.length / perRow)
  if (sheet !== null) {
    sheet.width = perRow * (cellW * 3 + gap * 4) + gap
    sheet.height = rows * (cellH + head + gap) + 40
  }
  const draw = sheet?.getContext('2d') ?? null
  if (draw !== null && sheet !== null) {
    draw.fillStyle = '#151824'
    draw.fillRect(0, 0, sheet.width, sheet.height)
    draw.fillStyle = '#f4f1ea'
    draw.font = 'bold 15px Verdana, sans-serif'
    draw.fillText('Every interaction spot: empty · occupied · after leaving (after must equal empty)', gap, 24)
  }
  const results: SpotResult[] = []
  for (const [order, spot] of list.entries()) {
    const { result, frames } = await run(spot)
    results.push(result)
    if (draw === null) continue
    const column = order % perRow
    const row = Math.floor(order / perRow)
    const x = gap + column * (cellW * 3 + gap * 4)
    const y = 40 + row * (cellH + head + gap)
    draw.fillStyle = isOk(result) ? '#7fe0c0' : '#ff8a80'
    draw.font = '12px Verdana, sans-serif'
    draw.fillText(`${spot.name}${isOk(result) ? '' : ` · outside ${result.outside} · after ${result.after} · leaks ${result.leaks}`}`, x, y + 16)
    frames.forEach((one, index) => crop(draw, one.data, spot, x + index * (cellW + gap), y + head))
  }
  const ok = results.every(isOk)
  Object.assign(window, { officeProps: { ok, results } })
  document.title = ok ? 'props ok' : 'props failed'
}

void main().catch(error => {
  Object.assign(window, { officeProps: { ok: false, error: String(error), results: [] } })
  document.title = 'props failed'
})
