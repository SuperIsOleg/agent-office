import type {
  OfficeActKind,
  OfficeAgent,
  OfficeAsk,
  OfficeNote,
  OfficeNoteKind,
  OfficeCoordinator,
  OfficeEvent,
  OfficeEventTone,
  OfficeExit,
  OfficeGoal,
  OfficeRunState,
  OfficeStatus,
  OfficeTile,
  OfficeTokens,
} from '../types'

import {
  BLOCKED,
  BLOCKED_EDGES,
  BOSS_DESK,
  COFFEE_SPOTS,
  DESKS,
  DOOR,
  EXIT,
  GRID_H,
  GRID_W,
  LOUNGE_SPOTS,
  OVERFLOW_SPOTS,
  PORCH,
  SEAT_TILES,
  STUDY_SPOTS,
  queueTile,
} from './layout'
import type { Desk } from './layout'
import { COORDINATOR_ROLE, EMPTY_TOKENS, addTokens, bossName, clip, costOf, modelBadge, personName, roleOf, routeOf } from './roles'
import type { ParsedResult } from './roles'

export { DESKS, DOOR, GRID_H, GRID_W }
export type { Desk, Facing } from './layout'

export const TICK_MS = 500
export const BEAT_MS = 5000
export const THINK_AFTER_MS = 20_000
export const COFFEE_AFTER_MS = 6_000
export const HAPPY_FOR_MS = 4_000
export const STUDY_MS = 6_000
export const REST_MS = 45_000
export const FAILED_LEAVE_MS = 60_000
export const DECISION_TIMEOUT_MS = 10 * 60_000
export const BOSS_COFFEE_AFTER_MS = 5 * 60_000
export const LEAVE_GAP_MS = 1_000
export const RUNS_KEPT = 24
export const EVENTS_KEPT = 24
export const AGENTS_KEPT = 40
export const VISIBLE_LIMIT = 12
export const TURNS_KEPT = 24
export const TURN_TOOLS_KEPT = 16
export const RECENT_KEPT = 8
export const NOTES_KEPT = 8

export type Reserved = Record<string, number>

export type AutoOpen = 'session-start' | 'first-agent' | 'never'

export function autoOpenOf(value: unknown): AutoOpen {
  return value === 'first-agent' || value === 'never' ? value : 'session-start'
}

export function opensAt(mode: AutoOpen, moment: 'session-start' | 'first-agent'): boolean {
  if (mode === 'never') return false
  return moment === 'first-agent' || mode === 'session-start'
}

function key(tile: OfficeTile): string {
  return `${tile.x},${tile.y}`
}

export function isSame(a: OfficeTile, b: OfficeTile): boolean {
  return a.x === b.x && a.y === b.y
}

export function isOutside(tile: OfficeTile): boolean {
  return tile.x >= GRID_W
}

const STEPS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const

function routeAround(from: OfficeTile, to: OfficeTile, avoid: ReadonlySet<string>): OfficeTile[] | undefined {
  if (isSame(from, to)) return []
  const seen = new Map<string, string>()
  const start = key(from)
  const goal = key(to)
  seen.set(start, '')
  const queue: OfficeTile[] = [from]
  let head = 0
  while (head < queue.length) {
    const here = queue[head]
    head += 1
    if (here === undefined) break
    for (const [dx, dy] of STEPS) {
      const next = { x: here.x + dx, y: here.y + dy }
      const id = key(next)
      if (next.x < 0 || next.y < 0 || next.x >= GRID_W || next.y >= GRID_H) continue
      if (seen.has(id)) continue
      if (id !== goal && (BLOCKED.has(id) || SEAT_TILES.has(id) || avoid.has(id))) continue
      if (BLOCKED_EDGES.has(`${key(here)}|${id}`)) continue
      seen.set(id, key(here))
      if (id === goal) {
        const path: OfficeTile[] = []
        let walk = id
        while (walk !== start && walk !== '') {
          const [x, y] = walk.split(',').map(Number)
          path.unshift({ x: x ?? 0, y: y ?? 0 })
          walk = seen.get(walk) ?? ''
        }
        return path
      }
      queue.push(next)
    }
  }
  return undefined
}

const NOWHERE: ReadonlySet<string> = new Set()

export function findPath(from: OfficeTile, to: OfficeTile): OfficeTile[] {
  return routeAround(from, to, NOWHERE) ?? [to]
}

export function entryPath(queueIndex: number, target: OfficeTile): OfficeTile[] {
  const outside: OfficeTile[] = []
  for (let index = queueIndex - 1; index >= 0; index -= 1) outside.push(queueTile(index))
  return [...outside, DOOR, ...findPath(DOOR, target)]
}

export function exitPath(from: OfficeTile): OfficeTile[] {
  if (isSame(from, EXIT)) return []
  if (isSame(from, PORCH)) return [EXIT]
  if (isOutside(from)) return [PORCH, EXIT]
  return [...findPath(from, DOOR), PORCH, EXIT]
}

function returnPath(from: OfficeTile, target: OfficeTile): OfficeTile[] {
  if (!isOutside(from)) return findPath(from, target)
  const outside = isSame(from, PORCH) ? [] : [PORCH]
  return [...outside, DOOR, ...findPath(DOOR, target)]
}

const DESKS_BY_DOOR: readonly number[] = DESKS.map((desk, index) => ({ index, steps: findPath(DOOR, desk.seat).length }))
  .sort((a, b) => a.steps - b.steps || a.index - b.index)
  .map(one => one.index)

export function isStaff(type: string): boolean {
  return roleOf(type).isTeam
}

export function studiesFirst(type: string): boolean {
  return type === 'Explore' || type === 'Plan' || type === 'ios-team:architect'
}

export function nameOf(agent: OfficeAgent): string {
  return personName(agent.type, agent.name, agent.ordinal)
}

export function deskOf(agent: OfficeAgent): Desk | undefined {
  return agent.desk >= 0 ? DESKS[agent.desk] : undefined
}

export function homeTile(agent: OfficeAgent): OfficeTile {
  const desk = deskOf(agent)
  if (desk !== undefined) return desk.seat
  return OVERFLOW_SPOTS[Math.max(0, agent.spot) % OVERFLOW_SPOTS.length] ?? DOOR
}

export function isWalking(agent: OfficeAgent): boolean {
  return agent.path.length > 0
}

export function isSettled(agent: OfficeAgent): boolean {
  return agent.path.length === 0 && isSame(agent.from, agent.pos)
}

export function isAtHome(agent: OfficeAgent): boolean {
  return agent.goal === 'desk' && agent.path.length === 0 && isSame(agent.pos, homeTile(agent))
}

export function canStop(agent: OfficeAgent | undefined): boolean {
  if (agent === undefined || agent.goal === 'door') return false
  return agent.status === 'working' || agent.status === 'thinking' || agent.status === 'decision' || agent.status === 'blocked'
}

export function isIdleStaff(agent: OfficeAgent): boolean {
  return agent.status === 'done' && isStaff(agent.type) && agent.restUntil > 0 && agent.goal === 'desk'
}

function present(all: Readonly<Record<string, OfficeAgent>>): [string, OfficeAgent][] {
  return Object.entries(all).filter(([, agent]) => agent.status !== 'gone')
}

function slotKey(type: string, ordinal: number): string {
  return `${type}#${ordinal}`
}

type Slot = { ordinal: number; holder?: string }

function takeSlot(all: Readonly<Record<string, OfficeAgent>>, id: string, type: string, wanted = 0): Slot {
  const held = new Map<number, [string, OfficeAgent]>()
  for (const [other, agent] of present(all)) if (other !== id && agent.type === type) held.set(agent.ordinal, [other, agent])
  const reusable = (ordinal: number) => {
    const holder = held.get(ordinal)
    return holder !== undefined && isStaff(type) && holder[1].status === 'done' && holder[1].goal !== 'door' ? holder[0] : undefined
  }
  if (wanted > 0 && !held.has(wanted)) return { ordinal: wanted }
  for (let ordinal = 1; ; ordinal += 1) {
    if (!held.has(ordinal)) return { ordinal }
    const holder = reusable(ordinal)
    if (holder !== undefined) return { ordinal, holder }
  }
}

function occupiedDesks(all: Readonly<Record<string, OfficeAgent>>, except: readonly string[]): Set<number> {
  return new Set(
    present(all)
      .filter(([id]) => !except.includes(id))
      .map(([, agent]) => agent.desk)
      .filter(desk => desk >= 0),
  )
}

function deskFor(
  all: Readonly<Record<string, OfficeAgent>>,
  reserved: Readonly<Reserved>,
  type: string,
  ordinal: number,
  except: readonly string[],
): { desk: number; reserved: Reserved } {
  const taken = occupiedDesks(all, except)
  const held = new Set(Object.values(reserved))
  const isFree = (desk: number) => !taken.has(desk) && !held.has(desk)
  if (isStaff(type)) {
    const slot = slotKey(type, ordinal)
    const mine = reserved[slot]
    if (mine !== undefined && !taken.has(mine)) return { desk: mine, reserved: { ...reserved } }
    const desk = DESKS.findIndex((_, index) => isFree(index))
    if (desk < 0) return { desk: -1, reserved: { ...reserved } }
    return { desk, reserved: { ...reserved, [slot]: desk } }
  }
  return { desk: DESKS_BY_DOOR.find(isFree) ?? -1, reserved: { ...reserved } }
}

function freeSpot(all: Readonly<Record<string, OfficeAgent>>, except: string, goal: OfficeGoal, count: number, boss?: OfficeCoordinator): number {
  const taken = new Set(
    present(all)
      .filter(([id, agent]) => id !== except && agent.goal === goal)
      .map(([, agent]) => agent.spot),
  )
  if (goal === 'coffee' && boss?.goal === 'coffee') taken.add(boss.spot)
  for (let index = 0; index < count; index += 1) if (!taken.has(index)) return index
  return -1
}

function freeOverflow(all: Readonly<Record<string, OfficeAgent>>, except: string): number {
  const taken = new Set(
    present(all)
      .filter(([id, agent]) => id !== except && agent.desk < 0)
      .map(([, agent]) => agent.spot),
  )
  for (let index = 0; index < OVERFLOW_SPOTS.length; index += 1) if (!taken.has(index)) return index
  return 0
}

export function queueIndex(all: Readonly<Record<string, OfficeAgent>>, boss?: OfficeCoordinator): number {
  const isInDoorway = (agent: OfficeAgent) => agent.goal === 'door' && (isSame(agent.pos, DOOR) || (isOutside(agent.pos) && agent.pos.y <= DOOR.y))
  const outside = present(all)
    .filter(([, agent]) => (isOutside(agent.pos) && agent.goal !== 'door') || isInDoorway(agent))
    .map(([, agent]) => (isOutside(agent.pos) ? agent.pos : PORCH))
  if (boss !== undefined && boss.hasEntered && isOutside(boss.pos)) outside.push(boss.pos)
  if (outside.length === 0) return 0
  return Math.max(...outside.map(tile => DOOR.y - tile.y)) + 1
}

function routeTo(agent: OfficeAgent, goal: OfficeGoal, target: OfficeTile, spot: number, now: number): OfficeAgent {
  return { ...agent, goal, spot, planUntil: 0, path: returnPath(agent.pos, target), from: agent.pos, movedAt: now - 10 * TICK_MS }
}

function leave(agent: OfficeAgent, exit: OfficeExit, now: number, wait = 0): OfficeAgent {
  return { ...agent, goal: 'door', exit, spot: 0, planUntil: wait > 0 ? now + wait : 0, path: exitPath(agent.pos), from: agent.pos, movedAt: now - 10 * TICK_MS }
}

function eventOf(agent: OfficeAgent, at: number, text: string, tone: OfficeEventTone): OfficeEvent {
  return { at, who: nameOf(agent), color: roleOf(agent.type).accent, text: clip(text, 60), tone }
}

export type SpawnInfo = {
  type: string
  description: string
  model: string
  effort?: string
  background: boolean
  brief: string
  name?: string
  parent?: string
}

export type Change = { agents: Record<string, OfficeAgent>; events: OfficeEvent[] }

export type SpawnChange = Change & { reserved: Reserved }

export function nextSeq(all: Readonly<Record<string, OfficeAgent>>): number {
  return Object.values(all).reduce((max, agent) => Math.max(max, agent.seq), 0) + 1
}

export function pruneAgents(all: Readonly<Record<string, OfficeAgent>>): Record<string, OfficeAgent> {
  const entries = Object.entries(all)
  if (entries.length <= AGENTS_KEPT) return { ...all }
  const gone = entries.filter(([, agent]) => agent.status === 'gone').sort((a, b) => a[1].seq - b[1].seq)
  const drop = new Set(gone.slice(0, entries.length - AGENTS_KEPT).map(([id]) => id))
  return Object.fromEntries(entries.filter(([id]) => !drop.has(id)))
}

function firstTarget(agent: OfficeAgent, all: Readonly<Record<string, OfficeAgent>>, id: string, canStudy: boolean): { goal: OfficeGoal; spot: number; target: OfficeTile } {
  if (canStudy && studiesFirst(agent.type)) {
    const spot = freeSpot(all, id, 'board', STUDY_SPOTS.length)
    const tile = spot >= 0 ? STUDY_SPOTS[spot] : undefined
    if (tile !== undefined) return { goal: 'board', spot, target: tile }
  }
  return { goal: 'desk', spot: agent.spot, target: homeTile(agent) }
}

function walkIn(
  all: Readonly<Record<string, OfficeAgent>>,
  reserved: Readonly<Reserved>,
  boss: OfficeCoordinator | undefined,
  id: string,
  agent: OfficeAgent,
  now: number,
  wanted = 0,
): { agents: Record<string, OfficeAgent>; agent: OfficeAgent; reserved: Reserved; isInside: boolean } {
  const canStudy = wanted === 0
  const slot = takeSlot(all, id, agent.type, wanted)
  const holder = slot.holder !== undefined ? all[slot.holder] : undefined
  if (slot.holder !== undefined && holder !== undefined) {
    const placed: OfficeAgent = { ...agent, ordinal: slot.ordinal, desk: holder.desk, spot: holder.spot, pos: holder.pos, from: holder.pos, movedAt: now - 10 * TICK_MS }
    const first = firstTarget(placed, all, id, canStudy)
    const routed: OfficeAgent = { ...placed, goal: first.goal, spot: first.spot, path: returnPath(holder.pos, first.target) }
    const retired: OfficeAgent = { ...holder, status: 'gone', statusAt: now, path: [], from: holder.pos }
    return { agents: { ...all, [slot.holder]: retired }, agent: routed, reserved: { ...reserved }, isInside: true }
  }
  const seat = deskFor(all, reserved, agent.type, slot.ordinal, [id])
  const placed: OfficeAgent = { ...agent, ordinal: slot.ordinal, desk: seat.desk, spot: seat.desk < 0 ? freeOverflow(all, id) : 0 }
  const first = firstTarget(placed, all, id, canStudy)
  const index = queueIndex(all, boss)
  const start = queueTile(index)
  const routed: OfficeAgent = { ...placed, goal: first.goal, spot: first.spot, pos: start, from: start, movedAt: now - 10 * TICK_MS, path: entryPath(index, first.target) }
  return { agents: { ...all }, agent: routed, reserved: seat.reserved, isInside: false }
}

function routed(info: SpawnInfo): { effort?: string; route?: string } {
  const route = routeOf(info.brief)
  return { ...(info.effort ? { effort: info.effort } : {}), ...(route ? { route } : {}) }
}

export function spawnAgent(
  all: Readonly<Record<string, OfficeAgent>>,
  reserved: Readonly<Reserved>,
  id: string,
  info: SpawnInfo,
  now: number,
  boss?: OfficeCoordinator,
): SpawnChange {
  const earlier = all[id]
  const role = roleOf(info.type)
  if (earlier !== undefined && earlier.status !== 'gone') {
    const kept: OfficeAgent = { ...earlier, model: modelBadge(info.model) || earlier.model, description: info.description || earlier.description, ...routed(info) }
    return { agents: { ...all, [id]: kept }, events: [], reserved: { ...reserved } }
  }
  const base: OfficeAgent = {
    type: info.type,
    role: role.label,
    ...(info.name !== undefined ? { name: info.name } : {}),
    ...(info.parent !== undefined ? { parent: info.parent } : {}),
    model: modelBadge(info.model),
    ...routed(info),
    description: clip(info.description, 80),
    brief: clip(info.brief, 220),
    status: 'working',
    activity: 'Читает задачу',
    act: 'other',
    summary: '',
    seq: earlier?.seq ?? nextSeq(all),
    startedAt: now,
    lastToolAt: now,
    statusAt: now,
    endedAt: 0,
    toolCount: earlier?.toolCount ?? 0,
    runs: earlier?.runs ?? [],
    tokens: earlier?.tokens ?? EMPTY_TOKENS,
    cost: earlier?.cost ?? 0,
    desk: -1,
    pos: DOOR,
    from: DOOR,
    movedAt: now - 10 * TICK_MS,
    path: [],
    goal: 'desk',
    spot: 0,
    planUntil: 0,
    background: info.background,
    ordinal: 1,
    restUntil: 0,
  }
  const entered = walkIn(all, reserved, boss, id, base, now)
  const how = [modelBadge(info.model), info.effort ?? ''].filter(Boolean).join(' ')
  const task = `${info.description || 'a new task'}${how ? ` · ${how}` : ''}`
  const text = entered.isInside ? `new task: ${task}` : `arrived: ${task}`
  return {
    agents: pruneAgents({ ...entered.agents, [id]: entered.agent }),
    events: [eventOf(entered.agent, now, text, 'info')],
    reserved: entered.reserved,
  }
}

function backToWork(
  all: Readonly<Record<string, OfficeAgent>>,
  reserved: Readonly<Reserved>,
  boss: OfficeCoordinator | undefined,
  id: string,
  agent: OfficeAgent,
  now: number,
): { agents: Record<string, OfficeAgent>; agent: OfficeAgent; reserved: Reserved } {
  const fresh: OfficeAgent = { ...agent, restUntil: 0 }
  delete fresh.exit
  if (agent.status === 'gone') {
    const entered = walkIn(all, reserved, boss, id, { ...fresh, goal: 'desk', planUntil: 0 }, now, agent.ordinal)
    return { agents: entered.agents, agent: entered.agent, reserved: entered.reserved }
  }
  if (agent.goal === 'board' || (agent.goal === 'desk' && agent.exit === undefined)) return { agents: { ...all }, agent: fresh, reserved: { ...reserved } }
  return { agents: { ...all }, agent: routeTo(fresh, 'desk', homeTile(fresh), fresh.desk < 0 ? fresh.spot : 0, now), reserved: { ...reserved } }
}

export function startTool(
  all: Readonly<Record<string, OfficeAgent>>,
  id: string,
  activity: { text: string; act: OfficeActKind },
  tool: string,
  now: number,
  reserved: Readonly<Reserved> = {},
  boss?: OfficeCoordinator,
): SpawnChange {
  const agent = all[id]
  if (agent === undefined) return { agents: { ...all }, events: [], reserved: { ...reserved } }
  const moved = backToWork(all, reserved, boss, id, agent, now)
  const resumed = agent.status !== 'working' && agent.status !== 'thinking'
  const next: OfficeAgent = {
    ...settleAsks(moved.agent, now),
    status: 'working',
    activity: activity.text,
    act: activity.act,
    lastToolAt: now,
    statusAt: resumed ? now : agent.statusAt,
    toolCount: agent.toolCount + 1,
    runs: [...agent.runs, { at: now, text: activity.text, state: 'running' as OfficeRunState, tool }].slice(-RUNS_KEPT),
  }
  const word = agent.status === 'gone' ? 'arrived: back for more work' : 'back to work'
  const events = resumed ? [eventOf(next, now, word, 'info')] : []
  return { agents: { ...moved.agents, [id]: next }, events, reserved: moved.reserved }
}

function settleAsks(agent: OfficeAgent, now: number): OfficeAgent {
  if (agent.asks === undefined) return agent
  const next: OfficeAgent = { ...agent, answered: { text: agent.answer?.text ?? '', at: now } }
  delete next.asks
  delete next.answer
  return next
}

export function noteOf(agent: OfficeAgent, kind: OfficeNoteKind, texts: readonly string[], now: number): OfficeAgent {
  if (texts.length === 0) return agent
  const fresh: OfficeNote[] = texts.map(text => ({ kind, text: clip(text, 160), at: now }))
  return { ...agent, notes: [...fresh, ...(agent.notes ?? [])].slice(0, NOTES_KEPT) }
}

export function messageAgent(
  all: Readonly<Record<string, OfficeAgent>>,
  id: string,
  now: number,
  reserved: Readonly<Reserved> = {},
  boss?: OfficeCoordinator,
): SpawnChange {
  const agent = all[id]
  if (agent === undefined) return { agents: { ...all }, events: [], reserved: { ...reserved } }
  const isAnswer = agent.status === 'decision' || agent.status === 'blocked'
  const text = isAnswer ? 'Читает твой ответ' : 'Читает сообщение'
  const moved = backToWork(all, reserved, boss, id, agent, now)
  const resumed = agent.status !== 'working' && agent.status !== 'thinking'
  const next: OfficeAgent = {
    ...settleAsks(moved.agent, now),
    status: 'working',
    activity: text,
    act: 'read',
    lastToolAt: now,
    statusAt: resumed ? now : agent.statusAt,
    runs: [...agent.runs, { at: now, text: isAnswer ? 'Получил ответ' : 'Получил сообщение', state: 'ok' as OfficeRunState, tool: 'SendMessage' }].slice(-RUNS_KEPT),
  }
  const word = agent.status === 'gone' ? 'arrived: back for more work' : isAnswer ? 'got the answer' : 'got a message'
  return { agents: { ...moved.agents, [id]: next }, events: resumed ? [eventOf(next, now, word, 'info')] : [], reserved: moved.reserved }
}

export function findAgent(all: Readonly<Record<string, OfficeAgent>>, to: string): string | undefined {
  const wanted = to.trim()
  if (wanted.length === 0) return undefined
  if (all[wanted] !== undefined && all[wanted]?.status !== 'gone') return wanted
  const byName = Object.entries(all)
    .filter(([, agent]) => nameOf(agent) === wanted || agent.name === wanted)
    .sort((a, b) => Number(a[1].status === 'gone') - Number(b[1].status === 'gone') || b[1].seq - a[1].seq)
  return byName[0]?.[0] ?? (all[wanted] !== undefined ? wanted : undefined)
}

export function endTool(
  all: Readonly<Record<string, OfficeAgent>>,
  id: string,
  startedAt: number,
  isError: boolean,
  now: number,
): Record<string, OfficeAgent> {
  const agent = all[id]
  if (agent === undefined) return { ...all }
  return { ...all, [id]: { ...agent, lastToolAt: Math.max(agent.lastToolAt, now), runs: settleRun(agent.runs, startedAt, isError) } }
}

export function settleRun<R extends { at: number; state: OfficeRunState }>(runs: readonly R[], at: number, isError: boolean): R[] {
  let done = false
  return [...runs]
    .reverse()
    .map(run => {
      if (done || run.at !== at || run.state !== 'running') return run
      done = true
      return { ...run, state: isError ? ('error' as const) : ('ok' as const) }
    })
    .reverse()
}

export type Completion = {
  parsed: ParsedResult
  reason: string
  isAborted: boolean
  usage?: Partial<Record<string, unknown>>
}

const TONE: Readonly<Record<OfficeStatus, OfficeEventTone>> = {
  working: 'info',
  thinking: 'info',
  decision: 'warn',
  blocked: 'warn',
  failed: 'bad',
  done: 'ok',
  stopped: 'bad',
  gone: 'info',
}

const LEAD: Readonly<Record<OfficeStatus, string>> = {
  working: '',
  thinking: '',
  decision: 'needs a decision: ',
  blocked: 'blocked: ',
  failed: 'failed: ',
  done: 'done: ',
  stopped: 'stopped: ',
  gone: '',
}

export function completeAgent(
  all: Readonly<Record<string, OfficeAgent>>,
  id: string,
  done: Completion,
  now: number,
): Change {
  const agent = all[id]
  if (agent === undefined || agent.status === 'gone') return { agents: { ...all }, events: [] }
  const fallback: OfficeStatus = done.reason === 'error' || done.reason === 'refusal' ? 'failed' : 'done'
  const status: OfficeStatus = done.isAborted ? 'stopped' : (done.parsed.status ?? fallback)
  const words: Readonly<Record<OfficeStatus, string>> = {
    working: 'working',
    thinking: 'thinking',
    decision: done.parsed.question ?? done.parsed.summary ?? 'needs your decision',
    blocked: done.parsed.question ?? done.parsed.summary ?? 'blocked, needs help',
    failed: done.parsed.summary ?? 'failed',
    done: done.parsed.summary ?? 'completed',
    stopped: 'interrupted',
    gone: 'left',
  }
  const tokens: OfficeTokens = addTokens(agent.tokens, done.usage)
  const usageModel = typeof done.usage?.['model'] === 'string' ? modelBadge(done.usage['model']) : ''
  const badge = usageModel || agent.model
  const added = costOf(addTokens(EMPTY_TOKENS, done.usage), badge)
  const fresh: OfficeAgent = { ...agent }
  delete fresh.live
  delete fresh.asks
  delete fresh.answer
  delete fresh.answered
  const asks = asksOf(status, done.parsed)
  const settled: OfficeAgent = {
    ...fresh,
    status,
    model: agent.model || badge,
    activity: clip(words[status], 36),
    summary: clip(words[status], 120),
    statusAt: now,
    endedAt: now,
    tokens,
    cost: agent.cost + added,
    restUntil: 0,
    ...(asks.length > 0 ? { asks } : {}),
  }
  const noted = noteOf(noteOf(noteOf(settled, 'noticed', done.parsed.noticed ?? [], now), 'not_verified', done.parsed.notVerified ?? [], now), 'failed', status === 'failed' ? [words.failed] : [], now)
  const next = status === 'stopped' ? leave(noted, 'stopped', now) : noted
  return { agents: { ...all, [id]: next }, events: [eventOf(next, now, `${LEAD[status]}${words[status]}`, TONE[status])] }
}

function asksOf(status: OfficeStatus, parsed: ParsedResult): OfficeAsk[] {
  if (status !== 'decision' && status !== 'blocked') return []
  if (parsed.decisions !== undefined && parsed.decisions.length > 0) return parsed.decisions.map(one => ({ ...one, options: [...one.options] }))
  const question = parsed.question ?? parsed.summary ?? (status === 'blocked' ? 'blocked, needs help' : 'needs your decision')
  return [{ id: status === 'blocked' ? 'b1' : 'd1', question: clip(question, 200), options: [] }]
}

export function stopNow(all: Readonly<Record<string, OfficeAgent>>, id: string, why: string, now: number): Change {
  const agent = all[id]
  if (agent === undefined || agent.status === 'gone') return { agents: { ...all }, events: [] }
  const stopped = leave({ ...agent, status: 'stopped', activity: 'Остановлен', summary: `stopped: ${why}`, statusAt: now, endedAt: now }, 'stopped', now)
  return { agents: { ...all, [id]: stopped }, events: [eventOf(stopped, now, `stopped by hand: ${why}`, 'bad')] }
}

export function leaveAll(all: Readonly<Record<string, OfficeAgent>>, now: number): Record<string, OfficeAgent> {
  const out: Record<string, OfficeAgent> = { ...all }
  present(all)
    .filter(([, agent]) => agent.goal !== 'door')
    .sort((a, b) => exitPath(a[1].pos).length - exitPath(b[1].pos).length || a[1].seq - b[1].seq)
    .forEach(([id, agent], index) => {
      out[id] = leave({ ...agent, status: agent.status === 'working' || agent.status === 'thinking' ? 'done' : agent.status }, 'session', now, index * LEAVE_GAP_MS)
    })
  return out
}

const EXIT_WORD: Readonly<Record<OfficeExit, string>> = { done: 'left: done', failed: 'left: failed', stopped: 'left: stopped', timeout: 'left: timeout', session: 'left: session ended' }

function settle(
  id: string,
  agent: OfficeAgent,
  all: Readonly<Record<string, OfficeAgent>>,
  boss: OfficeCoordinator | undefined,
  now: number,
): OfficeAgent {
  const since = now - agent.statusAt
  const isToolRunning = agent.runs.some(run => run.state === 'running')
  const isStudying = agent.goal === 'board' && (agent.status === 'working' || agent.status === 'thinking')
  const staff = isStaff(agent.type)
  if (agent.goal === 'board' && (!isStudying || (agent.planUntil > 0 && now >= agent.planUntil))) {
    return routeTo(agent, 'desk', homeTile(agent), agent.desk < 0 ? agent.spot : 0, now)
  }
  if (agent.status === 'working' && isAtHome(agent) && !isToolRunning && now - agent.lastToolAt >= THINK_AFTER_MS) return { ...agent, status: 'thinking', activity: 'Думает' }
  if (agent.status === 'stopped' && agent.goal !== 'door') return leave(agent, 'stopped', now)
  if (agent.status === 'decision' || agent.status === 'blocked') {
    if (!staff && since >= DECISION_TIMEOUT_MS && agent.goal !== 'door') return leave(agent, 'timeout', now)
    if (agent.goal === 'desk' && since >= COFFEE_AFTER_MS) {
      const spot = Math.max(0, freeSpot(all, id, 'coffee', COFFEE_SPOTS.length, boss))
      return routeTo(agent, 'coffee', COFFEE_SPOTS[spot] ?? COFFEE_SPOTS[0] ?? DOOR, spot, now)
    }
    return agent
  }
  if (agent.status === 'failed') {
    if (!staff && agent.goal === 'desk' && since >= FAILED_LEAVE_MS) return leave(agent, 'failed', now)
    return agent
  }
  if (agent.status === 'done') {
    if (agent.goal === 'desk' && agent.restUntil === 0 && since >= HAPPY_FOR_MS) {
      if (!staff) return leave(agent, 'done', now)
      const sofa = freeSpot(all, id, 'lounge', LOUNGE_SPOTS.length)
      const rested = { ...agent, restUntil: now + REST_MS }
      if (sofa >= 0) return routeTo(rested, 'lounge', LOUNGE_SPOTS[sofa] ?? DOOR, sofa, now)
      const cup = Math.max(0, freeSpot(all, id, 'coffee', COFFEE_SPOTS.length, boss))
      return routeTo(rested, 'coffee', COFFEE_SPOTS[cup] ?? DOOR, cup, now)
    }
    if ((agent.goal === 'lounge' || agent.goal === 'coffee') && agent.restUntil > 0 && now >= agent.restUntil) {
      return routeTo(agent, 'desk', homeTile(agent), agent.desk < 0 ? agent.spot : 0, now)
    }
  }
  return agent
}

export type Move = { step?: OfficeTile; path: OfficeTile[]; waits: number }

type Walker = { id: string; pos: OfficeTile; path: readonly OfficeTile[]; goal: string; waits: number; seq: number }

const BOSS_ID = '@boss'
const MAX_WAITS = 8

function rankOf(walker: Walker): number {
  if (isSame(walker.pos, DOOR) || isSame(walker.pos, PORCH)) return 0
  if (isOutside(walker.pos)) return 1 + (DOOR.y - walker.pos.y) / 100
  return 2
}

function lastInside(path: readonly OfficeTile[]): number {
  let last = -1
  path.forEach((tile, index) => {
    if (!isOutside(tile)) last = index
  })
  return last
}

export function planMoves(all: Readonly<Record<string, OfficeAgent>>, boss: OfficeCoordinator | undefined, now: number): Map<string, Move> {
  const occupants = new Map<string, string>()
  const walkers: Walker[] = []
  let isInbound = false
  for (const [id, agent] of present(all)) {
    occupants.set(key(agent.pos), id)
    if (agent.goal !== 'door' && (isOutside(agent.pos) || isSame(agent.pos, DOOR))) isInbound = true
    const isHeld = agent.goal === 'door' && agent.planUntil > now
    if (agent.path.length > 0 && !isHeld) walkers.push({ id, pos: agent.pos, path: agent.path, goal: agent.goal, waits: agent.waits ?? 0, seq: agent.seq })
  }
  if (boss !== undefined && boss.hasEntered) {
    occupants.set(key(boss.pos), BOSS_ID)
    if (isOutside(boss.pos) || isSame(boss.pos, DOOR)) isInbound = true
    if (boss.path.length > 0) walkers.push({ id: BOSS_ID, pos: boss.pos, path: boss.path, goal: boss.goal, waits: boss.waits ?? 0, seq: 0 })
  }
  walkers.sort((a, b) => rankOf(a) - rankOf(b) || a.seq - b.seq)
  const byId = new Map(walkers.map(walker => [walker.id, walker]))
  const decided = new Map<string, boolean>()
  const claims = new Set<string>()
  const isDoorHeld = (walker: Walker) => {
    const target = walker.path[0]
    return walker.goal === 'door' && target !== undefined && isSame(target, DOOR) && !isSame(walker.pos, DOOR) && isInbound
  }
  for (let round = 0; round <= walkers.length; round += 1) {
    let isProgress = false
    for (const walker of walkers) {
      if (decided.has(walker.id)) continue
      const target = walker.path[0]
      let verdict: boolean | undefined = false
      if (target !== undefined && !claims.has(key(target)) && !isDoorHeld(walker)) {
        const occupant = occupants.get(key(target))
        const other = occupant !== undefined ? byId.get(occupant) : undefined
        const said = occupant !== undefined ? decided.get(occupant) : undefined
        if (occupant === undefined || occupant === walker.id) verdict = true
        else if (other === undefined) verdict = false
        else if (said === undefined) verdict = undefined
        else verdict = said && !(other.path[0] !== undefined && isSame(other.path[0], walker.pos))
      }
      if (verdict === undefined) continue
      decided.set(walker.id, verdict)
      if (verdict && target !== undefined) claims.add(key(target))
      isProgress = true
    }
    if (!isProgress) break
  }
  const moves = new Map<string, Move>()
  for (const walker of walkers) {
    const target = walker.path[0]
    if (decided.get(walker.id) === true && target !== undefined) {
      moves.set(walker.id, { step: target, path: walker.path.slice(1), waits: 0 })
      continue
    }
    const held = isDoorHeld(walker)
    const blocker = target !== undefined ? occupants.get(key(target)) : undefined
    const other = blocker !== undefined ? byId.get(blocker) : undefined
    const isSwap = other !== undefined && other.path[0] !== undefined && isSame(other.path[0], walker.pos)
    const last = lastInside(walker.path)
    const goal = walker.path[last]
    if (!held && blocker !== undefined && (other === undefined || isSwap) && !isOutside(walker.pos) && goal !== undefined) {
      const avoid = new Set(claims)
      for (const [tile, id] of occupants) if (id !== walker.id && decided.get(id) !== true) avoid.add(tile)
      avoid.delete(key(goal))
      const around = routeAround(walker.pos, goal, avoid)
      const first = around?.[0]
      if (around !== undefined && first !== undefined && !claims.has(key(first)) && (occupants.get(key(first)) === undefined || decided.get(occupants.get(key(first)) ?? '') === true)) {
        claims.add(key(first))
        moves.set(walker.id, { step: first, path: [...around.slice(1), ...walker.path.slice(last + 1)], waits: 0 })
        continue
      }
    }
    if (!held && walker.waits + 1 >= MAX_WAITS && target !== undefined && !claims.has(key(target))) {
      claims.add(key(target))
      moves.set(walker.id, { step: target, path: walker.path.slice(1), waits: 0 })
      continue
    }
    moves.set(walker.id, { path: [...walker.path], waits: held ? walker.waits : walker.waits + 1 })
  }
  return moves
}

export function stepAgents(all: Readonly<Record<string, OfficeAgent>>, now: number, boss?: OfficeCoordinator): Change & { changed: boolean; boss?: Move } {
  const events: OfficeEvent[] = []
  let changed = false
  const moves = planMoves(all, boss, now)
  const out: Record<string, OfficeAgent> = {}
  for (const [id, agent] of Object.entries(all)) {
    let next = agent
    if (next.status === 'gone') {
      out[id] = next
      continue
    }
    const move = moves.get(id)
    if (move !== undefined) {
      if (move.step !== undefined) {
        next = { ...next, from: next.pos, pos: move.step, path: move.path, movedAt: now, waits: 0 }
        if (move.path.length === 0 && next.goal === 'board') next = { ...next, planUntil: now + STUDY_MS }
      } else if (move.waits !== (next.waits ?? 0) || move.path.length !== next.path.length) {
        next = { ...next, path: move.path, waits: move.waits }
      }
    } else if (next.path.length > 0) {
      next = agent
    } else if (!isSame(next.from, next.pos) && now - next.movedAt >= TICK_MS) {
      next = { ...next, from: next.pos }
    } else if (next.goal === 'door' && isSame(next.pos, EXIT)) {
      next = { ...next, status: 'gone', statusAt: now }
      events.push(eventOf(next, now, EXIT_WORD[next.exit ?? 'done'], next.exit === 'failed' || next.exit === 'stopped' ? 'bad' : 'info'))
    } else {
      next = settle(id, next, { ...all, ...out }, boss, now)
    }
    if (next !== agent) changed = true
    out[id] = next
  }
  const bossMove = moves.get(BOSS_ID)
  return { agents: out, events, changed, ...(bossMove !== undefined ? { boss: bossMove } : {}) }
}

export function isDoorOpen(all: Readonly<Record<string, OfficeAgent>>, boss: OfficeCoordinator | undefined, now: number): boolean {
  const near = (pos: OfficeTile, from: OfficeTile, goal: string, movedAt: number) => {
    if (isSame(pos, DOOR) || isSame(pos, PORCH)) return true
    if (isOutside(pos) && goal !== 'door') return true
    return (isSame(from, DOOR) || isSame(from, PORCH)) && now - movedAt < TICK_MS
  }
  if (present(all).some(([, agent]) => near(agent.pos, agent.from, agent.goal, agent.movedAt))) return true
  return boss !== undefined && boss.hasEntered && near(boss.pos, boss.from, boss.goal, boss.movedAt)
}

export type TickMode = 'fast' | 'slow' | 'none'

export function tickMode(all: Readonly<Record<string, OfficeAgent>>, boss?: OfficeCoordinator): TickMode {
  const live = Object.values(all).filter(agent => agent.status !== 'gone')
  const bossMoves = boss !== undefined && (boss.path.length > 0 || !isSame(boss.from, boss.pos))
  if (bossMoves || live.some(agent => agent.path.length > 0 || !isSame(agent.from, agent.pos) || (agent.goal === 'door' && isSame(agent.pos, EXIT)))) return 'fast'
  const pending = live.some(agent => {
    if (agent.status === 'working' || agent.goal === 'board' || agent.status === 'done' || agent.status === 'stopped') {
      return !isIdleStaff(agent)
    }
    if (agent.status === 'decision' || agent.status === 'blocked') return agent.goal === 'desk' || !isStaff(agent.type)
    return agent.status === 'failed' && !isStaff(agent.type)
  })
  const bossPending = boss !== undefined && (boss.status === 'working' || boss.status === 'done' || (boss.status === 'idle' && boss.goal === 'desk' && boss.lastAt > 0))
  return pending || bossPending ? 'slow' : 'none'
}

export function visibleAgents(all: Readonly<Record<string, OfficeAgent>>): [string, OfficeAgent][] {
  return present(all)
    .sort((a, b) => a[1].seq - b[1].seq)
    .slice(-VISIBLE_LIMIT)
}

export const IDLE_COORDINATOR: OfficeCoordinator = {
  status: 'idle',
  activity: '',
  act: 'other',
  model: '',
  toolCount: 0,
  runs: [],
  tokens: EMPTY_TOKENS,
  cost: 0,
  lastAt: 0,
  statusAt: 0,
  turns: 0,
  flagged: 0,
  turnLog: [],
  isLead: false,
  hasEntered: false,
  pos: BOSS_DESK.seat,
  from: BOSS_DESK.seat,
  path: [],
  movedAt: 0,
  goal: 'desk',
  spot: 0,
}

export function bossLabel(boss: OfficeCoordinator): string {
  return bossName(boss.isLead)
}

export function bossEvent(boss: OfficeCoordinator, at: number, text: string, tone: OfficeEventTone): OfficeEvent {
  return { at, who: bossLabel(boss), color: COORDINATOR_ROLE.accent, text: clip(text, 60), tone }
}

export function enterBoss(boss: OfficeCoordinator, all: Readonly<Record<string, OfficeAgent>>, now: number): OfficeCoordinator {
  if (boss.hasEntered) return boss
  const index = queueIndex(all)
  const start = queueTile(index)
  return { ...boss, hasEntered: true, goal: 'desk', pos: start, from: start, movedAt: now - 10 * TICK_MS, path: entryPath(index, BOSS_DESK.seat) }
}

export function seatBoss(boss: OfficeCoordinator): OfficeCoordinator {
  return boss.hasEntered ? boss : { ...boss, hasEntered: true }
}

export function bossToDesk(boss: OfficeCoordinator, now: number): OfficeCoordinator {
  const seated = seatBoss(boss)
  if (seated.goal === 'desk') return seated
  return { ...seated, goal: 'desk', spot: 0, from: seated.pos, movedAt: now - 10 * TICK_MS, path: returnPath(seated.pos, BOSS_DESK.seat) }
}

export function isBossAtDesk(boss: OfficeCoordinator): boolean {
  return boss.goal === 'desk' && boss.path.length === 0 && isSame(boss.pos, BOSS_DESK.seat)
}

export function stepBoss(boss: OfficeCoordinator, all: Readonly<Record<string, OfficeAgent>>, now: number, move?: Move): OfficeCoordinator {
  if (boss.path.length > 0) {
    const [step, ...rest] = boss.path
    const isTaken = step !== undefined && present(all).some(([, agent]) => isSame(agent.pos, step))
    const plan: Move = move ?? (step === undefined || isTaken ? { path: [...boss.path], waits: (boss.waits ?? 0) + 1 } : { step, path: rest, waits: 0 })
    if (plan.step !== undefined) return { ...boss, from: boss.pos, pos: plan.step, path: plan.path, movedAt: now, waits: 0 }
    return { ...boss, path: plan.path, waits: plan.waits }
  }
  if (!isSame(boss.from, boss.pos) && now - boss.movedAt >= TICK_MS) return { ...boss, from: boss.pos }
  const isToolRunning = boss.runs.some(run => run.state === 'running')
  if (boss.status === 'working' && isBossAtDesk(boss) && !isToolRunning && now - boss.lastAt >= THINK_AFTER_MS) return { ...boss, status: 'thinking', activity: 'Думает…' }
  if (boss.status === 'done' && now - boss.statusAt >= HAPPY_FOR_MS) return { ...boss, status: 'idle' }
  if (boss.status === 'idle' && boss.goal === 'desk' && boss.lastAt > 0 && now - boss.lastAt >= BOSS_COFFEE_AFTER_MS) {
    const spot = Math.max(0, freeSpot(all, '', 'coffee', COFFEE_SPOTS.length))
    const target = COFFEE_SPOTS[spot] ?? DOOR
    return { ...boss, status: 'idle', goal: 'coffee', spot, from: boss.pos, movedAt: now - 10 * TICK_MS, path: returnPath(boss.pos, target) }
  }
  return boss
}

export function sessionCost(all: Readonly<Record<string, OfficeAgent>>, boss: OfficeCoordinator): number {
  return Object.values(all).reduce((sum, agent) => sum + agent.cost, boss.cost)
}

export function sessionTokens(all: Readonly<Record<string, OfficeAgent>>, boss: OfficeCoordinator): number {
  const one = (t: OfficeTokens) => t.input + t.output + t.cacheRead + t.cacheWrite
  return Object.values(all).reduce((sum, agent) => sum + one(agent.tokens), one(boss.tokens))
}

export function completedOfType(all: Readonly<Record<string, OfficeAgent>>, type: string): number {
  return Object.values(all).filter(agent => agent.type === type && (agent.status === 'done' || (agent.status === 'gone' && (agent.exit === undefined || agent.exit === 'done' || agent.exit === 'session')))).length
}

export function endsWithQuestion(answer: string): boolean {
  return /\?\s*$/.test(answer.replace(/[`*_\s]+$/g, ''))
}

export function questionOf(answer: string): string {
  const lines = answer
    .trim()
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
  return lines[lines.length - 1] ?? ''
}

export function objectiveOf(prompt: string): string {
  const line = prompt
    .split('\n')
    .map(one => one.trim())
    .find(one => one.length > 0)
  return clip(line ?? '', 80)
}
