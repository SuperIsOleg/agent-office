import { lookOf, walkingFacing } from '../../hooks/art'
import type { AvatarLook } from '../../hooks/art'
import type { SnapPerson } from '../../hooks/snapshot'
import type { Facing } from '../../hooks/world'

export type Point = [number, number]

export type Shown = {
  id: string
  snap: SnapPerson
  look: AvatarLook
  x: number
  y: number
  z: number
  queue: Point[]
  ahead?: Point
  isWalking: boolean
  stillFor: number
  stride: number
  facing: Facing
  mirror: boolean
  fade: number
  removedAt?: number
  bornAt: number
  label?: { x: number; y: number }
}

const TELEPORT = 6
const AHEAD = 0.3
const LINK = 1.5
const SPACING = 0.6

function center([x, y]: readonly [number, number]): Point {
  return [x + 0.5, y + 0.5]
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function routeOf(snap: SnapPerson): Point[] {
  const tiles = [snap.tile, ...snap.path]
  return tiles.map((tile, index) => (index === tiles.length - 1 ? [snap.rest.world[0], snap.rest.world[1]] : center(tile)))
}

function aheadOf(route: readonly Point[]): Point | undefined {
  const [here, next] = route
  if (here === undefined || next === undefined) return undefined
  return [here[0] + (next[0] - here[0]) * AHEAD, here[1] + (next[1] - here[1]) * AHEAD]
}

function setAhead(shown: Shown, route: readonly Point[]): void {
  const ahead = aheadOf(route)
  if (ahead !== undefined) shown.ahead = ahead
  else delete shown.ahead
}

function merge(shown: Shown, route: readonly Point[]): void {
  const head = route[0]
  if (head === undefined) {
    shown.queue = []
    delete shown.ahead
    return
  }
  const index = shown.queue.findIndex(point => distance(point, head) < 0.01)
  if (index >= 0) shown.queue = shown.queue.slice(0, index + 1)
  else {
    const tail = shown.queue[shown.queue.length - 1] ?? [shown.x, shown.y]
    shown.queue = distance(tail, head) <= LINK ? [...shown.queue, head] : [head]
  }
  setAhead(shown, route)
}

export function isArrived(shown: Shown): boolean {
  const rest = shown.snap.rest
  return shown.snap.path.length === 0 && shown.queue.length === 0 && shown.ahead === undefined && Math.abs(shown.x - rest.world[0]) < 1e-6 && Math.abs(shown.y - rest.world[1]) < 1e-6
}

export function syncPeople(people: Map<string, Shown>, snaps: readonly SnapPerson[], now: number): void {
  const seen = new Set<string>()
  for (const snap of snaps) {
    seen.add(snap.id)
    const route = routeOf(snap)
    const start = route[0] ?? center(snap.tile)
    const known = people.get(snap.id)
    if (known === undefined || known.removedAt !== undefined) {
      const fresh: Shown = {
        id: snap.id,
        snap,
        look: lookOf(snap.id, snap.type),
        x: start[0],
        y: start[1],
        z: route.length > 1 ? 0 : snap.rest.z,
        queue: [],
        isWalking: route.length > 1,
        stillFor: 0,
        stride: 0,
        facing: snap.rest.facing,
        mirror: snap.rest.mirror,
        fade: known?.fade ?? 0,
        bornAt: now,
      }
      setAhead(fresh, route)
      people.set(snap.id, fresh)
      continue
    }
    known.snap = snap
    if (distance(start, [known.x, known.y]) > TELEPORT) {
      known.x = start[0]
      known.y = start[1]
      known.queue = []
      setAhead(known, route)
      continue
    }
    merge(known, route)
  }
  for (const [id, shown] of people) if (!seen.has(id) && shown.removedAt === undefined) shown.removedAt = now
}

function isAhead(from: Shown, other: Shown): boolean {
  const target = from.queue[0] ?? from.ahead
  if (target === undefined) return false
  return (target[0] - from.x) * (other.x - from.x) + (target[1] - from.y) * (other.y - from.y) > 0
}

function isCrowded(shown: Shown, people: Map<string, Shown>): boolean {
  for (const other of people.values()) {
    if (other === shown || other.removedAt !== undefined || !other.isWalking) continue
    if (distance([shown.x, shown.y], [other.x, other.y]) >= SPACING || !isAhead(shown, other)) continue
    if (!isAhead(other, shown) || shown.id > other.id) return true
  }
  return false
}

function walk(shown: Shown, dt: number, stepMs: number): number {
  const lead = shown.queue[0] ?? shown.ahead
  const lag = lead !== undefined ? distance([shown.x, shown.y], lead) + Math.max(0, shown.queue.length - 1) : 0
  const speed = (1 / stepMs) * (1 + Math.min(3, Math.max(0, lag - 0.5) * 2))
  let budget = speed * dt
  let moved = 0
  let dx = 0
  let dy = 0
  while (budget > 0) {
    const isQueued = shown.queue[0] !== undefined
    const target = shown.queue[0] ?? shown.ahead
    if (target === undefined) break
    const gap = distance([shown.x, shown.y], target)
    if (gap > 0.0001) {
      dx = target[0] - shown.x
      dy = target[1] - shown.y
    }
    if (gap <= budget) {
      shown.x = target[0]
      shown.y = target[1]
      budget -= gap
      moved += gap
      if (isQueued) shown.queue.shift()
      else delete shown.ahead
    } else {
      shown.x += ((target[0] - shown.x) / gap) * budget
      shown.y += ((target[1] - shown.y) / gap) * budget
      moved += budget
      budget = 0
    }
  }
  if (moved > 0) {
    const turn = walkingFacing(Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0, Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0)
    shown.facing = turn.facing
    shown.mirror = turn.mirror
    shown.stride += moved
  }
  return moved
}

export function stepPeople(people: Map<string, Shown>, dt: number, stepMs: number): void {
  for (const [id, shown] of people) {
    if (shown.removedAt !== undefined) {
      shown.fade = Math.max(0, shown.fade - dt / 300)
      if (shown.fade <= 0) people.delete(id)
      continue
    }
    shown.fade = Math.min(1, shown.fade + dt / 250)
    const moved = isCrowded(shown, people) ? 0 : walk(shown, dt, stepMs)
    const rest = shown.snap.rest
    if (isArrived(shown)) {
      shown.isWalking = false
      shown.stillFor = 0
      shown.z += (rest.z - shown.z) * Math.min(1, dt / 140)
      if (Math.abs(rest.z - shown.z) < 0.05) shown.z = rest.z
      shown.facing = rest.facing
      shown.mirror = rest.mirror
      continue
    }
    shown.isWalking = true
    shown.z = Math.max(0, shown.z - dt / 40)
    shown.stillFor = moved > 0 ? 0 : shown.stillFor + dt
  }
}
