import type { OfficeAgent, OfficeAsk, OfficeCoordinator, OfficeEvent, OfficeLink, OfficeNote, OfficeRun, OfficeSaid, OfficeSaidState, OfficeTile, OfficeTokens } from '../types'

import { agentFigure, coordinatorFigure, idleScreen, screenKind, seatedAt } from './art'
import type { Figure } from './art'
import { SEATS } from './layout'
import { sessionLabel } from './office-host'
import { ACTIVITY_MAX, BUBBLE_MAX, COORDINATOR_ROLE, costOf, effortLabel, STATUS_WORD, chipOf, clip, dotOf, roleOf, toolName } from './roles'
import type { Chip } from './roles'
import { DESKS, RECENT_KEPT, TICK_MS, bossLabel, canStop, completedOfType, isBossAtDesk, isDoorOpen, isSame, nameOf, sessionCost, sessionTokens, visibleAgents } from './world'

export const SNAPSHOT_FORMAT = 6

export const SAID_SHOWN = 3

export type SnapTile = readonly [number, number]

export type SnapRest = {
  pose: string
  facing: 'front' | 'back'
  mirror: boolean
  world: readonly [number, number]
  z: number
  depth: number
  bubble?: SnapBubble
  icon: string
  goal: string
  seat?: string
  screen?: SnapScreen
}

export type SnapAction = { at: number; text: string; tool: string; state: string }

export type SnapReply = { state: 'filled' | 'answered' | 'sent' | 'office' | 'claude'; text: string; at: number }

export type SnapCard = {
  role: string
  effort?: string
  route?: string
  status: string
  recent: readonly SnapAction[]
  tokens: number
  cost: number
  canStop: boolean
  spend: 'final' | 'running' | 'pending'
  asks: readonly OfficeAsk[]
  isReadOnly: boolean
  ask?: string
  reply?: SnapReply
  notes: readonly OfficeNote[]
  said: readonly SnapSaid[]
}

export type SnapSession = { main: string; sub: string; key: string; link?: string; why?: string }

export type SnapSaid = { request: string; text: string; at: number; state: OfficeSaidState; why?: string }

export type SnapAck = { request: string; ok: boolean; text: string; at: number }

export type SnapPerson = {
  id: string
  type: string
  name: string
  status: string
  chip: Chip
  dot: string
  completed: number
  model: string
  activity: string
  title: string
  tile: SnapTile
  path: readonly SnapTile[]
  movedAt: number
  gait: 'walk' | 'slump'
  vanishes: boolean
  rest: SnapRest
  card: SnapCard
}

export type SnapScreen = { desk: number; kind: string; thinking: boolean; working: boolean; blueprint: boolean }

export type SnapEvent = { at: number; who: string; color: string; text: string; tone: string }

export type Snapshot = {
  format: number
  version: number
  at: number
  startedAt: number
  stepMs: number
  people: readonly SnapPerson[]
  boss: SnapPerson
  door: boolean
  hud: { spent: number; tokens: number; runs: number; approvals: number; flagged: number }
  events: readonly SnapEvent[]
  acks: readonly SnapAck[]
  session?: SnapSession
}

export type SnapshotInput = {
  version: number
  now: number
  startedAt: number
  agents: Readonly<Record<string, OfficeAgent>>
  coordinator: OfficeCoordinator
  events: readonly OfficeEvent[]
  acks?: readonly SnapAck[]
  said?: readonly OfficeSaid[]
  link?: OfficeLink
}

function tile(at: OfficeTile): SnapTile {
  return [at.x, at.y]
}

function seatOf(at: OfficeTile): string | undefined {
  return SEATS.find(seat => isSame(seat.tile, at))?.key
}

function restOf(figure: Figure, at: OfficeTile, screen: SnapScreen | undefined): SnapRest {
  const seat = seatOf(at)
  return {
    pose: figure.pose,
    facing: figure.facing,
    mirror: figure.mirror,
    world: figure.world,
    z: figure.floorDy,
    depth: figure.depth,
    ...(figure.bubble !== undefined ? { bubble: figure.bubble } : {}),
    icon: figure.icon,
    goal: figure.goal,
    ...(seat !== undefined ? { seat } : {}),
    ...(screen !== undefined ? { screen } : {}),
  }
}

function deskScreen(agent: OfficeAgent): SnapScreen | undefined {
  const desk = DESKS[agent.desk]
  if (desk === undefined || !seatedAt(agent, desk)) return undefined
  const role = roleOf(agent.type)
  const kind = screenKind(agent, role)
  const working = agent.status === 'working'
  const thinking = agent.status === 'thinking'
  const blueprint = role.prop === 'blueprint'
  if (kind === idleScreen(desk) && !working && !thinking && !blueprint) return undefined
  return { desk: agent.desk, kind, thinking, working, blueprint }
}

function bossScreen(boss: OfficeCoordinator): SnapScreen | undefined {
  if (boss.status !== 'working' || !isBossAtDesk(boss)) return undefined
  const kind = boss.act === 'bash' ? 'term' : boss.act === 'read' ? 'read' : boss.act === 'web' ? 'web' : 'code'
  return { desk: -1, kind, thinking: false, working: true, blueprint: false }
}

function recentOf(runs: readonly OfficeRun[]): SnapAction[] {
  return runs
    .slice(-RECENT_KEPT)
    .reverse()
    .map(run => ({ at: run.at, text: clip(run.text, ACTIVITY_MAX), tool: toolName(run.tool), state: run.state }))
}

function replyOf(agent: OfficeAgent): { reply?: SnapReply } {
  if (agent.answer !== undefined && agent.asks !== undefined) return { reply: { state: 'filled', ...agent.answer } }
  if (agent.answered !== undefined) return { reply: { state: 'answered', ...agent.answered } }
  return {}
}

function bossReplyOf(boss: OfficeCoordinator): { reply?: SnapReply } {
  if (boss.live?.sent !== undefined) return { reply: { state: 'sent', ...boss.live.sent } }
  if (boss.answered !== undefined) return { reply: { state: boss.answered.from, text: boss.answered.text, at: boss.answered.at } }
  return {}
}

function saidTo(input: SnapshotInput, id: string): SnapSaid[] {
  return (input.said ?? [])
    .filter(one => one.to === id)
    .slice(-SAID_SHOWN)
    .reverse()
    .map(one => ({ request: one.request, text: one.text, at: one.at, state: one.state, ...(one.why !== undefined ? { why: one.why } : {}) }))
}

function sessionOf(known: OfficeLink | undefined): { session?: SnapSession } {
  if (known === undefined) return {}
  const label = sessionLabel(known.title ?? '', known.branch ?? '', known.folder ?? '')
  if (!label.main && known.url === '') return {}
  const why = known.status === 'ok' ? undefined : known.detail || 'ссылка на сессию ещё не найдена'
  return { session: { ...label, ...(known.status === 'ok' && known.url ? { link: known.url } : {}), ...(why !== undefined ? { why } : {}) } }
}

function tokensOf(tokens: OfficeTokens): number {
  return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite
}

function personOf(id: string, agent: OfficeAgent, input: SnapshotInput): SnapPerson {
  const last = agent.path[agent.path.length - 1] ?? agent.pos
  const arrived: OfficeAgent = { ...agent, pos: last, path: [] }
  const figure = agentFigure(id, arrived, { now: input.now, allAgents: input.agents, coordinator: input.coordinator })
  return {
    id,
    type: agent.type,
    name: nameOf(agent),
    status: agent.status,
    chip: chipOf(agent.status),
    dot: dotOf(agent.status),
    completed: completedOfType(input.agents, agent.type),
    model: agent.model,
    activity: agent.activity,
    title: figure.title,
    tile: tile(agent.pos),
    path: agent.path.map(tile),
    movedAt: agent.movedAt,
    gait: agent.goal === 'door' && agent.exit === 'failed' ? 'slump' : 'walk',
    vanishes: agent.goal === 'door',
    rest: restOf(figure, last, deskScreen(arrived)),
    card: {
      role: roleOf(agent.type).label,
      ...(agent.effort ? { effort: effortLabel(agent.effort) } : {}),
      ...(agent.route ? { route: agent.route } : {}),
      status: STATUS_WORD[agent.status],
      recent: recentOf(agent.runs),
      tokens: tokensOf(agent.tokens) + (agent.live !== undefined ? tokensOf(agent.live) : 0),
      cost: agent.cost + (agent.live !== undefined ? costOf(agent.live, agent.model) : 0),
      canStop: canStop(agent),
      spend: agent.live !== undefined ? 'running' : tokensOf(agent.tokens) === 0 && agent.endedAt === 0 ? 'pending' : 'final',
      asks: agent.asks ?? [],
      isReadOnly: false,
      ...replyOf(agent),
      notes: agent.notes ?? [],
      said: saidTo(input, id),
    },
  }
}

function bossOf(input: SnapshotInput): SnapPerson {
  const boss = input.coordinator
  const last = boss.path[boss.path.length - 1] ?? boss.pos
  const arrived: OfficeCoordinator = { ...boss, pos: last, path: [] }
  const figure = coordinatorFigure({ now: input.now, allAgents: input.agents, coordinator: arrived })
  return {
    id: 'coordinator',
    type: 'coordinator',
    name: bossLabel(boss),
    status: boss.status,
    chip: chipOf(boss.status),
    dot: dotOf(boss.status),
    completed: figure.completed,
    model: boss.model,
    activity: boss.activity,
    title: figure.title,
    tile: tile(boss.pos),
    path: boss.path.map(tile),
    movedAt: boss.movedAt,
    gait: 'walk',
    vanishes: false,
    rest: restOf(figure, last, bossScreen(arrived)),
    card: {
      role: COORDINATOR_ROLE.label,
      ...(boss.effort ? { effort: effortLabel(boss.effort) } : {}),
      status: STATUS_WORD[boss.status],
      recent: recentOf(boss.runs),
      tokens: tokensOf(boss.tokens),
      cost: boss.cost,
      canStop: false,
      spend: 'final',
      asks: boss.status === 'asking' ? (boss.asks ?? []) : [],
      isReadOnly: boss.live === undefined,
      ...(boss.live !== undefined ? { ask: boss.live.id } : {}),
      ...bossReplyOf(boss),
      notes: [],
      said: saidTo(input, 'coordinator'),
    },
  }
}

export function buildSnapshot(input: SnapshotInput): Snapshot {
  const all = Object.values(input.agents)
  const spent = sessionCost(input.agents, input.coordinator)
  const approvals = all.filter(agent => agent.status === 'decision' || agent.status === 'blocked').length + (input.coordinator.status === 'asking' ? 1 : 0)
  const flagged = all.filter(agent => agent.status === 'failed').length + input.coordinator.flagged
  return {
    format: SNAPSHOT_FORMAT,
    version: input.version,
    at: input.now,
    startedAt: input.startedAt,
    stepMs: TICK_MS,
    people: visibleAgents(input.agents).map(([id, agent]) => personOf(id, agent, input)),
    boss: bossOf(input),
    door: isDoorOpen(input.agents, input.coordinator, input.now),
    hud: {
      spent,
      tokens: sessionTokens(input.agents, input.coordinator),
      runs: all.length + input.coordinator.turns,
      approvals,
      flagged,
    },
    events: input.events.slice(-6).map(event => ({ ...event })),
    acks: [...(input.acks ?? [])].slice(-10),
    ...sessionOf(input.link),
  }
}

export type SnapBubble = { text: string; kind: string }

function walkingBubble(person: SnapPerson): SnapBubble | undefined {
  if (person.status === 'stopped') return { text: '×', kind: 'stop' }
  return person.status === 'working' && !person.vanishes ? { text: person.activity, kind: 'say' } : undefined
}

export function bubbleOf(person: SnapPerson, isWalking: boolean): SnapBubble | undefined {
  const bubble = isWalking ? walkingBubble(person) : person.rest.bubble
  return bubble === undefined ? undefined : { kind: bubble.kind, text: clip(bubble.text, BUBBLE_MAX) }
}

export function isNewer(previous: Snapshot | undefined, next: Snapshot): boolean {
  return previous === undefined || next.startedAt !== previous.startedAt || next.version > previous.version
}

export function isReadable(snapshot: { format?: unknown }): boolean {
  return snapshot.format === SNAPSHOT_FORMAT
}
