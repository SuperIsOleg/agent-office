import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { AgentSpawnInput, CommandRunInput, On, RenderSurface, ToolCallArgs } from 'claude-code'

import { avatarPose, lookOf, roomLayers } from '../hooks/art'
import { KIT } from '../hooks/kit'
import {
  BLOCKED,
  BLOCKED_EDGES,
  BOSS_DESK,
  COFFEE_SPOTS,
  EDGES,
  FLOOR,
  GRID_H,
  GRID_W,
  LAPTOP_SPOTS,
  LOUNGE_SPOTS,
  MEETING_SEATS,
  NEEDS_SUPPORT,
  OVERFLOW_SPOTS,
  PORCH,
  SEAT_TILES,
  STUDY_SPOTS,
  SUPPORTS,
  WALLS,
  queueTile,
  wallSlots,
} from '../hooks/layout'
import { agentRefOf, answerText, firstNameOf, installPathsOf, langOf, newestVersion, nodeCandidates, passwdNameOf, pluginDirsOf, problemText, sessionLabel, ticketOf, hostPathsOf, nextVersion, officeUrl, readInbox, readPortFile, safeSegment, sayShowing, userLabelOf } from '../hooks/office-host'
import { describeTool, effortFromDefinition, effortLabel, parseResult, roleOf, routeOf } from '../hooks/roles'
import { SNAPSHOT_FORMAT, bubbleOf, buildSnapshot, isNewer, isReadable } from '../hooks/snapshot'
import type { SnapPerson, SnapScreen, Snapshot } from '../hooks/snapshot'
import { POSES } from '../hooks/sprites'
import type { PoseId } from '../hooks/sprites'
import { DESKS, DOOR, IDLE_COORDINATOR, RECENT_KEPT, autoOpenOf, isStaff, canStop, completeAgent, exitPath, findPath, isOutside, opensAt, spawnAgent, stepAgents } from '../hooks/world'
import { kitSvg } from '../scripts/catalog'
import { startDemo } from '../web/src/demo'
import { barHtml, logHtml, nextOpen, openList, tabTitle } from '../web/src/hud-text'
import { hitsAt } from '../web/src/pick'
import { stepPeople, syncPeople } from '../web/src/people'
import type { Shown } from '../web/src/people'
import { isSeated, propsOf } from '../web/src/props'
import type { OfficeAgent, OfficeCoordinator, OfficeEvent, OfficeTile } from '../types'

const AT = (x: number, y: number) => `${x},${y}`
const OUT = DOOR.x + 1

const PANE = 'agent-office'

const DATA = '/data/agent-office'
const SESSION = 's-office'
const DIR = `${DATA}/office/${SESSION}`
const NODE = '/opt/homebrew/bin/node'
const PORT = 43123

const PROPS = {
  title: 'Офис',
  isFocused: false,
  bodyColumns: 66,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 60 },
  view: {},
} as const

const MOUNT = {
  plugin: 'agent-office',
  component: 'Pane',
  requestId: PANE,
  props: PROPS,
  viewport: { columns: 200, rows: 60, isFullscreen: true },
} as const

type World = { opened: () => number; clock: MockClock; stops: () => string[]; state: Seen }

function world(on: On, spawns: Record<string, string>, surfaces: readonly RenderSurface[] = ['desktop']): World {
  let opens = 0
  const stops: string[] = []
  const queue = Object.entries(spawns)
  const clock = mock.clock(on, { now: 1_000_000 })
  const state = watchState(on)
  on('agent.spawn', () => {
    const [agentId, model] = queue.shift() ?? ['none', 'claude-haiku-4-5']
    return { model, agentId }
  })
  on('session.surfaces', () => ({ value: surfaces }))
  on('ui.open', () => {
    opens += 1
    return { value: { isPlaced: true } }
  })
  on('tool.call', ($, e) => {
    if (String(e.tool) === 'TaskStop') stops.push(String((e as unknown as Record<string, unknown>)['task_id']))
    return { result: {} }
  })
  on('turn.complete', () => ({ text: '' }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  return { opened: () => opens, clock, stops: () => stops, state }
}

type Host = {
  files: Map<string, string>
  writes: string[]
  moves: [string, string][]
  runs: string[][]
  spawns: string[][]
  token: () => string
  release: () => void
  stop: (index: number) => void
  published: () => Snapshot
}

type HostOptions = {
  canRename?: boolean
  hasNode?: boolean
  nodeStarts?: boolean
  canOpen?: boolean
  branch?: () => string
  nodes?: Record<string, string>
  python?: string
  env?: Record<string, string>
  language?: string
  fullName?: string
  dirs?: Record<string, string[]>
  serverError?: string
}

function host(on: On, options: HostOptions = {}): Host {
  const files = new Map<string, string>()
  const writes: string[] = []
  const moves: [string, string][] = []
  const runs: string[][] = []
  const spawns: string[][] = []
  let token = ''
  const gates: (() => void)[] = []
  const ran = (exitCode: number) => ({ value: { exitCode, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  const nodes = options.nodes ?? (options.hasNode === false ? {} : { [NODE]: 'v22.11.0' })
  const python = options.python ?? 'Python 3.12.1'
  on('env.get', ($, e) => ({ value: e.name === 'CLAUDE_PLUGIN_DATA' ? DATA : options.env?.[e.name] }))
  on('settings.read', () => ({ value: options.language === undefined ? {} : { language: options.language } }))
  on('fs.list', ($, e) => {
    const names = options.dirs?.[e.path]
    if (names === undefined) throw new Error('ENOENT')
    return { value: names.map(name => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })) }
  })
  on('session.id', () => ({ value: SESSION }))
  on('fs.write', ($, e) => {
    writes.push(e.path)
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.read', ($, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.exists', ($, e) => ({ value: e.path in nodes || files.has(e.path) }))
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    if (e.argv[1] === '--version') {
      const version = e.argv[0] === 'python3' ? python : nodes[e.argv[0] ?? '']
      return version ? { value: { exitCode: 0, stdout: `${version}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } : ran(127)
    }
    if (e.argv[0] === 'id' && options.fullName !== undefined) return { value: { exitCode: 0, stdout: `${options.fullName}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (e.argv[0] === 'open') return ran(options.canOpen === true ? 0 : 1)
    if (e.argv[0] === 'git' && options.branch !== undefined) return { value: { exitCode: 0, stdout: `${options.branch()}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    const [command, , from, to] = e.argv
    const text = from !== undefined ? files.get(from) : undefined
    if (command !== '/bin/mv' || options.canRename === false || from === undefined || text === undefined || to === undefined) return ran(1)
    files.set(to, text)
    files.delete(from)
    moves.push([from, to])
    return ran(0)
  })
  on('process.spawn', async function* ($, e) {
    spawns.push([...e.argv])
    if (e.argv[0] !== 'python3' && options.nodeStarts === false) throw new Error('node is broken')
    if (options.serverError !== undefined) {
      yield { stream: 'stderr' as const, text: options.serverError }
      return { value: { code: 1, signal: null } }
    }
    token = e.argv[e.argv.indexOf('--token') + 1] ?? ''
    files.set(`${DIR}/server.json`, JSON.stringify({ port: PORT, token, pid: 7 }))
    const gate = new Promise<void>(resolve => gates.push(resolve))
    yield { stream: 'stdout' as const, text: `ready ${PORT}\n` }
    await gate
    return { value: { code: 0, signal: null } }
  })
  return {
    files,
    writes,
    moves,
    runs,
    spawns,
    token: () => token,
    release: () => gates.forEach(open => open()),
    stop: (index: number) => gates[index]?.(),
    published: () => JSON.parse(files.get(`${DIR}/state.json`) ?? '{}') as Snapshot,
  }
}

type Seen = Map<string, unknown>

function watchState(on: On): Seen {
  const latest: Seen = new Map()
  on('state.set', async ($, e, next) => {
    const result = await next(e)
    const write = e as unknown as { plugin: string; key: string; value: unknown }
    const landed = (result as { value?: { isSet?: boolean } }).value?.isSet !== false
    if (write.plugin === 'agent-office' && landed) latest.set(write.key, write.value)
    return result
  })
  return latest
}

function stateOf<T>(seen: World, key: string, fallback: T): T {
  return (seen.state.get(key) as T | undefined) ?? fallback
}

function snap(seen: World): Snapshot {
  return buildSnapshot({
    version: 1,
    now: seen.clock.now(),
    startedAt: stateOf(seen, 'startedAt', 0),
    agents: stateOf<Record<string, OfficeAgent>>(seen, 'agents', {}),
    coordinator: stateOf<OfficeCoordinator>(seen, 'coordinator', IDLE_COORDINATOR),
    events: stateOf<OfficeEvent[]>(seen, 'events', []),
  })
}

function said(seen: World): string {
  return stateOf<OfficeEvent[]>(seen, 'events', [])
    .map(event => event.text)
    .join('\n')
}

async function rows($: Engine): Promise<string> {
  const ui = await $.ui.mount({ ...MOUNT, surface: 'terminal' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  const text = (await ui.findAll({ type: 'Text' })).map(row => row.text).join('\n')
  await ui.unmount()
  return text
}

async function pane($: Engine): Promise<{ text: string; buttons: string[]; keys: string[] }> {
  const ui = await $.ui.mount({ ...MOUNT, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  const lines = (await ui.findAll({ type: 'Text' })).map(row => row.text)
  const links = (await ui.findAll({ type: 'Markdown' })).map(block => String(block.props['text']))
  const text = [...lines, ...links].join('\n')
  const found = await ui.findAll({ type: 'Button' })
  await ui.unmount()
  return { text, buttons: found.map(button => String(button.props['label'])), keys: found.map(button => String(button.key)) }
}

function panes(on: On): { isOpen: boolean } {
  const state = { isOpen: false }
  on('ui.panes', () => ({ value: state.isOpen ? [{ id: PANE, title: 'Офис', isShown: true, isFocused: false, isPlaced: true }] : [] }))
  on('ui.close', () => {
    state.isOpen = false
    return { value: undefined }
  })
  return state
}

function person(s: Snapshot, id: string): SnapPerson | undefined {
  return id === 'coordinator' ? s.boss : s.people.find(one => one.id === id)
}

function isWalking(p: SnapPerson): boolean {
  return p.path.length > 0
}

function tile(s: Snapshot, id: string): string {
  const p = person(s, id)
  return p !== undefined ? AT(p.tile[0], p.tile[1]) : 'absent'
}

function pose(s: Snapshot, id: string): string {
  const p = person(s, id)
  if (p === undefined) return 'absent'
  return isWalking(p) ? p.gait : p.rest.pose
}

function goal(s: Snapshot, id: string): string {
  const p = person(s, id)
  if (p === undefined) return 'absent'
  return isWalking(p) ? 'walk' : p.rest.goal
}

function status(s: Snapshot, id: string): string {
  return person(s, id)?.status ?? 'absent'
}

function motion(s: Snapshot, id: string): string {
  return POSES[pose(s, id) as PoseId]?.motion ?? 'absent'
}

function tagText(s: Snapshot, id: string): string {
  const p = person(s, id)
  if (p === undefined || isOutside({ x: p.tile[0], y: p.tile[1] })) return ''
  return `${p.name}${p.completed > 0 ? `✓${p.completed}` : ''}`
}

function bubbles(s: Snapshot, kind?: string): string[] {
  return [s.boss, ...s.people].flatMap(p => {
    const bubble = bubbleOf(p, isWalking(p))
    return bubble !== undefined && (kind === undefined || bubble.kind === kind) ? [bubble.text] : []
  })
}

function onScreens(s: Snapshot): SnapScreen[] {
  return [s.boss, ...s.people].flatMap(p => (!isWalking(p) && p.rest.screen !== undefined ? [p.rest.screen] : []))
}

function screens(s: Snapshot): string[] {
  return onScreens(s).map(screen => screen.kind)
}

function isSameTile(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y
}

let spawnCount = 0

function spawn(subagentType: string, description: string): AgentSpawnInput {
  spawnCount += 1
  return {
    tool_use_id: `toolu_${spawnCount}`,
    prompt: 'x',
    description,
    subagentType,
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  }
}

function inAgent(agentId: string, input: ToolCallArgs): ToolCallArgs {
  return { ...input, agentId } as ToolCallArgs
}

function finish(agentId: string, answer: string, usage?: Record<string, unknown>) {
  return {
    answer,
    durationMs: 5,
    isAborted: false,
    turnId: `t-${agentId}`,
    agentId,
    reason: 'answer' as const,
    ...(usage !== undefined ? { usage: usage as never } : {}),
  }
}

const officeCommand: CommandRunInput = {
  command: 'office',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 200 },
}

const NEEDS_DECISION = [
  'Нашёл два варианта.',
  '```result',
  'agent: qa-tester',
  'status: needs_decision',
  'summary: нужен выбор по кейсу 3',
  'needs_decision:',
  '  - {id: d1, question_ru: "Проверять на iPad?", options: ["Да", "Нет"]}',
  '```',
].join('\n')

const DONE = ['```result', 'agent: reviewer', 'status: ok', 'summary: замечаний нет', '```'].join('\n')
const QUESTIONS_RESULT = [
  '```result',
  'status: needs_decision',
  'needs_decision:',
  '  - {id: d1, question_ru: "Проверять на iPad?", options: ["Да (Recommended)", "Нет"]}',
  '  - {id: d2, question_ru: "Снять видео?", options: ["Да", "Нет, только скрин"]}',
  '```',
].join('\n')
const FAILED = ['```result', 'agent: ios-engineer', 'status: failed', 'summary: сборка упала', '```'].join('\n')

describe('Офис: world to snapshot', () => {
  test('a spawn opens the door: the person appears outside, walks in, and the door closes behind them', async ($, on) => {
    const seen = world(on, { 'eng-1': 'claude-opus-5-5', 'qa-1': 'claude-sonnet-4-6' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Тесты PROJ-1739'))
    await $.agent.spawn(spawn('ios-team:qa-tester', 'QA PROJ-1739'))
    expect(seen.opened()).toBe(1)
    let s = snap(seen)
    expect(s.people.map(one => one.name)).toEqual(['ios-engineer', 'qa-tester'])
    expect(s.boss.name).toBe('coordinator')
    expect(s.door).toBe(true)
    expect([tile(s, 'eng-1'), tile(s, 'coordinator'), tile(s, 'qa-1')]).toEqual([AT(OUT, 12), AT(OUT, 11), AT(OUT, 10)])
    expect(tagText(s, 'eng-1')).toBe('')
    expect(pose(s, 'eng-1')).toBe('walk')
    expect(status(s, 'eng-1')).toBe('working')
    const text = await rows($)
    expect(text).toContain('ios-engineer · Opus')
    expect(text).toContain('qa-tester · Sonnet')
    expect(text).toContain(' o>  ')
    expect(text).toContain('walking')
    await seen.clock.advance(500)
    s = snap(seen)
    expect([tile(s, 'eng-1'), tile(s, 'coordinator'), tile(s, 'qa-1')]).toEqual([AT(DOOR.x, 12), AT(OUT, 12), AT(OUT, 11)])
    expect(tagText(s, 'eng-1')).toBe('ios-engineer')
    expect(tagText(s, 'qa-1')).toBe('')
    expect(person(s, 'eng-1')?.path.length).toBeGreaterThan(0)
    await seen.clock.advance(1_000)
    s = snap(seen)
    expect(s.door).toBe(true)
    expect(tile(s, 'qa-1')).toBe(AT(DOOR.x, 12))
    await seen.clock.advance(1_000)
    s = snap(seen)
    expect(s.door).toBe(false)
    expect(tagText(s, 'coordinator')).toBe('coordinator')
    await seen.clock.advance(15_000)
    s = snap(seen)
    expect(pose(s, 'eng-1')).toBe('type')
    expect(goal(s, 'eng-1')).toBe('desk')
    expect(pose(s, 'qa-1')).not.toMatch(/^walk/)
    expect(s.door).toBe(false)
    expect(said(seen)).toContain('arrived: Тесты PROJ-1739')
  })

  test('a walking person carries the whole route and the pose it will take on arrival', async () => {
    const made = spawnAgent({}, {}, 'eng-1', { type: 'ios-team:ios-engineer', description: 'Код', model: 'Opus', background: true, brief: 'x' }, 5_000, { ...IDLE_COORDINATOR, hasEntered: true })
    const agent = made.agents['eng-1']
    if (agent === undefined) throw new Error('no agent')
    const desk = DESKS[agent.desk]
    if (desk === undefined) throw new Error('no desk')
    const s = buildSnapshot({ version: 3, now: 5_000, startedAt: 4_000, agents: made.agents, coordinator: IDLE_COORDINATOR, events: made.events })
    const eng = person(s, 'eng-1')
    expect(eng?.tile).toEqual([agent.pos.x, agent.pos.y])
    expect(eng?.path).toEqual(agent.path.map(step => [step.x, step.y]))
    expect(eng?.path[eng.path.length - 1]).toEqual([desk.seat.x, desk.seat.y])
    expect(eng?.movedAt).toBe(agent.movedAt)
    expect(eng?.rest.goal).toBe('desk')
    expect(eng?.rest.facing).toBe(desk.facing)
    expect(eng?.rest.depth).toBe(desk.seat.x + desk.seat.y + 0.5)
    expect(s.stepMs).toBe(500)
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
  })

  test('the snapshot format: versioned, with people, the boss, the door, the HUD and the last events', async () => {
    const s = buildSnapshot({ version: 9, now: 1_000, startedAt: 500, agents: {}, coordinator: IDLE_COORDINATOR, events: [] })
    expect(Object.keys(s)).toEqual(['format', 'version', 'at', 'startedAt', 'stepMs', 'people', 'boss', 'door', 'hud', 'events', 'acks'])
    expect([s.format, s.version, s.at, s.startedAt]).toEqual([SNAPSHOT_FORMAT, 9, 1_000, 500])
    expect(Object.keys(s.hud)).toEqual(['spent', 'tokens', 'runs', 'approvals', 'flagged'])
    expect(Object.keys(s.boss)).toEqual(['id', 'type', 'name', 'status', 'chip', 'dot', 'completed', 'model', 'activity', 'title', 'tile', 'path', 'movedAt', 'gait', 'vanishes', 'rest', 'card'])
    expect(s.people).toEqual([])
    expect(s.hud.spent).toBe(0)
    expect(JSON.stringify(s)).not.toMatch(/budget|remaining/i)
  })

  test('a tool call makes the agent work, with an English activity bubble and the matching screen', async ($, on) => {
    const seen = world(on, { 'eng-1': 'claude-opus-5-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Тесты'))
    await seen.clock.advance(15_000)
    await $.tool.call(inAgent('eng-1', { tool: 'Bash', command: 'cd /tmp/wt && xcodebuild -scheme App-PR test -quiet' }))
    let s = snap(seen)
    expect(status(s, 'eng-1')).toBe('working')
    expect(pose(s, 'eng-1')).toBe('type')
    expect(bubbles(s)).toContain('Собирает и гоняет тесты')
    expect(tagText(s, 'eng-1')).toBe('ios-engineer')
    expect(screens(s)).toContain('term')
    let text = await rows($)
    expect(text).toContain('Собирает и гоняет тесты')
    expect(text).toContain(' o-[]')
    await $.tool.call(inAgent('eng-1', { tool: 'Edit', file_path: '/tmp/wt/Modules/HomeFeature/HomeModel.swift', old_string: 'a', new_string: 'b' }))
    s = snap(seen)
    expect(bubbles(s)).toContain('Правит HomeModel.swift')
    expect(pose(s, 'eng-1')).toBe('typeFast')
    text = await rows($)
    expect(text).toContain('Правит HomeModel.swift')
    await $.tool.call({ tool: 'Read', file_path: '/Users/dev/app/CLAUDE.md' })
    s = snap(seen)
    expect(bubbles(s)).toContain('Читает CLAUDE.md')
    expect(pose(s, 'coordinator')).toBe('read')
  })

  test('session text crosses raw, bubbles are clipped to 28 characters and the card keeps up to 60', async ($, on) => {
    const seen = world(on, { 'ex-1': 'claude-haiku-4-5' })
    await $.agent.spawn(spawn('general-purpose', 'map <Home> & "nav"'))
    await seen.clock.advance(15_000)
    await $.tool.call(inAgent('ex-1', { tool: 'Read', file_path: '/wt/<b>&"Very".LongFileNameForTheClipCheck.swift' }))
    const s = snap(seen)
    expect(tagText(s, 'ex-1')).toBe('general-purpose')
    expect(person(s, 'ex-1')?.model).toBe('Haiku')
    expect(person(s, 'ex-1')?.title).toContain('task: map <Home> & "nav"')
    expect(JSON.stringify(s)).not.toContain('&amp;')
    const reading = bubbles(s).find(text => text.startsWith('Читает')) ?? ''
    expect(reading.startsWith('Читает <b>&"Very"')).toBe(true)
    expect(reading.endsWith('…')).toBe(true)
    expect(Array.from(reading).length).toBeLessThanOrEqual(28)
    expect(person(s, 'ex-1')?.activity).toBe('Читает <b>&"Very".LongFileNameForTheClipCheck.swift')
  })

  test('an agent with no tool call for 20 seconds sits thinking', async ($, on) => {
    const seen = world(on, { 'arch-1': 'claude-opus-5-5' })
    await $.agent.spawn(spawn('ios-team:reviewer', 'План'))
    await seen.clock.advance(12_000)
    await $.tool.call(inAgent('arch-1', { tool: 'Read', file_path: '/wt/Project.swift' }))
    await seen.clock.advance(10_000)
    expect(status(snap(seen), 'arch-1')).toBe('working')
    await seen.clock.advance(15_000)
    const s = snap(seen)
    expect(status(s, 'arch-1')).toBe('thinking')
    expect(pose(s, 'arch-1')).toBe('think')
    expect(bubbles(s)).toContain('Думает…')
    expect(onScreens(s).some(screen => screen.thinking)).toBe(true)
    const text = await rows($)
    expect(text).toContain('thinking')
    expect(text).toContain(' o .:')
    await $.tool.call(inAgent('arch-1', { tool: 'Grep', pattern: 'Router', path: '/wt/Modules' } as unknown as ToolCallArgs))
    expect(status(snap(seen), 'arch-1')).toBe('working')
  })

  test('a long tool run keeps the agent working instead of thinking', async ($, on) => {
    let release: () => void = () => undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    on('tool.call', { tool: 'Bash' }, async () => {
      await gate
      return { result: { stdout: '', stderr: '', interrupted: false } as never }
    })
    const seen = world(on, { 'eng-1': 'claude-opus-5-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Сборка'))
    await seen.clock.advance(15_000)
    const build = $.tool.call(inAgent('eng-1', { tool: 'Bash', command: 'xcodebuild -scheme App-PR test' }))
    await seen.clock.advance(60_000)
    expect(status(snap(seen), 'eng-1')).toBe('working')
    release()
    await build
    await seen.clock.advance(25_000)
    expect(status(snap(seen), 'eng-1')).toBe('thinking')
  })

  test('needs_decision raises a hand with a question, then the agent goes for coffee', async ($, on) => {
    const seen = world(on, { 'qa-1': 'claude-sonnet-4-6', 'an-1': 'claude-sonnet-4-6' })
    await $.agent.spawn(spawn('ios-team:qa-tester', 'QA'))
    await $.agent.spawn(spawn('ios-team:analytics', 'События'))
    await seen.clock.advance(15_000)
    await $.turn.complete(finish('qa-1', NEEDS_DECISION))
    let s = snap(seen)
    expect(person(s, 'qa-1')?.activity).toContain('Проверять на iPad?')
    expect(pose(s, 'qa-1')).toBe('raise')
    expect(bubbles(s, 'ask')).toEqual(['?'])
    expect(s.hud.approvals).toBe(1)
    let text = await rows($)
    expect(text).toContain('Проверять на iPad?')
    expect(text).toContain('waiting for a decision')
    expect(text).toContain(' \\o ?')
    await seen.clock.advance(20_000)
    s = snap(seen)
    expect(pose(s, 'qa-1')).toBe('cup')
    expect(goal(s, 'qa-1')).toBe('coffee')
    expect(bubbles(s, 'ask')).toEqual(['?'])
    expect(COFFEE_SPOTS.map(spot => AT(spot.x, spot.y))).toContain(tile(s, 'qa-1'))
    expect(person(s, 'qa-1')?.rest.facing).toBe('back')
    text = await rows($)
    expect(text).toContain(' o_u ')
    await $.turn.complete(finish('an-1', ['```result', 'status: blocked', 'summary: нет доступа', '```'].join('\n')))
    await seen.clock.advance(20_000)
    s = snap(seen)
    expect(goal(s, 'an-1')).toBe('coffee')
    expect(bubbles(s, 'ask')).toHaveLength(2)
    await $.tool.call(inAgent('qa-1', { tool: 'mcp__Claude_Code_iOS_Simulator__control', action: 'tap' } as unknown as ToolCallArgs))
    await seen.clock.advance(20_000)
    await $.tool.call(inAgent('qa-1', { tool: 'mcp__Claude_Code_iOS_Simulator__control', action: 'swipe' } as unknown as ToolCallArgs))
    s = snap(seen)
    expect(goal(s, 'qa-1')).toBe('desk')
    expect(pose(s, 'qa-1')).toBe('phone')
    expect(bubbles(s)).toContain('Нажимает в симуляторе')
  })

  test('done staff jump, rest on the sofa, then sit idle at their own desk and stay', async ($, on) => {
    const seen = world(on, { 'rev-1': 'claude-sonnet-4-6' })
    await $.agent.spawn(spawn('ios-team:reviewer', 'Ревью'))
    await seen.clock.advance(15_000)
    const desk = tile(snap(seen), 'rev-1')
    await $.turn.complete(finish('rev-1', DONE))
    let s = snap(seen)
    expect(pose(s, 'rev-1')).toBe('happy')
    expect(motion(s, 'rev-1')).toBe('jump')
    expect(bubbles(s)).toEqual(['Done'])
    expect(screens(s)).toContain('ok')
    const text = await rows($)
    expect(text).toContain('замечаний нет')
    expect(text).toContain(' \\o/ ')
    await seen.clock.advance(20_000)
    s = snap(seen)
    expect(pose(s, 'rev-1')).toBe('sofa')
    expect(goal(s, 'rev-1')).toBe('lounge')
    expect(motion(s, 'rev-1')).toBe('bob')
    expect(await rows($)).toContain(' o_h ')
    await seen.clock.advance(70_000)
    s = snap(seen)
    expect(tile(s, 'rev-1')).toBe(desk)
    expect(goal(s, 'rev-1')).toBe('desk')
    expect(pose(s, 'rev-1')).toBe('bossCup')
    expect(bubbles(s)).toEqual([])
    expect(said(seen)).not.toContain('left: done')
    expect(person(s, 'rev-1')?.dot).toBe('#9aa1ad')
    await seen.clock.advance(600_000)
    expect(tile(snap(seen), 'rev-1')).toBe(desk)
  })

  test('a done contractor jumps, walks out through the door, and its run stays in the history', async ($, on) => {
    const seen = world(on, { 'gp-1': 'claude-haiku-4-5' })
    await $.agent.spawn(spawn('general-purpose', 'Сводка логов'))
    await seen.clock.advance(15_000)
    await $.turn.complete(finish('gp-1', DONE))
    let s = snap(seen)
    expect(pose(s, 'gp-1')).toBe('happy')
    expect(s.door).toBe(false)
    let sawWalk = false
    let sawOpen = false
    for (let step = 0; step < 60 && person(s, 'gp-1') !== undefined; step += 1) {
      await seen.clock.advance(500)
      s = snap(seen)
      if (goal(s, 'gp-1') === 'walk') {
        sawWalk = true
        expect(person(s, 'gp-1')?.vanishes).toBe(true)
        expect(bubbles(s)).toEqual([])
      }
      if (s.door) sawOpen = true
    }
    expect(sawWalk).toBe(true)
    expect(sawOpen).toBe(true)
    expect(person(s, 'gp-1')).toBeUndefined()
    expect(s.door).toBe(false)
    expect(said(seen)).toContain('left: done')
    expect(s.hud.runs).toBe(1)
  })

  test('failed holds its head with a red bang and an error screen', async ($, on) => {
    const seen = world(on, { 'eng-1': 'claude-opus-5-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    await seen.clock.advance(15_000)
    await $.turn.complete(finish('eng-1', FAILED))
    await seen.clock.advance(30_000)
    const s = snap(seen)
    expect(pose(s, 'eng-1')).toBe('fail')
    expect(motion(s, 'eng-1')).toBe('shake')
    expect(bubbles(s, 'fail')).toEqual(['!'])
    expect(screens(s)).toContain('err')
    expect(s.hud.flagged).toBe(1)
    const text = await rows($)
    expect(text).toContain('сборка упала')
    expect(text).toContain('(o) !')
  })

  test('cost totals add up from turn usage at each model price', async ($, on) => {
    const seen = world(on, { 'eng-1': 'claude-opus-5-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    await seen.clock.advance(15_000)
    await $.turn.complete(
      finish('eng-1', DONE, { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }),
    )
    await $.turn.complete({
      answer: 'Готово.',
      durationMs: 5,
      isAborted: false,
      turnId: 'main-1',
      reason: 'answer',
      usage: { input_tokens: 500_000, output_tokens: 50_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-sonnet-4-6' },
    })
    const s = snap(seen)
    expect(person(s, 'eng-1')?.title).toContain('≈$6.40')
    expect(s.boss.title).toContain('≈$1.50')
    expect(Math.abs(s.hud.spent - 7.9)).toBeLessThan(1e-9)
    expect(s.hud.tokens).toBeGreaterThanOrEqual(2_600_000)
    expect(s.hud.tokens).toBeLessThan(2_800_000)
    expect(s.hud.runs).toBe(1)
    const text = await rows($)
    expect(text).toContain('≈$7.90')
    expect(text).toContain('coordinator · Sonnet · done · ≈$1.50')
    expect((await pane($)).text).toContain('≈$7.90')
  })

  test('the coordinator stands with a question while it asks you', async ($, on) => {
    let release: () => void = () => undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    on('tool.call', { tool: 'AskUserQuestion' }, async () => {
      await gate
      return { result: { questions: [], answers: {} } }
    })
    const seen = world(on, {})
    const asking = $.tool.call({
      tool: 'AskUserQuestion',
      questions: [{ question: 'Начинаем?', header: 'Старт', multiSelect: false, options: [{ label: 'Да', description: 'да' }, { label: 'Нет', description: 'нет' }] }],
    })
    await seen.clock.settle()
    let s = snap(seen)
    expect([s.boss.activity, s.boss.card.asks[0]?.question]).toEqual(['Задаёт тебе вопрос', 'Начинаем?'])
    expect(pose(s, 'coordinator')).toBe('standRaise')
    expect(bubbles(s, 'ask')).toEqual(['?'])
    expect(s.hud.approvals).toBe(1)
    const text = await rows($)
    expect(text).toContain('Задаёт тебе вопрос')
    expect(text).toContain('waiting for you')
    expect(text).toContain(' \\o ?')
    release()
    await asking
    s = snap(seen)
    expect(pose(s, 'coordinator')).toBe('type')
    expect(bubbles(s)).toContain('Получил ответ')
  })

  test('/office opens the pane when it is hidden and never closes it', async ($, on) => {
    let opens = 0
    let closes = 0
    let isOpen = false
    on('ui.panes', () => ({
      value: isOpen ? [{ id: PANE, title: 'Офис', isShown: true, isFocused: false, isPlaced: true }] : [],
    }))
    on('ui.open', () => {
      opens += 1
      isOpen = true
      return { value: { isPlaced: true } }
    })
    on('ui.close', () => {
      closes += 1
      isOpen = false
      return { value: undefined }
    })
    mock.clock(on, { now: 5_000 })
    const first = await $.command.run(officeCommand)
    expect(first.text).toContain('/office')
    expect(first.text).not.toContain('http://')
    await $.command.run(officeCommand)
    expect(opens).toBe(1)
    expect(closes).toBe(0)
    isOpen = false
    await $.command.run(officeCommand)
    expect([opens, closes]).toEqual([2, 0])
  })

  test('a main-screen terminal gets a hint instead of an unasked pane', async ($, on) => {
    const seen = world(on, { 'wt-1': 'claude-haiku-4-5' }, ['terminal'])
    await $.agent.spawn(spawn('ios-team:wt-keeper', 'worktree'))
    expect(seen.opened()).toBe(0)
    expect(await rows($)).toContain('wt-keeper · Haiku')
  })

  test('fourteen busy agents: twelve are in the office, each heading for its own tile, and the snapshot stays small', async ($, on) => {
    const spawns: Record<string, string> = {}
    const types = ['ios-team:ios-engineer', 'ios-team:architect', 'ios-team:qa-tester', 'ios-team:reviewer', 'ios-team:analytics', 'ios-team:wt-keeper', 'ios-team:publisher', 'Explore']
    for (let index = 0; index < 14; index += 1) spawns[`a-${index}`] = ['claude-opus-5-5', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-fable-1'][index % 4] ?? 'x'
    const seen = world(on, spawns)
    for (let index = 0; index < 14; index += 1) {
      await $.agent.spawn(spawn(types[index % types.length] ?? 'Explore', 'очень длинное описание задачи для проверки обрезки текста и размера'))
    }
    await seen.clock.advance(30_000)
    for (let index = 0; index < 14; index += 1) {
      for (let step = 0; step < 9; step += 1) {
        await $.tool.call(inAgent(`a-${index}`, { tool: 'Bash', command: `xcodebuild -workspace App.xcworkspace -scheme App-PR-${index}-${step} test` }))
      }
    }
    await $.turn.complete(finish('a-12', NEEDS_DECISION))
    await $.turn.complete(finish('a-13', FAILED))
    const s = snap(seen)
    expect(s.people).toHaveLength(12)
    const ends = s.people.map(one => {
      const end = one.path[one.path.length - 1] ?? one.tile
      return AT(end[0], end[1])
    })
    expect(new Set(ends).size).toBe(12)
    expect(JSON.stringify(s).length).toBeLessThan(40_000)
    expect(s.events.length).toBeLessThanOrEqual(6)
  })

  test('name tags are a kebab-case type name with a status dot and ✓N completed runs; bubbles are English verbs or a mark', async ($, on) => {
    const roles: [string, string, string][] = [
      ['eng-1', 'ios-team:ios-engineer', 'ios-engineer'],
      ['arch-1', 'ios-team:architect', 'architect'],
      ['qa-1', 'ios-team:qa-tester', 'qa-tester'],
      ['rev-1', 'ios-team:reviewer', 'reviewer'],
      ['an-1', 'ios-team:analytics', 'analytics'],
      ['wt-1', 'ios-team:wt-keeper', 'wt-keeper'],
      ['pub-1', 'ios-team:publisher', 'publisher'],
      ['ex-1', 'Explore', 'explore'],
      ['gp-1', 'general-purpose', 'general-purpose'],
      ['wf-1', 'workflow-subagent', 'workflow-subagent'],
    ]
    const spawns: Record<string, string> = {}
    for (const [id] of roles) spawns[id] = 'claude-opus-5-5'
    const seen = world(on, spawns)
    for (const [, type] of roles) await $.agent.spawn(spawn(type, 'задача'))
    await seen.clock.advance(40_000)
    for (const [id] of roles) await $.tool.call(inAgent(id, { tool: 'Bash', command: `swift build --product ${id}` }))
    await $.turn.complete(finish('qa-1', NEEDS_DECISION))
    await $.turn.complete(finish('rev-1', FAILED))
    await $.turn.complete(finish('wt-1', DONE))
    await seen.clock.advance(2_000)
    const s = snap(seen)
    for (const [id, , name] of roles) expect(tagText(s, id).replace(/✓\d+$/, '')).toBe(name)
    expect(tagText(s, 'coordinator')).toBe('coordinator')
    expect(tagText(s, 'wt-1')).toBe('wt-keeper✓1')
    expect(tagText(s, 'eng-1')).toBe('ios-engineer')
    expect(person(s, 'eng-1')?.dot).toBe('#34c76f')
    expect(person(s, 'qa-1')?.dot).toBe('#f5b82e')
    expect(person(s, 'rev-1')?.dot).toBe('#ec4f4f')
    expect(person(s, 'wt-1')?.dot).toBe('#9aa1ad')
    const says = bubbles(s, 'say')
    expect(says.length).toBeGreaterThan(0)
    for (const text of says) expect(text).toMatch(/^(Собирает|Читает|Правит|Создаёт|Ищет|Смотрит|Нажимает|Поручает|Пишет|Думает|Выполняет|Проверяет)/)
    const marks = bubbles(s).filter(text => !says.includes(text))
    for (const mark of marks) expect(['?', '!', 'Done']).toContain(mark)
    expect(marks).toContain('?')
    expect(marks).toContain('!')
    expect(marks).toContain('Done')
  })

  test('every role wears its own outfit family and gear, and shows a role icon while it works', async ($, on) => {
    const roles: [string, string, string][] = [
      ['eng-1', 'ios-team:ios-engineer', 'hoodie'],
      ['qa-1', 'ios-team:qa-tester', 'street'],
      ['rev-1', 'ios-team:reviewer', 'suit'],
      ['an-1', 'ios-team:analytics', 'creative'],
      ['wt-1', 'ios-team:wt-keeper', 'work'],
      ['pub-1', 'ios-team:publisher', 'smart'],
      ['gp-1', 'general-purpose', ''],
    ]
    for (const [id, type, family] of roles) if (family) expect([id, lookOf(id, type).outfit.family]).toEqual([id, family])
    expect(lookOf('coordinator', 'coordinator').outfit.family).toBe('suit')
    const helper = lookOf('gp-1', 'general-purpose').outfit.family
    expect(['suit', 'hoodie', 'smart', 'creative', 'street', 'accountant']).toContain(helper)
    expect(lookOf('gp-1', 'general-purpose').outfit.family).toBe(helper)
    expect(avatarPose(lookOf('eng-1', 'ios-team:ios-engineer'), 'type', 'back', 0)).toContain('#w-headphonesb')
    expect(avatarPose(lookOf('wt-1', 'ios-team:wt-keeper'), 'stand', 'front', 0)).toContain('#w-hardhat')
    expect(avatarPose(lookOf('coordinator', 'coordinator'), 'bossCup', 'back', 0)).toContain('#T-suit-b')
    const spawns: Record<string, string> = {}
    for (const [id] of roles) spawns[id] = 'claude-sonnet-4-6'
    const seen = world(on, spawns)
    for (const [, type] of roles) await $.agent.spawn(spawn(type, 'задача'))
    await seen.clock.advance(16_000)
    await $.tool.call(inAgent('eng-1', { tool: 'Bash', command: 'swift build' }))
    await $.tool.call(inAgent('an-1', { tool: 'Read', file_path: '/wt/Events.swift' }))
    let s = snap(seen)
    const icons = s.people.map(one => one.rest.icon)
    expect(icons).toContain('wrench')
    expect(icons).toContain('chart')
    expect(icons).toContain('bug')
    expect(pose(s, 'an-1')).toBe('tablet')
    await $.turn.complete(finish('qa-1', DONE))
    s = snap(seen)
    expect(s.people.map(one => one.rest.icon)).not.toContain('bug')
  })

  test('the pose and the screen follow the activity: reading, fast typing, browsing, terminal, phone', async ($, on) => {
    const seen = world(on, { 'eng-1': 'claude-opus-5-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    await seen.clock.advance(15_000)
    const cases: [ToolCallArgs, string, string][] = [
      [{ tool: 'Read', file_path: '/wt/A.swift' }, 'read', 'read'],
      [{ tool: 'Edit', file_path: '/wt/A.swift', old_string: 'a', new_string: 'b' }, 'typeFast', 'code'],
      [{ tool: 'WebFetch', url: 'https://example.com', prompt: 'x' }, 'browse', 'web'],
      [{ tool: 'Bash', command: 'make test' }, 'type', 'term'],
      [{ tool: 'mcp__Claude_Code_iOS_Simulator__control', action: 'tap' } as unknown as ToolCallArgs, 'phone', 'sim'],
    ]
    for (const [input, expected, screen] of cases) {
      await $.tool.call(inAgent('eng-1', input))
      const s = snap(seen)
      expect([screen, pose(s, 'eng-1')]).toEqual([screen, expected])
      expect(screens(s)).toContain(screen)
      expect(onScreens(s).find(one => one.kind === screen)?.working).toBe(true)
    }
  })

  test('Explore first studies the code at the flip chart with its real activity in the bubble, then sits down', async ($, on) => {
    const seen = world(on, { 'ex-1': 'claude-haiku-4-5' })
    await $.agent.spawn(spawn('Explore', 'Найти навигацию'))
    await seen.clock.advance(18_000)
    await $.tool.call(inAgent('ex-1', { tool: 'Glob', pattern: '**/*Router*.swift' } as unknown as ToolCallArgs))
    let s = snap(seen)
    expect(goal(s, 'ex-1')).toBe('board')
    expect(pose(s, 'ex-1')).toBe('study')
    expect(bubbles(s)).toContain(person(s, 'ex-1')?.activity ?? 'none')
    expect(bubbles(s)).not.toContain('Studying the code')
    await seen.clock.advance(30_000)
    s = snap(seen)
    expect(goal(s, 'ex-1')).toBe('desk')
    await $.tool.call(inAgent('ex-1', { tool: 'Read', file_path: '/wt/AppRouter.swift' }))
    expect(pose(snap(seen), 'ex-1')).toBe('read')
  })

  test('arrivals queue outside one tile apart, never share a tile, and the door stays open until the last one is in', async ($, on) => {
    const spawns: Record<string, string> = { 'r-1': 'claude-sonnet-4-6', 'r-2': 'claude-sonnet-4-6', 'r-3': 'claude-sonnet-4-6', 'x-1': 'claude-haiku-4-5' }
    const seen = world(on, spawns)
    await $.agent.spawn(spawn('ios-team:reviewer', 'слайс 1'))
    await $.agent.spawn(spawn('ios-team:reviewer', 'слайс 2'))
    await $.agent.spawn(spawn('ios-team:reviewer', 'слайс 3'))
    await $.agent.spawn(spawn('Explore', 'поиск'))
    const people = ['r-1', 'r-2', 'r-3', 'x-1', 'coordinator']
    let last = snap(seen)
    for (let step = 0; step < 14; step += 1) {
      const s = snap(seen)
      const tiles = people.map(id => tile(s, id))
      expect(new Set(tiles).size).toBe(tiles.length)
      const outside = people.filter(id => Number(tile(s, id).split(',')[0]) > DOOR.x)
      for (const id of outside) expect(tagText(s, id)).toBe('')
      if (outside.length > 0) expect(s.door).toBe(true)
      last = s
      await seen.clock.advance(500)
    }
    expect(last.door).toBe(false)
    const s = snap(seen)
    expect([tagText(s, 'r-1'), tagText(s, 'r-2'), tagText(s, 'r-3')]).toEqual(['reviewer', 'reviewer-2', 'reviewer-3'])
    await seen.clock.advance(20_000)
    const seated = snap(seen)
    const desks = ['r-1', 'r-2', 'r-3', 'x-1'].map(id => tile(seated, id))
    expect(new Set(desks).size).toBe(4)
    for (const id of ['r-1', 'r-2', 'r-3']) expect(DESKS.some(desk => AT(desk.seat.x, desk.seat.y) === tile(seated, id))).toBe(true)
  })

  test('staff keep a reserved desk: a stopped reviewer leaves, a contractor never takes the desk, and the next reviewer comes back to it', async ($, on) => {
    const spawns: Record<string, string> = { 'rev-1': 'claude-sonnet-4-6' }
    for (let index = 0; index < 12; index += 1) spawns[`gp-${index}`] = 'claude-haiku-4-5'
    spawns['rev-2'] = 'claude-sonnet-4-6'
    const seen = world(on, spawns)
    await $.agent.spawn(spawn('ios-team:reviewer', 'Ревью'))
    await seen.clock.advance(20_000)
    const desk = tile(snap(seen), 'rev-1')
    await $.turn.complete({ ...finish('rev-1', 'x'), isAborted: true, reason: 'aborted' as const })
    let s = snap(seen)
    expect(status(s, 'rev-1')).toBe('stopped')
    expect(bubbles(s, 'stop')).toEqual(['×'])
    await seen.clock.advance(20_000)
    s = snap(seen)
    expect(person(s, 'rev-1')).toBeUndefined()
    expect(said(seen)).toContain('left: stopped')
    for (let index = 0; index < 12; index += 1) {
      await $.agent.spawn(spawn('general-purpose', `задача ${index}`))
      await seen.clock.advance(1_000)
    }
    await seen.clock.advance(30_000)
    s = snap(seen)
    const contractors = s.people.filter(one => one.id.startsWith('gp-'))
    expect(contractors.map(one => AT(one.tile[0], one.tile[1]))).not.toContain(desk)
    const at = (one: SnapPerson) => ({ x: one.tile[0], y: one.tile[1] })
    const overflow = contractors.filter(one => MEETING_SEATS.some(seat => isSameTile(seat.tile, at(one))) || LAPTOP_SPOTS.some(spot => isSameTile(spot, at(one)))).map(one => one.id)
    expect(overflow.length).toBeGreaterThan(0)
    for (const id of overflow) await $.tool.call(inAgent(id, { tool: 'Read', file_path: '/wt/A.swift' }))
    s = snap(seen)
    for (const id of overflow) expect(['tablet', 'laptop']).toContain(pose(s, id))
    await $.agent.spawn(spawn('ios-team:reviewer', 'Ревью 2'))
    s = snap(seen)
    expect(Number(tile(s, 'rev-2').split(',')[0])).toBeGreaterThan(DOOR.x)
    await seen.clock.advance(30_000)
    expect(tile(snap(seen), 'rev-2')).toBe(desk)
  })

  test('a resumed staff member walks back from the sofa to the desk and works again', async ($, on) => {
    const seen = world(on, { 'eng-1': 'claude-opus-5-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    await seen.clock.advance(20_000)
    const desk = tile(snap(seen), 'eng-1')
    await $.turn.complete(finish('eng-1', DONE))
    await seen.clock.advance(20_000)
    expect(goal(snap(seen), 'eng-1')).toBe('lounge')
    await $.tool.call(inAgent('eng-1', { tool: 'Read', file_path: '/wt/A.swift' }))
    let s = snap(seen)
    expect(status(s, 'eng-1')).toBe('working')
    expect(goal(s, 'eng-1')).toBe('walk')
    expect(said(seen)).toContain('back to work')
    await seen.clock.advance(15_000)
    await $.tool.call(inAgent('eng-1', { tool: 'Edit', file_path: '/wt/A.swift', old_string: 'a', new_string: 'b' }))
    s = snap(seen)
    expect(tile(s, 'eng-1')).toBe(desk)
    expect(pose(s, 'eng-1')).toBe('typeFast')
  })

  test('failed staff hold their head at the desk; a failed contractor leaves with a slumped walk after a minute', async ($, on) => {
    const seen = world(on, { 'eng-1': 'claude-opus-5-5', 'gp-1': 'claude-haiku-4-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    await $.agent.spawn(spawn('general-purpose', 'Сводка'))
    await seen.clock.advance(20_000)
    await $.turn.complete(finish('eng-1', FAILED))
    await $.turn.complete(finish('gp-1', FAILED))
    await seen.clock.advance(50_000)
    let s = snap(seen)
    expect(pose(s, 'gp-1')).toBe('fail')
    let slumped = false
    for (let step = 0; step < 50 && person(s, 'gp-1') !== undefined; step += 1) {
      await seen.clock.advance(500)
      s = snap(seen)
      if (pose(s, 'gp-1') === 'slump') slumped = true
    }
    expect(slumped).toBe(true)
    expect(said(seen)).toContain('left: failed')
    await seen.clock.advance(600_000)
    s = snap(seen)
    expect(pose(s, 'eng-1')).toBe('fail')
    expect(bubbles(s)).toContain('!')
  })

  test('a contractor waiting for a decision drinks coffee for up to ten minutes, then leaves; waiting staff stay', async ($, on) => {
    const seen = world(on, { 'qa-1': 'claude-sonnet-4-6', 'ex-1': 'claude-haiku-4-5' })
    await $.agent.spawn(spawn('ios-team:qa-tester', 'QA'))
    await $.agent.spawn(spawn('general-purpose', 'Поиск'))
    await seen.clock.advance(20_000)
    await $.turn.complete(finish('qa-1', NEEDS_DECISION))
    await $.turn.complete(finish('ex-1', NEEDS_DECISION))
    await seen.clock.advance(30_000)
    let s = snap(seen)
    expect(goal(s, 'ex-1')).toBe('coffee')
    expect(goal(s, 'qa-1')).toBe('coffee')
    await seen.clock.advance(600_000)
    s = snap(seen)
    expect(person(s, 'ex-1')).toBeUndefined()
    expect(said(seen)).toContain('left: timeout')
    expect(goal(s, 'qa-1')).toBe('coffee')
  })

  test('/clear walks everyone but the coordinator out in order; another session end clears at once', async ($, on) => {
    on('session.end', ($, e) => ({ sessionId: e.sessionId }))
    const seen = world(on, { 'eng-1': 'claude-opus-5-5', 'qa-1': 'claude-sonnet-4-6', 'gp-1': 'claude-haiku-4-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    await $.agent.spawn(spawn('ios-team:qa-tester', 'QA'))
    await $.agent.spawn(spawn('general-purpose', 'Сводка'))
    await seen.clock.advance(25_000)
    await $.session.end({ reason: 'clear', sessionId: 's-1', resume: { id: 's-1' } })
    let s = snap(seen)
    expect(['eng-1', 'qa-1', 'gp-1'].filter(id => goal(s, id) === 'walk').length).toBeGreaterThanOrEqual(1)
    await seen.clock.advance(40_000)
    s = snap(seen)
    for (const id of ['eng-1', 'qa-1', 'gp-1']) expect(person(s, id)).toBeUndefined()
    expect(tagText(s, 'coordinator')).toBe('claude')
    expect(((said(seen)).match(/left: session ended/g) ?? []).length).toBe(3)
    await $.agent.spawn(spawn('ios-team:reviewer', 'Ревью'))
    await $.session.end({ reason: 'other', sessionId: 's-2', resume: { id: 's-2' } })
    s = snap(seen)
    expect(s.people).toEqual([])
    expect(s.hud.runs).toBe(0)
  })

  test('a TaskStop from the main agent sends that agent out through the door', async ($, on) => {
    const seen = world(on, { 'gp-1': 'claude-haiku-4-5' })
    await $.agent.spawn(spawn('general-purpose', 'Сводка'))
    await seen.clock.advance(20_000)
    await $.tool.call({ tool: 'TaskStop', task_id: 'gp-1' } as unknown as ToolCallArgs)
    let s = snap(seen)
    expect(status(s, 'gp-1')).toBe('stopped')
    expect(bubbles(s, 'stop')).toEqual(['×'])
    await seen.clock.advance(20_000)
    s = snap(seen)
    expect(person(s, 'gp-1')).toBeUndefined()
    expect(said(seen)).toContain('left: stopped')
  })

  test('a reopened pane restores positions from state: nobody walks in again', async ($, on) => {
    const shown = panes(on)
    const seen = world(on, { 'eng-1': 'claude-opus-5-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    shown.isOpen = true
    await seen.clock.advance(25_000)
    const before = snap(seen)
    shown.isOpen = false
    await $.command.run(officeCommand)
    const after = snap(seen)
    expect(tile(after, 'eng-1')).toBe(tile(before, 'eng-1'))
    expect(tile(after, 'coordinator')).toBe(AT(BOSS_DESK.seat.x, BOSS_DESK.seat.y))
    expect(after.door).toBe(false)
    expect(goal(after, 'eng-1')).toBe('desk')
  })

  test('a solo session opens the office at start with one person, «claude», whose runs are the turns', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    const seen = world(on, {})
    await $.session.start({ cwd: '/tmp/x', surface: 'desktop', isInteractive: true })
    expect(seen.opened()).toBe(1)
    let s = snap(seen)
    expect(Number(tile(s, 'coordinator').split(',')[0])).toBeGreaterThan(DOOR.x)
    await seen.clock.advance(20_000)
    s = snap(seen)
    expect(s.people).toEqual([])
    expect(tile(s, 'coordinator')).toBe(AT(BOSS_DESK.seat.x, BOSS_DESK.seat.y))
    expect(tagText(s, 'coordinator')).toBe('claude')
    await $.turn.start({ text: 'Почини тест камеры\nподробности ниже', turnId: 't1' })
    await $.tool.call({ tool: 'Read', file_path: '/wt/CameraTests.swift' })
    s = snap(seen)
    expect(pose(s, 'coordinator')).toBe('read')
    expect(bubbles(s)).toContain('Читает CameraTests.swift')
    await seen.clock.advance(25_000)
    s = snap(seen)
    expect(bubbles(s)).toContain('Думает…')
    await $.turn.complete({ answer: 'Готово.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' as const })
    s = snap(seen)
    expect(bubbles(s)).toContain('Done')
    expect(pose(s, 'coordinator')).toBe('happy')
    await seen.clock.advance(6_000)
    s = snap(seen)
    expect(pose(s, 'coordinator')).toBe('bossCup')
    await $.turn.start({ text: 'Что дальше?', turnId: 't2' })
    await $.turn.complete({ answer: 'Добавить тест на iPad?', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' as const })
    s = snap(seen)
    expect(pose(s, 'coordinator')).toBe('standRaise')
    expect(bubbles(s, 'ask')).toEqual(['?'])
    expect(s.hud.runs).toBe(2)
    expect(s.hud.approvals).toBe(1)
    const boss = stateOf<OfficeCoordinator>(seen, 'coordinator', IDLE_COORDINATOR)
    expect(boss.turnLog.map(turn => turn.text)).toEqual(['Почини тест камеры', 'Что дальше?'])
  })

  test('the main agent turns into «coordinator» on the project-lead skill or the first spawn, and fetches coffee after five idle minutes', async ($, on) => {
    const seen = world(on, { 'eng-1': 'claude-opus-5-5' })
    await $.turn.start({ text: 'привет', turnId: 't1' })
    expect(tagText(snap(seen), 'coordinator')).toBe('claude')
    await $.tool.call({ tool: 'Skill', skill: 'ios-team:project-lead' } as unknown as ToolCallArgs)
    expect(tagText(snap(seen), 'coordinator')).toBe('coordinator')
    await $.turn.complete({ answer: 'Ок.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' as const })
    await seen.clock.advance(310_000)
    let s = snap(seen)
    expect(goal(s, 'coordinator')).toBe('coffee')
    expect(pose(s, 'coordinator')).toBe('cup')
    await $.turn.start({ text: 'дальше', turnId: 't2' })
    await seen.clock.advance(15_000)
    s = snap(seen)
    expect(tile(s, 'coordinator')).toBe(AT(BOSS_DESK.seat.x, BOSS_DESK.seat.y))
    expect(status(s, 'coordinator')).not.toBe('idle')
  })

  test('a first subagent spawn makes the main agent the coordinator', async ($, on) => {
    const seen = world(on, { 'eng-1': 'claude-opus-5-5' })
    await $.turn.start({ text: 'привет', turnId: 't1' })
    expect(tagText(snap(seen), 'coordinator')).toBe('claude')
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    expect(tagText(snap(seen), 'coordinator')).toBe('coordinator')
  })

  test('autoOpen defaults to session-start: the pane opens before any spawn', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    const seen = world(on, { 'eng-1': 'claude-opus-5-5' })
    await $.session.start({ cwd: '/tmp/x', surface: 'desktop', isInteractive: true })
    expect(seen.opened()).toBe(1)
  })

  test('autoOpen modes: session-start opens at start, first-agent on the first spawn, never only with /office', async () => {
    expect(autoOpenOf(undefined)).toBe('session-start')
    expect(autoOpenOf('bogus')).toBe('session-start')
    expect(autoOpenOf('first-agent')).toBe('first-agent')
    expect(autoOpenOf('never')).toBe('never')
    expect([opensAt('session-start', 'session-start'), opensAt('session-start', 'first-agent')]).toEqual([true, true])
    expect([opensAt('first-agent', 'session-start'), opensAt('first-agent', 'first-agent')]).toEqual([false, true])
    expect([opensAt('never', 'session-start'), opensAt('never', 'first-agent')]).toEqual([false, false])
  })
})

describe('Офис: publishing and the local server', () => {
  test('every change is published to state.json through a tmp file and a rename, with a rising version', async ($, on) => {
    const files = host(on)
    const seen = world(on, { 'eng-1': 'claude-opus-5-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Тесты'))
    await seen.clock.advance(100)
    const first = files.published()
    expect(first.format).toBe(SNAPSHOT_FORMAT)
    expect(first.people.map(one => one.id)).toEqual(['eng-1'])
    expect(files.writes).toContain(`${DIR}/state.json.tmp`)
    expect(files.writes).not.toContain(`${DIR}/state.json`)
    expect(files.moves).toContainEqual([`${DIR}/state.json.tmp`, `${DIR}/state.json`])
    expect(files.files.has(`${DIR}/state.json.tmp`)).toBe(false)
    await $.tool.call(inAgent('eng-1', { tool: 'Bash', command: 'make test' }))
    await seen.clock.advance(100)
    const second = files.published()
    expect(second.version).toBeGreaterThan(first.version)
    expect(person(second, 'eng-1')?.activity).toBe('Собирает и гоняет тесты')
  })

  test('bursts of changes are coalesced into one write per 60 ms', async ($, on) => {
    const files = host(on)
    const seen = world(on, { 'eng-1': 'claude-opus-5-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Тесты'))
    await seen.clock.advance(100)
    const before = files.writes.length
    for (let index = 0; index < 5; index += 1) await $.tool.call(inAgent('eng-1', { tool: 'Read', file_path: `/wt/F${index}.swift` }))
    await seen.clock.advance(100)
    expect(files.writes.length - before).toBe(1)
    expect(person(files.published(), 'eng-1')?.activity).toBe('Читает F4.swift')
  })

  test('without a working rename the snapshot is written in place', async ($, on) => {
    const files = host(on, { canRename: false })
    const seen = world(on, { 'eng-1': 'claude-opus-5-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Тесты'))
    await seen.clock.advance(100)
    expect(files.moves).toEqual([])
    expect(files.writes).toContain(`${DIR}/state.json`)
    expect(files.published().people.map(one => one.id)).toEqual(['eng-1'])
  })

  test('/office starts one local server per session with a random token and prints its URL; the pane is a compact summary', async ($, on) => {
    const files = host(on)
    panes(on)
    const seen = world(on, { 'eng-1': 'claude-opus-5-5', 'qa-1': 'claude-sonnet-4-6' })
    const result = await $.command.run(officeCommand)
    expect(files.spawns).toHaveLength(1)
    const argv = files.spawns[0] ?? []
    expect(argv[0]).toBe(NODE)
    expect(argv[1]?.endsWith('/server/office-server.mjs')).toBe(true)
    expect(argv[argv.indexOf('--dir') + 1]).toBe(DIR)
    expect(argv[argv.indexOf('--web') + 1]?.endsWith('/web')).toBe(true)
    const token = files.token()
    expect(token).toMatch(/^[0-9a-f]{32}$/)
    const url = `http://127.0.0.1:${PORT}/?token=${token}`
    expect(result.text).toBe(`Не смог открыть браузер сам — открой ссылку в любом браузере на этом компьютере: ${url}\nCould not open the browser — open this link in any browser on this computer: ${url}`)
    expect(files.files.has(`${DIR}/state.json`)).toBe(true)
    expect((await $.command.run(officeCommand)).text).toContain(url)
    expect(files.spawns).toHaveLength(1)
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    await $.agent.spawn(spawn('ios-team:qa-tester', 'QA'))
    await seen.clock.advance(20_000)
    await $.turn.complete(finish('qa-1', NEEDS_DECISION))
    const view = await pane($)
    expect(view.keys).toEqual(['open-office', 'copy-office'])
    expect(view.buttons).toEqual(['Open office', 'Copy link'])
    expect(view.text).toContain('coordinator and 2 agents · ≈$')
    expect(view.text).toContain('1 working · 1 waiting · 0 failed')
    expect(view.text).toContain(`Serving on 127.0.0.1:${PORT}.`)
    expect(view.text).toContain(`[${url}](${url})`)
    files.release()
  })

  function noBrowser(on: On): { calls: () => number } {
    let calls = 0
    on('mcp.call', ($, e) => {
      if ((e as unknown as { server: string }).server !== 'ccd_session_mgmt') calls += 1
      return { value: { content: [], isError: true } }
    })
    return { calls: () => calls }
  }

  test('/office opens the system browser once and the pane, then says it is already open instead of adding tabs; no built-in browser call', async ($, on) => {
    const files = host(on, { canOpen: true })
    panes(on)
    const mcp = noBrowser(on)
    const seen = world(on, {})
    const first = await $.command.run(officeCommand)
    const url = `http://127.0.0.1:${PORT}/?token=${files.token()}`
    expect(first.text).toBe(`Офис открыт в браузере системы: ${url}`)
    expect(seen.opened()).toBe(1)
    const second = await $.command.run(officeCommand)
    expect(second.text).toBe(`Офис уже открыт в браузере системы, если вкладку закрыли, открой ссылку: ${url}`)
    expect(mcp.calls()).toBe(0)
    expect(files.runs.filter(argv => argv[0] === 'open')).toEqual([['open', url]])
    expect(files.spawns).toHaveLength(1)
    files.release()
  })

  test('/office gives the link when nothing can open it', async ($, on) => {
    const files = host(on)
    panes(on)
    world(on, {})
    const result = await $.command.run(officeCommand)
    expect(result.text).toBe(sayShowing({ how: 'manual', url: `http://127.0.0.1:${PORT}/?token=${files.token()}`, lang: 'both' }))
    files.release()
  })

  test('/office after the server went down (a reload, a crash) starts a new one and opens its new link', async ($, on) => {
    const files = host(on, { canOpen: true })
    panes(on)
    const seen = world(on, {})
    await $.command.run(officeCommand)
    const before = `http://127.0.0.1:${PORT}/?token=${files.token()}`
    files.stop(0)
    await seen.clock.settle()
    expect((await pane($)).buttons).toEqual(['Start office'])
    const again = await $.command.run(officeCommand)
    const after = `http://127.0.0.1:${PORT}/?token=${files.token()}`
    expect(after).not.toBe(before)
    expect(files.spawns).toHaveLength(2)
    expect(again.text).toBe(`Офис открыт в браузере системы: ${after}`)
    expect(files.runs.filter(argv => argv[0] === 'open')).toEqual([
      ['open', before],
      ['open', after],
    ])
    files.release()
  })

  test('Open office and the office link use the same chain and tell it in a toast; Copy link copies the URL', async ($, on) => {
    const files = host(on, { canOpen: true })
    panes(on)
    const mcp = noBrowser(on)
    const toasts: string[] = []
    const copied: string[] = []
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('ui.copy', ($, e) => {
      copied.push(e.text)
      return { value: { isCopied: true } }
    })
    world(on, {})
    await $.command.run(officeCommand)
    const url = `http://127.0.0.1:${PORT}/?token=${files.token()}`
    const ui = await $.ui.mount({ ...MOUNT, surface: 'desktop' })
    await ui.press({ key: 'open-office' })
    expect(toasts.at(-1)).toBe(`Офис уже открыт в браузере системы, если вкладку закрыли, открой ссылку: ${url}`)
    await ui.press({ key: 'office-link', link: { href: url } })
    expect(toasts.at(-1)).toBe(`Офис уже открыт в браузере системы, если вкладку закрыли, открой ссылку: ${url}`)
    expect(mcp.calls()).toBe(0)
    await ui.press({ key: 'copy-office' })
    await ui.unmount()
    expect(copied).toEqual([url])
    expect(files.runs.filter(argv => argv[0] === 'open')).toEqual([['open', url]])
    expect(files.spawns).toHaveLength(1)
    files.release()
  })

  test('node on PATH comes first; when it does not start the server falls back to python3', async ($, on) => {
    const files = host(on, { nodes: { node: 'v20.11.0', [NODE]: 'v22.11.0' }, nodeStarts: false })
    panes(on)
    world(on, {})
    const result = await $.command.run(officeCommand)
    expect(files.spawns.map(argv => argv[0])).toEqual(['node', 'python3'])
    expect(files.spawns[1]?.[1]?.endsWith('/server/office_server.py')).toBe(true)
    expect(result.text).toContain(`http://127.0.0.1:${PORT}/?token=${files.token()}`)
    files.release()
  })

  test('session end stops the server; the pane then offers to start it again', async ($, on) => {
    const files = host(on)
    panes(on)
    on('session.end', ($, e) => ({ sessionId: e.sessionId }))
    const seen = world(on, {})
    await $.command.run(officeCommand)
    expect((await pane($)).buttons).toEqual(['Open office', 'Copy link'])
    await $.session.end({ reason: 'other', sessionId: 's-1', resume: { id: 's-1' } })
    await seen.clock.settle()
    const view = await pane($)
    expect(view.buttons).toEqual(['Start office'])
    expect(view.text).not.toContain('token=')
    files.release()
  })

  test('without a writable data folder the office reports the failure and offers a restart', async ($, on) => {
    on('env.get', ($, e) => ({ value: e.name === 'CLAUDE_PLUGIN_DATA' ? '/ro/data' : undefined }))
    on('session.id', () => ({ value: SESSION }))
    on('settings.read', () => ({ value: { language: 'en' } }))
    on('fs.write', () => ({ deny: 'read-only file system' }))
    panes(on)
    world(on, {})
    const result = await $.command.run(officeCommand)
    expect(result.text).toBe(`The office data folder is not writable: /ro/data/office/${SESSION}. Free some disk space or grant write access (or point CLAUDE_PLUGIN_DATA at another folder), then run /office again.`)
    expect(result.text).not.toContain('http://')
    const view = await pane($)
    expect(view.buttons).toEqual(['Start office'])
    expect(view.text).toContain('CLAUDE_PLUGIN_DATA')
  })

  test('the HUD shows what was spent and no budget; an older or newer snapshot format is not drawn', async () => {
    const hud = { spent: 40.07, tokens: 2_650_000, runs: 9, approvals: 1, flagged: 2 }
    const html = barHtml(hud)
    expect(html).toContain('Spent <b>≈$40.07</b>')
    expect(html).toContain('2.6M')
    expect(html).not.toMatch(/budget|remaining|NaN|undefined/i)
    expect(barHtml({ spent: 0, tokens: 0, runs: 0, approvals: 0, flagged: 0 })).not.toMatch(/NaN|undefined/)
    const current = buildSnapshot({ version: 1, now: 1_000, startedAt: 500, agents: {}, coordinator: IDLE_COORDINATOR, events: [] })
    expect(isReadable(current)).toBe(true)
    expect(isReadable({ ...current, format: 2 })).toBe(false)
    expect(isReadable({ ...current, format: SNAPSHOT_FORMAT + 1 })).toBe(false)
    expect(isReadable({})).toBe(false)
  })

  test('port file, URL, version and path helpers', async () => {
    expect(readPortFile(JSON.stringify({ port: 4321, token: 'abc' }), 'abc')).toBe(4321)
    expect(readPortFile(JSON.stringify({ port: 4321, token: 'other' }), 'abc')).toBeUndefined()
    expect(readPortFile('{"port":', 'abc')).toBeUndefined()
    expect(readPortFile('{}', 'abc')).toBeUndefined()
    expect(officeUrl(4321, 'abc')).toBe('http://127.0.0.1:4321/?token=abc')
    expect(nextVersion(0, 1_000.7)).toBe(1_000)
    expect(nextVersion(1_000, 1_000)).toBe(1_001)
    expect(nextVersion(5_000, 1_000)).toBe(5_001)
    expect(safeSegment('a/../b c')).toBe('a_.._b_c')
    expect(safeSegment('')).toBe('session')
    expect(sayShowing({ how: 'down', detail: 'no folder' })).toBe('no folder')
    expect(hostPathsOf('/data/x/', '/tmp', 'a/b')).toEqual({ dir: '/data/x/office/a_b', state: '/data/x/office/a_b/state.json', port: '/data/x/office/a_b/server.json' })
    expect(hostPathsOf(undefined, '/var/folders/t/', 's').dir).toBe('/var/folders/t/agent-office/office/s')
  })
})

describe('Офис: movement and props', () => {
  const T0 = 2_000_000

  function made(id: string, type: string, change: Partial<OfficeAgent>): OfficeAgent {
    const agent = spawnAgent({}, {}, id, { type, description: 'x', model: 'claude-sonnet-4-6', background: true, brief: 'x' }, T0).agents[id]
    if (agent === undefined) throw new Error('no agent')
    return { ...agent, movedAt: T0 - 10_000, ...change }
  }

  function walker(id: string, from: OfficeTile, to: OfficeTile, seq: number): OfficeAgent {
    return made(id, 'general-purpose', { seq, desk: -1, goal: 'coffee', pos: from, from, path: findPath(from, to), status: 'decision', statusAt: T0 })
  }

  function stander(id: string, at: OfficeTile, seq: number): OfficeAgent {
    return made(id, 'general-purpose', { seq, desk: -1, goal: 'coffee', pos: at, from: at, path: [], status: 'decision', statusAt: T0 })
  }

  function run(start: Record<string, OfficeAgent>, ticks: number, check: (before: Record<string, OfficeAgent>, after: Record<string, OfficeAgent>) => void): Record<string, OfficeAgent> {
    let all = start
    for (let tick = 1; tick <= ticks; tick += 1) {
      const next = stepAgents(all, T0 + tick * 500).agents
      check(all, next)
      all = next
    }
    return all
  }

  function tilesOf(all: Record<string, OfficeAgent>): string[] {
    return Object.values(all)
      .filter(agent => agent.status !== 'gone')
      .map(agent => AT(agent.pos.x, agent.pos.y))
  }

  test('routes never pass over a seat: every chair, the sofa and the meeting chairs are only ever a route end', async () => {
    const spots = [DOOR, ...DESKS.map(desk => desk.seat), BOSS_DESK.seat, ...LOUNGE_SPOTS, ...COFFEE_SPOTS, ...STUDY_SPOTS, ...OVERFLOW_SPOTS]
    for (const from of spots)
      for (const to of spots) {
        const path = findPath(from, to)
        if (path.length > 0) expect([AT(from.x, from.y), AT(to.x, to.y), AT(path[path.length - 1]?.x ?? -1, path[path.length - 1]?.y ?? -1)]).toEqual([AT(from.x, from.y), AT(to.x, to.y), AT(to.x, to.y)])
        for (const step of path.slice(0, -1)) expect([AT(from.x, from.y), AT(to.x, to.y), AT(step.x, step.y), SEAT_TILES.has(AT(step.x, step.y))]).toEqual([AT(from.x, from.y), AT(to.x, to.y), AT(step.x, step.y), false])
      }
  })

  test('a walker side-steps a person standing in its corridor and never shares a tile', async () => {
    const route = findPath({ x: 8, y: 7 }, { x: 16, y: 7 })
    const blocker = route[3]
    if (blocker === undefined) throw new Error('short route')
    const end = run({ a: walker('a', { x: 8, y: 7 }, { x: 16, y: 7 }, 1), b: stander('b', blocker, 2) }, 40, (_, after) => {
      const tiles = tilesOf(after)
      expect(new Set(tiles).size).toBe(tiles.length)
    })
    expect(AT(end['a']?.pos.x ?? -1, end['a']?.pos.y ?? -1)).toBe(AT(16, 7))
  })

  test('two walkers meeting head-on never swap through each other', async () => {
    const one = walker('a', { x: 8, y: 7 }, { x: 16, y: 7 }, 1)
    const two = walker('b', { x: 16, y: 7 }, { x: 8, y: 7 }, 2)
    const end = run({ a: one, b: two }, 60, (before, after) => {
      const tiles = tilesOf(after)
      expect(new Set(tiles).size).toBe(tiles.length)
      const [a0, b0, a1, b1] = [before['a']?.pos, before['b']?.pos, after['a']?.pos, after['b']?.pos]
      const swapped = a0 !== undefined && b0 !== undefined && a1 !== undefined && b1 !== undefined && AT(a1.x, a1.y) === AT(b0.x, b0.y) && AT(b1.x, b1.y) === AT(a0.x, a0.y)
      expect(swapped).toBe(false)
    })
    expect([AT(end['a']?.pos.x ?? -1, end['a']?.pos.y ?? -1), AT(end['b']?.pos.x ?? -1, end['b']?.pos.y ?? -1)]).toEqual([AT(16, 7), AT(8, 7)])
  })

  test('a leaver waits inside while arrivals come through the door, then goes', async () => {
    const leaving = made('out', 'general-purpose', { seq: 1, desk: -1, goal: 'door', exit: 'done', status: 'done', pos: { x: 17, y: 12 }, from: { x: 17, y: 12 }, path: exitPath({ x: 17, y: 12 }) })
    const arrivals = [0, 1, 2].map(index => made(`in-${index}`, 'general-purpose', { seq: 2 + index, desk: -1, goal: 'desk', spot: 1 + index, pos: queueTile(index), from: queueTile(index), path: [...Array.from({ length: index }, (_, step) => queueTile(index - step - 1)), DOOR, ...findPath(DOOR, LAPTOP_SPOTS[index] ?? DOOR)] }))
    const start = Object.fromEntries([leaving, ...arrivals].map(agent => [agent.seq === 1 ? 'out' : `in-${agent.seq - 2}`, agent]))
    let exited = false
    run(start, 60, (before, after) => {
      const tiles = tilesOf(after).filter(tile => tile !== AT(GRID_W, DOOR.y + 1))
      expect(new Set(tiles).size).toBe(tiles.length)
      const out = after['out']
      const inbound = Object.entries(before).some(([id, agent]) => id !== 'out' && (isOutside(agent.pos) || AT(agent.pos.x, agent.pos.y) === AT(DOOR.x, DOOR.y)))
      const beforeOut = before['out']
      if (out !== undefined && beforeOut !== undefined && AT(out.pos.x, out.pos.y) === AT(DOOR.x, DOOR.y) && AT(beforeOut.pos.x, beforeOut.pos.y) !== AT(DOOR.x, DOOR.y)) expect(inbound).toBe(false)
      if (out?.status === 'gone') exited = true
    })
    expect(exited).toBe(true)
  })

  test('arrivals queue behind someone leaving through the porch instead of standing on them', async () => {
    const leaving = made('out', 'general-purpose', { seq: 1, desk: -1, goal: 'door', exit: 'done', status: 'done', pos: PORCH, from: PORCH, path: exitPath(PORCH) })
    const change = spawnAgent({ out: leaving }, {}, 'in', { type: 'general-purpose', description: 'x', model: 'claude-haiku-4-5', background: true, brief: 'x' }, T0)
    const arrived = change.agents['in']
    expect(arrived !== undefined && AT(arrived.pos.x, arrived.pos.y) !== AT(PORCH.x, PORCH.y)).toBe(true)
  })

  test('a seated person names its seat and screen; the page turns chair and screen on only once the drawn figure sits, and off as it gets up', async () => {
    const seat = DESKS[0]?.seat ?? DOOR
    const route = [DOOR, ...findPath(DOOR, seat)]
    const at = (index: number, change: Partial<OfficeAgent> = {}) => {
      const agent = made('eng', 'ios-team:ios-engineer', { seq: 1, desk: 0, goal: 'desk', status: 'working', act: 'code', pos: route[index] ?? seat, from: route[index] ?? seat, path: route.slice(index + 1), ...change })
      const person = buildSnapshot({ version: index + 1, now: T0, startedAt: T0, agents: { eng: agent }, coordinator: IDLE_COORDINATOR, events: [] }).people[0]
      if (person === undefined) throw new Error('no person')
      return person
    }
    expect(at(0).rest.seat).toBe('desk:0')
    expect(at(0).rest.screen).toEqual({ desk: 0, kind: 'code', thinking: false, working: true, blueprint: false })
    const people = new Map<string, Shown>()
    syncPeople(people, [at(0)], 0)
    let seatedAt = -1
    for (let frame = 1; frame <= 60 * 30 && seatedAt < 0; frame += 1) {
      if (frame % 30 === 0) syncPeople(people, [at(Math.min(route.length - 1, frame / 30))], frame)
      stepPeople(people, 1000 / 60, 500)
      const shown = people.get('eng')
      const props = propsOf(people)
      if (shown !== undefined && isSeated(shown)) seatedAt = frame
      else expect([frame, props.chairs.size, props.screens.length]).toEqual([frame, 0, 0])
    }
    expect(seatedAt).toBeGreaterThan(0)
    const worldArrived = (route.length - 1) * 30
    expect(seatedAt).toBeGreaterThan(worldArrived)
    expect([...propsOf(people).chairs]).toEqual(['desk:0'])
    expect(propsOf(people).screens.map(screen => screen.kind)).toEqual(['code'])
    const away = [seat, ...exitPath(seat)]
    syncPeople(people, [{ ...at(route.length - 1, { goal: 'door', status: 'done', exit: 'done', path: away.slice(1) }) }], 0)
    stepPeople(people, 1000 / 60, 500)
    expect([propsOf(people).chairs.size, propsOf(people).screens.length]).toEqual([0, 0])
  })

  test('sofa sitters sit on the cushion in front of the next section, kitchen waiters face the counter', async () => {
    LOUNGE_SPOTS.forEach((tile, spot) => {
      const agent = made(`s${spot}`, 'ios-team:reviewer', { seq: 1, goal: 'lounge', spot, status: 'done', restUntil: T0 + 45_000, pos: tile, from: tile, path: [] })
      const rest = buildSnapshot({ version: 1, now: T0, startedAt: T0, agents: { [`s${spot}`]: agent }, coordinator: IDLE_COORDINATOR, events: [] }).people[0]?.rest
      expect([spot, rest?.pose, rest?.z, rest?.seat]).toEqual([spot, 'sofa', 0, `sofa:${spot}`])
      expect(rest?.depth).toBeGreaterThan(tile.x + 1 + tile.y + 0.2)
      expect(rest?.world[1]).toBeGreaterThan(tile.y + 0.5)
    })
    COFFEE_SPOTS.forEach((tile, spot) => {
      expect([spot, tile.y <= 2, tile.x >= 18]).toEqual([spot, true, true])
      const agent = made(`c${spot}`, 'ios-team:qa-tester', { seq: 1, goal: 'coffee', spot, status: 'decision', pos: tile, from: tile, path: [] })
      const rest = buildSnapshot({ version: 1, now: T0, startedAt: T0, agents: { [`c${spot}`]: agent }, coordinator: IDLE_COORDINATOR, events: [] }).people[0]?.rest
      expect([spot, rest?.pose, rest?.facing]).toEqual([spot, 'cup', 'back'])
    })
    expect(FLOOR.some(item => item.sprite === 'coffee-machine' && item.x === 20 && item.y === 0)).toBe(true)
  })

  test('the page accepts a new epoch: a demo loop restart, a hot reload or a new session never freezes it', async () => {
    const at = (version: number, startedAt: number) => ({ ...buildSnapshot({ version, now: T0, startedAt, agents: {}, coordinator: IDLE_COORDINATOR, events: [] }) })
    expect(isNewer(undefined, at(1, 1))).toBe(true)
    expect(isNewer(at(5, 1), at(6, 1))).toBe(true)
    expect(isNewer(at(5, 1), at(5, 1))).toBe(false)
    expect(isNewer(at(5, 1), at(4, 1))).toBe(false)
    expect(isNewer(at(500, 1), at(1, 2))).toBe(true)
  })

  test('a 60 fps replay of two demo loops: rising versions, no blocked tiles or glass crossed, nobody walks through a resting person, props only under seated figures', async () => {
    const people = new Map<string, Shown>()
    const issues: string[] = []
    let last: Snapshot | undefined
    let versions = 0
    let rejected = 0
    let now = T0
    const demo = startDemo(next => {
      if (last !== undefined && next.version <= last.version) issues.push(`version ${next.version} after ${last.version}`)
      if (!isNewer(last, next)) {
        rejected += 1
        return
      }
      versions += 1
      last = next
      syncPeople(people, [next.boss, ...next.people], now)
    }, T0)
    const tiles = new Map<string, string>()
    const dt = 1000 / 60
    let minWalkers = 99
    for (let frame = 0; frame < 145 * 60; frame += 1) {
      now = T0 + frame * dt
      if (frame % 30 === 0) demo.tick(now)
      stepPeople(people, dt, 500)
      const list = [...people.values()].filter(one => one.removedAt === undefined)
      const props = propsOf(people)
      const seated = list.filter(isSeated)
      for (const key of props.chairs) if (!seated.some(one => one.snap.rest.seat === key)) issues.push(`${frame}: seat ${key} with nobody seated`)
      for (const screen of props.screens) if (!seated.some(one => one.snap.rest.screen?.desk === screen.desk)) issues.push(`${frame}: screen ${screen.desk} with nobody seated`)
      for (const one of list) {
        const here = AT(Math.floor(one.x), Math.floor(one.y))
        const end = [one.snap.tile, ...one.snap.path][one.snap.path.length]
        if (one.isWalking && one.x < GRID_W && BLOCKED.has(here) && here !== AT(end?.[0] ?? -1, end?.[1] ?? -1)) issues.push(`${frame}: ${one.id} on blocked ${here}`)
        const before = tiles.get(one.id)
        if (before !== undefined && before !== here && BLOCKED_EDGES.has(`${before}|${here}`)) issues.push(`${frame}: ${one.id} crossed ${before}|${here}`)
        tiles.set(one.id, here)
        for (const other of list) {
          if (other === one) continue
          const gap = Math.hypot(one.x - other.x, one.y - other.y)
          if (one.isWalking && !other.isWalking && gap < 0.45) issues.push(`${frame}: ${one.id} through resting ${other.id}`)
          if (one.isWalking && other.isWalking) minWalkers = Math.min(minWalkers, gap)
        }
      }
    }
    expect(issues.slice(0, 10)).toEqual([])
    expect(rejected).toBe(0)
    expect(versions).toBeGreaterThan(280)
    expect(minWalkers).toBeGreaterThan(0.3)
  })
})

describe('Офис: agent card', () => {
  const T0 = 3_000_000

  const QUESTIONS = [
    'Проверил камеру.',
    '```result',
    'agent: qa-tester',
    'status: needs_decision',
    'summary: нужен выбор',
    'needs_decision:',
    '  - {id: d1, question_ru: "Проверять на iPad?", options: ["Да (Recommended)", "Нет"], recommended: "Да", why: "На iPad другой layout, ломался в PROJ-1600"}',
    '  - {id: d2, question_ru: "Снять видео, \\"да\\" или нет?", options: ["Да, с озвучкой", \'Нет, только скрин\']}',
    '  - id: d3',
    '    question_ru: Обновить скриншоты в PR?',
    '    options: [Да, Нет]',
    'not_verified: [ротация экрана, iPad mini]',
    'noticed:',
    '  - "Кнопка «Готово» мигает"',
    '```',
  ].join('\n')

  function made(id: string, type: string, change: Partial<OfficeAgent> = {}): OfficeAgent {
    const agent = spawnAgent({}, {}, id, { type, description: 'x', model: 'claude-sonnet-4-6', background: true, brief: 'x' }, T0).agents[id]
    if (agent === undefined) throw new Error('no agent')
    return { ...agent, ...change }
  }

  function cardOf(agents: Record<string, OfficeAgent>, id: string, boss = IDLE_COORDINATOR) {
    const s = buildSnapshot({ version: 1, now: T0, startedAt: T0, agents, coordinator: boss, events: [] })
    return (id === 'coordinator' ? s.boss : s.people.find(one => one.id === id))?.card
  }

  test('needs_decision lists parse from flow and block items, with quotes, commas inside strings and missing fields', async () => {
    const parsed = parseResult(QUESTIONS)
    expect(parsed.status).toBe('decision')
    expect(parsed.decisions).toEqual([
      { id: 'd1', question: 'Проверять на iPad?', options: ['Да', 'Нет'], recommended: 'Да', why: 'На iPad другой layout, ломался в PROJ-1600' },
      { id: 'd2', question: 'Снять видео, "да" или нет?', options: ['Да, с озвучкой', 'Нет, только скрин'] },
      { id: 'd3', question: 'Обновить скриншоты в PR?', options: ['Да', 'Нет'] },
    ])
    expect(parsed.notVerified).toEqual(['ротация экрана', 'iPad mini'])
    expect(parsed.noticed).toEqual(['Кнопка «Готово» мигает'])
    const broken = parseResult(['```result', 'status: needs_decision', 'needs_decision:', '  - {id: d1, question_ru: "Без кавычки, options: [A, B', '  - {question_ru: Без id}', '  - {id: x1, options: [A]}', '  - просто строка', '```'].join('\n'))
    expect(broken.decisions?.map(one => [one.id, one.question, one.options])).toEqual([
      ['d1', 'Без кавычки, options: [A, B', []],
      ['d2', 'Без id', []],
    ])
    const many = parseResult(['```result', 'status: needs_decision', 'needs_decision:', ...Array.from({ length: 9 }, (_, index) => `  - {id: d${index + 1}, question_ru: "${'Очень длинный вопрос '.repeat(20)}", options: [${Array.from({ length: 10 }, (_, k) => `o${k}`).join(', ')}]}`), '```'].join('\n'))
    expect(many.decisions).toHaveLength(5)
    expect(many.decisions?.[0]?.options).toHaveLength(6)
    expect(Array.from(many.decisions?.[0]?.question ?? '').length).toBeLessThanOrEqual(200)
  })

  test('the card carries the role, status, recent actions newest first and bounded, spend, and when Stop applies', async () => {
    const runs = Array.from({ length: 20 }, (_, index) => ({ at: T0 + index * 1000, text: `Reading F${index}.swift`, state: 'ok' as const, tool: index % 2 === 0 ? 'Read' : 'mcp__xcode__BuildProject' }))
    const eng = made('eng', 'ios-team:ios-engineer', { runs, tokens: { input: 1000, output: 200, cacheRead: 300, cacheWrite: 0 }, cost: 0.42, model: 'Opus' })
    const card = cardOf({ eng }, 'eng')
    expect([card?.role, card?.status, card?.tokens, card?.cost, card?.canStop]).toEqual(['iOS-инженер', 'working', 1500, 0.42, true])
    expect(card?.recent).toHaveLength(RECENT_KEPT)
    expect(card?.recent[0]).toEqual({ at: T0 + 19_000, text: 'Reading F19.swift', tool: 'BuildProject', state: 'ok' })
    expect(card?.recent.map(item => item.at)).toEqual([...card!.recent.map(item => item.at)].sort((a, b) => b - a))
    expect(cardOf({}, 'coordinator')?.role).toBe('Координатор')
    expect(cardOf({}, 'coordinator')?.canStop).toBe(false)
    for (const status of ['done', 'failed', 'stopped'] as const) expect([status, canStop({ ...eng, status })]).toEqual([status, false])
    expect(canStop({ ...eng, goal: 'door' })).toBe(false)
    expect(canStop({ ...eng, status: 'decision' })).toBe(true)
  })

  test('a waiting agent shows its questions; blocked without a list shows its reason; failed and result notes land in the warnings', async () => {
    const qa = made('qa', 'ios-team:qa-tester')
    const asked = completeAgent({ qa }, 'qa', { parsed: parseResult(QUESTIONS), reason: 'answer', isAborted: false }, T0).agents
    const card = cardOf(asked, 'qa')
    expect(card?.asks.map(one => one.id)).toEqual(['d1', 'd2', 'd3'])
    expect(card?.asks[0]?.recommended).toBe('Да')
    expect(card?.notes.map(note => [note.kind, note.text])).toEqual([
      ['not_verified', 'ротация экрана'],
      ['not_verified', 'iPad mini'],
      ['noticed', 'Кнопка «Готово» мигает'],
    ])
    const one = completeAgent({ qa }, 'qa', { parsed: parseResult(['```result', 'status: needs_decision', 'needs_decision:', '  - {id: d1, question_ru: "Проверять на iPad?", options: [Да, Нет]}', '```'].join('\n')), reason: 'answer', isAborted: false }, T0).agents
    expect(cardOf(one, 'qa')?.asks).toHaveLength(1)
    const blocked = completeAgent({ qa }, 'qa', { parsed: parseResult(['```result', 'status: blocked', 'summary: нет доступа к TestOps', '```'].join('\n')), reason: 'answer', isAborted: false }, T0).agents
    expect(cardOf(blocked, 'qa')?.asks).toEqual([{ id: 'b1', question: 'нет доступа к TestOps', options: [] }])
    const failed = completeAgent({ qa }, 'qa', { parsed: parseResult(['```result', 'status: failed', 'summary: сборка упала', '```'].join('\n')), reason: 'answer', isAborted: false }, T0).agents
    expect(cardOf(failed, 'qa')?.notes.map(note => [note.kind, note.text])).toEqual([['failed', 'сборка упала']])
    expect(cardOf(failed, 'qa')?.asks).toEqual([])
  })

  test('answer messages for one and for several questions, and a free-text answer, ask to resume the same agent', async () => {
    const asks = [
      { id: 'd1', question: 'Проверять на iPad?' },
      { id: 'd2', question: 'Снять видео?' },
    ]
    expect(answerText('qa-tester', 'a9cc', asks, [{ id: 'd1', text: 'Да' }])).toBe('Ответ для qa-tester (d1 «Проверять на iPad?»): Да. Продолжи этого же агента (a9cc) через SendMessage, не запускай нового.')
    expect(answerText('qa-tester', 'a9cc', asks, [
      { id: 'd1', text: 'Да' },
      { id: 'd2', text: 'нет, только скриншоты.' },
    ])).toBe('Ответы для qa-tester: d1 — Да; d2 — нет, только скриншоты. Продолжи этого же агента (a9cc) через SendMessage, не запускай нового.')
    expect(answerText('qa-tester', 'a9cc', asks, [{ id: 'd9', text: 'Да' }])).toBeUndefined()
    expect(answerText('qa-tester', 'a9cc', asks, [{ id: 'd1', text: '   ' }])).toBeUndefined()
    expect(answerText('qa-tester', 'a9cc', asks, [{ id: 'd1', text: 'проверь\nна iPad Pro' }])).toContain(': проверь на iPad Pro. ')
  })

  test('the inbox is validated: bad ids, unknown actions, long text and broken JSON are dropped', async () => {
    const good = { request: 'r1', action: 'answer', agent: 'a9cc3631cb90cda46', text: '', answers: [{ id: 'd1', text: 'Да' }], at: 1 }
    expect(readInbox(JSON.stringify([good]))).toEqual([good])
    expect(readInbox(JSON.stringify([{ ...good, agent: '../../etc' }, { ...good, action: 'delete' }, { ...good, text: 'x'.repeat(2001) }, { ...good, answers: [{ id: 'd 1', text: 'x' }] }, { ...good, answers: [{ id: 'd1', text: 'x'.repeat(301) }] }, { ...good, request: '<script>' }]))).toEqual([])
    expect(readInbox('{"request":')).toEqual([])
    expect(readInbox('{}')).toEqual([])
  })

  test('picking takes the front-most drawn figure where two overlap, and ignores people fading out', async () => {
    const back = made('back', 'ios-team:reviewer', { pos: { x: 10, y: 7 }, from: { x: 10, y: 7 }, path: [], goal: 'coffee', status: 'decision' })
    const front = made('front', 'ios-team:qa-tester', { pos: { x: 11, y: 7 }, from: { x: 11, y: 7 }, path: [], goal: 'coffee', status: 'decision' })
    const s = buildSnapshot({ version: 1, now: T0, startedAt: T0, agents: { back, front }, coordinator: IDLE_COORDINATOR, events: [] })
    const people = new Map<string, Shown>()
    syncPeople(people, s.people, 0)
    for (let frame = 0; frame < 30; frame += 1) stepPeople(people, 1000 / 60, 500)
    const [bx, by] = [((10.5 - 7.42) * 20) + 12 + 15 * 20, ((10.5 + 7.42) * 10) + 118]
    const [fx, fy] = [((11.5 - 7.42) * 20) + 12 + 15 * 20, ((11.5 + 7.42) * 10) + 118]
    const overlap: [number, number] = [(bx + fx) / 2, Math.min(by, fy) - 20]
    expect(hitsAt(people, T0, overlap[0], overlap[1]).map(hit => hit.id)).toEqual(['front', 'back'])
    expect(hitsAt(people, T0, bx - 11, by - 20).map(hit => hit.id)).toEqual(['back'])
    expect(hitsAt(people, T0, 5, 5)).toEqual([])
    const leaving = people.get('front')
    if (leaving !== undefined) leaving.removedAt = 1
    expect(hitsAt(people, T0, overlap[0], overlap[1]).map(hit => hit.id)).toEqual(['back'])
  })

  test('Approvals and Flagged are buttons that open the waiting or the flagged cards in turn', async () => {
    const qa = made('qa', 'ios-team:qa-tester', { status: 'decision', seq: 1 })
    const an = made('an', 'ios-team:analytics', { status: 'blocked', seq: 2 })
    const rev = made('rev', 'ios-team:reviewer', { status: 'failed', seq: 3 })
    const s = buildSnapshot({ version: 1, now: T0, startedAt: T0, agents: { qa, an, rev }, coordinator: { ...IDLE_COORDINATOR, status: 'asking' }, events: [] })
    const waiting = openList(s, 'approvals')
    expect(waiting).toEqual(['qa', 'an', 'coordinator'])
    expect([nextOpen(waiting, undefined), nextOpen(waiting, 'qa'), nextOpen(waiting, 'an'), nextOpen(waiting, 'coordinator')]).toEqual(['qa', 'an', 'coordinator', 'qa'])
    expect(openList(s, 'flagged')).toEqual(['rev'])
    expect(nextOpen([], undefined)).toBeUndefined()
    const html = barHtml(s.hud)
    expect(html).toContain('data-open="approvals"')
    expect(html).toContain('data-open="flagged"')
  })

  test('hostile text from results stays plain text in the snapshot and is escaped in the HUD log', async () => {
    const qa = made('qa', 'ios-team:qa-tester')
    const hostile = ['```result', 'status: needs_decision', 'summary: <img src=x onerror=alert(1)>', 'needs_decision:', '  - {id: "<b>", question_ru: "<script>alert(1)</script>", options: ["<img src=x onerror=alert(2)>"]}', '```'].join('\n')
    const change = completeAgent({ qa }, 'qa', { parsed: parseResult(hostile), reason: 'answer', isAborted: false }, T0)
    const card = cardOf(change.agents, 'qa')
    expect(card?.asks[0]).toEqual({ id: 'b', question: '<script>alert(1)</script>', options: ['<img src=x onerror=alert(2)>'] })
    const log = logHtml(change.events)
    expect(log).not.toContain('<script>')
    expect(log).toContain('&lt;script&gt;')
  })
})

describe('Офис: card actions through the mod', () => {
  type Fills = { texts: string[]; accept: (value: boolean) => void }

  function prompt(on: On): Fills {
    const texts: string[] = []
    let isAccepting = true
    on('prompt.fill', ($, e) => {
      texts.push(e.text)
      return { isFilled: isAccepting, text: e.text, cursor: e.text.length }
    })
    return { texts, accept: value => (isAccepting = value) }
  }

  async function office($: Engine, on: On, spawns: Record<string, string>, options: HostOptions = {}) {
    const files = host(on, options)
    panes(on)
    const seen = world(on, spawns)
    await $.command.run(officeCommand)
    return { files, seen }
  }

  async function deliver(files: Host, seen: World, actions: Record<string, unknown>[]): Promise<Snapshot> {
    files.files.set(`${DIR}/inbox.json`, JSON.stringify(actions.map((one, index) => ({ request: `r${index + 1}`, text: '', at: 1, ...one }))))
    await seen.clock.advance(500)
    await seen.clock.advance(100)
    return files.published()
  }

  test('Converse puts a draft for that agent into the input; the ack reaches the page through the snapshot', async ($, on) => {
    const fills = prompt(on)
    const { files, seen } = await office($, on, { 'eng-1': 'claude-opus-5-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    const s = await deliver(files, seen, [{ action: 'converse', agent: 'eng-1' }])
    expect(fills.texts).toEqual(['Сообщение для ios-engineer (eng-1): '])
    expect(s.acks).toEqual([{ request: 'r1', ok: true, text: 'Поставил в поле ввода: «Сообщение для ios-engineer (eng-1):»', at: expect.any(Number) }])
    expect(files.files.get(`${DIR}/inbox.json`)).toBeUndefined()
    files.files.set(`${DIR}/inbox.json`, JSON.stringify([{ request: 'r1', action: 'converse', agent: 'eng-1', text: '', at: 1 }]))
    await seen.clock.advance(600)
    expect(fills.texts).toHaveLength(1)
    files.release()
  })

  test('without a prompt box the draft goes to the clipboard and the card says so', async ($, on) => {
    const fills = prompt(on)
    fills.accept(false)
    const copied: string[] = []
    on('ui.copy', ($, e) => {
      copied.push(e.text)
      return { value: { isCopied: true } }
    })
    const { files, seen } = await office($, on, { 'eng-1': 'claude-opus-5-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    const s = await deliver(files, seen, [{ action: 'converse', agent: 'eng-1' }])
    expect(copied).toEqual(['Сообщение для ios-engineer (eng-1):'])
    expect(s.acks[0]?.text).toBe('Поле ввода недоступно — скопировал в буфер обмена: «Сообщение для ios-engineer (eng-1):»')
    files.release()
  })

  test('Stop calls TaskStop, the agent stops at once and leaves; Stop is refused for the coordinator and for finished agents', async ($, on) => {
    prompt(on)
    const { files, seen } = await office($, on, { 'eng-1': 'claude-opus-5-5', 'gp-1': 'claude-haiku-4-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    await $.agent.spawn(spawn('general-purpose', 'Сводка'))
    await seen.clock.advance(15_000)
    await $.turn.complete(finish('gp-1', DONE))
    const s = await deliver(files, seen, [
      { action: 'stop', agent: 'eng-1', text: 'задача уже не нужна' },
      { action: 'stop', agent: 'coordinator' },
      { action: 'stop', agent: 'gp-1' },
    ])
    expect(seen.stops()).toEqual(['eng-1'])
    expect(status(snap(seen), 'eng-1')).toBe('stopped')
    expect(said(seen)).toContain('stopped by hand: from the office: задача уже не нужна')
    expect(s.acks.map(ack => [ack.request, ack.ok, ack.text])).toEqual([
      ['r1', true, 'Остановил ios-engineer'],
      ['r2', false, 'Координатора не останавливают из офиса'],
      ['r3', false, 'general-purpose не остановить: агент уже закончил или ушёл'],
    ])
    expect(person(s, 'eng-1')?.card.canStop).toBe(false)
    files.release()
  })

  test('when TaskStop is refused, the agent is put back and the stop request goes into the input instead', async ($, on) => {
    on('tool.call', { tool: 'TaskStop' }, () => ({ deny: 'TaskStop is not allowed here' }))
    const fills = prompt(on)
    const { files, seen } = await office($, on, { 'eng-1': 'claude-opus-5-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    await seen.clock.advance(15_000)
    const s = await deliver(files, seen, [{ action: 'stop', agent: 'eng-1', text: 'не нужно' }])
    expect(status(snap(seen), 'eng-1')).toBe('working')
    expect(fills.texts).toEqual(['Останови агента ios-engineer (eng-1): не нужно'])
    expect(s.acks[0]?.text).toBe('Не смог остановить сам (TaskStop is not allowed here). Поставил в поле ввода: «Останови агента ios-engineer (eng-1): не нужно»')
    files.release()
  })

  test('answers from the card become one ready message; after the resume the block says «Отвечено»', async ($, on) => {
    const fills = prompt(on)
    const { files, seen } = await office($, on, { 'qa-1': 'claude-sonnet-4-6' })
    await $.agent.spawn(spawn('ios-team:qa-tester', 'QA'))
    await seen.clock.advance(15_000)
    await $.turn.complete(finish('qa-1', QUESTIONS_RESULT))
    let s = await deliver(files, seen, [{ action: 'answer', agent: 'qa-1', answers: [{ id: 'd1', text: 'Да' }, { id: 'd2', text: 'Нет, только скрин' }] }])
    expect(fills.texts).toEqual(['Ответы для qa-tester: d1 — Да; d2 — Нет, только скрин. Продолжи этого же агента (qa-1) через SendMessage, не запускай нового.'])
    expect(s.acks[0]).toEqual({ request: 'r1', ok: true, text: 'Ответ в поле ввода — отправь его', at: expect.any(Number) })
    expect(person(s, 'qa-1')?.card.reply).toEqual({ state: 'filled', text: 'd1 — Да; d2 — Нет, только скрин', at: expect.any(Number) })
    expect(person(s, 'qa-1')?.card.asks).toHaveLength(2)
    s = await deliver(files, seen, [{ request: 'r7', action: 'answer', agent: 'qa-1', text: 'проверь и на iPad Pro' }])
    expect(fills.texts[1]).toBe('Ответ для qa-tester (d1 «Проверять на iPad?»): проверь и на iPad Pro. Продолжи этого же агента (qa-1) через SendMessage, не запускай нового.')
    await $.tool.call({ tool: 'SendMessage', to: 'qa-1', message: 'd1 — Да' } as unknown as ToolCallArgs)
    await seen.clock.advance(100)
    s = files.published()
    expect(person(s, 'qa-1')?.card.asks).toEqual([])
    expect(person(s, 'qa-1')?.card.reply).toEqual({ state: 'answered', text: 'проверь и на iPad Pro', at: expect.any(Number) })
    const late = await deliver(files, seen, [{ request: 'r9', action: 'answer', agent: 'qa-1', text: 'Да' }])
    expect(late.acks.at(-1)?.text).toBe('Вопроса больше нет: агент уже продолжил работу')
    files.release()
  })

  test('a SendMessage from the main agent wakes the waiting agent at once, by id or by name, with no flicker on its first tool call', async ($, on) => {
    const seen = world(on, { 'qa-1': 'claude-sonnet-4-6', 'an-1': 'claude-sonnet-4-6' })
    await $.agent.spawn(spawn('ios-team:qa-tester', 'QA'))
    await $.agent.spawn(spawn('ios-team:analytics', 'События'))
    await seen.clock.advance(15_000)
    await $.turn.complete(finish('qa-1', NEEDS_DECISION))
    await seen.clock.advance(20_000)
    expect(goal(snap(seen), 'qa-1')).toBe('coffee')
    await $.tool.call({ tool: 'SendMessage', to: 'qa-1', message: 'Да, проверяй на iPad' } as unknown as ToolCallArgs)
    let s = snap(seen)
    expect([status(s, 'qa-1'), person(s, 'qa-1')?.activity, goal(s, 'qa-1')]).toEqual(['working', 'Читает твой ответ', 'walk'])
    expect(person(s, 'qa-1')?.card.asks).toEqual([])
    expect(person(s, 'qa-1')?.card.reply?.state).toBe('answered')
    expect(said(seen)).toContain('got the answer')
    await $.tool.call({ tool: 'SendMessage', to: 'analytics', message: 'посмотри ещё события камеры' } as unknown as ToolCallArgs)
    s = snap(seen)
    expect([status(s, 'an-1'), person(s, 'an-1')?.activity]).toEqual(['working', 'Читает сообщение'])
    const before = said(seen).split('\n').length
    await $.tool.call(inAgent('qa-1', { tool: 'Read', file_path: '/wt/CameraTests.swift' }))
    s = snap(seen)
    expect([status(s, 'qa-1'), person(s, 'qa-1')?.activity]).toEqual(['working', 'Читает CameraTests.swift'])
    expect(said(seen).split('\n').length).toBe(before)
  })

  test('a SendMessage that is refused or fails puts the agent back exactly as it was', async ($, on) => {
    let denies = true
    on('tool.call', { tool: 'SendMessage' }, () => (denies ? { deny: 'no such agent' } : { isError: true as const, result: 'the agent is gone' }))
    const seen = world(on, { 'qa-1': 'claude-sonnet-4-6' })
    await $.agent.spawn(spawn('ios-team:qa-tester', 'QA'))
    await seen.clock.advance(15_000)
    await $.turn.complete(finish('qa-1', NEEDS_DECISION))
    await seen.clock.advance(20_000)
    const before = snap(seen)
    await $.tool.call({ tool: 'SendMessage', to: 'qa-1', message: 'Да' } as unknown as ToolCallArgs)
    let after = snap(seen)
    expect([status(after, 'qa-1'), goal(after, 'qa-1'), person(after, 'qa-1')?.card.asks]).toEqual([status(before, 'qa-1'), goal(before, 'qa-1'), person(before, 'qa-1')?.card.asks])
    denies = false
    await $.tool.call({ tool: 'SendMessage', to: 'qa-1', message: 'Да' } as unknown as ToolCallArgs)
    after = snap(seen)
    expect(status(after, 'qa-1')).toBe('decision')
    expect(said(seen)).not.toContain('got the answer')
  })

  test('a TaskStop from the main agent stops the agent at once, and a refused one puts it back', async ($, on) => {
    let release: () => void = () => undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    let refuse = false
    on('tool.call', { tool: 'TaskStop' }, async () => {
      await gate
      return refuse ? { deny: 'denied by the user' } : { result: {} as never }
    })
    const seen = world(on, { 'gp-1': 'claude-haiku-4-5', 'gp-2': 'claude-haiku-4-5' })
    await $.agent.spawn(spawn('general-purpose', 'Сводка'))
    await $.agent.spawn(spawn('general-purpose', 'Поиск'))
    await seen.clock.advance(20_000)
    const stopping = $.tool.call({ tool: 'TaskStop', task_id: 'gp-1' } as unknown as ToolCallArgs)
    await seen.clock.settle()
    expect(status(snap(seen), 'gp-1')).toBe('stopped')
    release()
    await stopping
    expect(status(snap(seen), 'gp-1')).toBe('stopped')
    refuse = true
    await $.tool.call({ tool: 'TaskStop', task_id: 'gp-2' } as unknown as ToolCallArgs)
    expect(status(snap(seen), 'gp-2')).toBe('working')
  })

  test('the coordinator question from AskUserQuestion is live in the card and goes away once answered', async ($, on) => {
    let release: () => void = () => undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    on('tool.call', { tool: 'AskUserQuestion' }, async () => {
      await gate
      return { result: { questions: [], answers: {} } }
    })
    const seen = world(on, {})
    const asking = $.tool.call({
      tool: 'AskUserQuestion',
      questions: [{ question: 'Берём роутер из HomeFeature?', header: 'Роутер', multiSelect: false, options: [{ label: 'Да', description: 'да' }, { label: 'Нет', description: 'нет' }] }],
    })
    await seen.clock.settle()
    let card = snap(seen).boss.card
    expect([card.isReadOnly, card.asks]).toEqual([false, [{ id: 'q1', question: 'Берём роутер из HomeFeature?', options: ['Да', 'Нет'] }]])
    expect(card.ask).toMatch(/^ask-[0-9a-f]{8}$/)
    release()
    await asking
    card = snap(seen).boss.card
    expect([card.asks, card.ask, card.isReadOnly]).toEqual([[], undefined, true])
  })

  test('a denied tool of an agent shows up in its warnings', async ($, on) => {
    on('tool.call', { tool: 'Bash' }, () => ({ deny: 'rm -rf is not allowed' }))
    const seen = world(on, { 'eng-1': 'claude-opus-5-5' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    await seen.clock.advance(15_000)
    await $.tool.call(inAgent('eng-1', { tool: 'Bash', command: 'rm -rf /tmp/x' }))
    expect(person(snap(seen), 'eng-1')?.card.notes.map(note => [note.kind, note.text])).toEqual([['denied', 'Bash: rm -rf is not allowed']])
  })
})

describe('Офис: answering the coordinator from the office', () => {
  const ROUTER = 'Берём роутер из HomeFeature?'
  const SCREENS = 'Какие экраны проверить?'
  const QUESTIONS = [
    { question: ROUTER, header: 'Роутер', multiSelect: false, options: [{ label: 'Да (Recommended)', description: 'да' }, { label: 'Нет', description: 'нет' }] },
    { question: SCREENS, header: 'Экраны', multiSelect: true, options: [{ label: 'Камера', description: 'к' }, { label: 'Галерея', description: 'г' }, { label: 'Профиль', description: 'п' }] },
  ]

  type Dialog = { calls: () => number; aborted: () => boolean; answer: (answers: Record<string, string>) => void; liveAtCall: () => unknown[] }

  function dialog(on: On, seen: () => Seen | undefined): Dialog {
    let calls = 0
    let aborted = false
    const liveAtCall: unknown[] = []
    let answer: (answers: Record<string, string>) => void = () => undefined
    on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
      calls += 1
      liveAtCall.push((seen()?.get('coordinator') as OfficeCoordinator | undefined)?.live)
      next.signal.addEventListener('abort', () => (aborted = true))
      const answers = await new Promise<Record<string, string>>(resolve => (answer = resolve))
      return { result: { questions: (e as unknown as { questions: unknown }).questions, answers } as never }
    })
    return { calls: () => calls, aborted: () => aborted, answer: answers => answer(answers), liveAtCall: () => liveAtCall }
  }

  async function office($: Engine, on: On, before?: (on: On) => void) {
    let state: Seen | undefined
    const asks = dialog(on, () => state)
    before?.(on)
    const files = host(on)
    panes(on)
    const seen = world(on, {})
    state = seen.state
    await $.command.run(officeCommand)
    return { files, seen, asks }
  }

  function ask($: Engine, questions: unknown[] = QUESTIONS) {
    return $.tool.call({ tool: 'AskUserQuestion', questions } as unknown as ToolCallArgs)
  }

  async function deliver(files: Host, seen: World, actions: Record<string, unknown>[]): Promise<Snapshot> {
    files.files.set(`${DIR}/inbox.json`, JSON.stringify(actions.map((one, index) => ({ request: `b${index + 1}`, action: 'answer', agent: 'coordinator', text: '', at: 1, ...one }))))
    await seen.clock.advance(500)
    await seen.clock.advance(100)
    return files.published()
  }

  test('the native dialog opens before the mod writes anything, and a page answer wins: the dialog closes and the model gets a normal answer', async ($, on) => {
    const { files, seen, asks } = await office($, on)
    const asking = ask($)
    await seen.clock.settle()
    await seen.clock.advance(100)
    expect(asks.calls()).toBe(1)
    expect(asks.liveAtCall()).toEqual([undefined])
    let s = files.published()
    const id = s.boss.card.ask
    expect(s.boss.card.isReadOnly).toBe(false)
    expect(s.boss.card.asks.map(one => [one.id, one.recommended, one.multi])).toEqual([
      ['q1', 'Да (Recommended)', undefined],
      ['q2', undefined, true],
    ])
    s = await deliver(files, seen, [{ ask: id, answers: [{ id: 'q1', text: 'Да (Recommended)' }, { id: 'q2', text: 'Камера, Профиль' }] }])
    const ran = await asking
    expect(ran.result).toEqual({ questions: QUESTIONS, answers: { [ROUTER]: 'Да (Recommended)', [SCREENS]: 'Камера, Профиль' } })
    expect(asks.calls()).toBe(1)
    expect(asks.aborted()).toBe(true)
    expect(s.acks.at(-1)?.text).toBe('Ответ отправлен в Claude')
    await seen.clock.advance(100)
    s = files.published()
    expect([s.boss.card.asks, s.boss.card.ask, s.boss.card.reply?.state, s.boss.card.reply?.text]).toEqual([[], undefined, 'office', 'Да (Recommended); Камера, Профиль'])
    expect(said(seen)).toContain('ответ из офиса: Да (Recommended); Камера, Профиль')
    files.release()
  })

  test('free text and a single question: «Свой ответ» goes in as the answer', async ($, on) => {
    const { files, seen } = await office($, on)
    const asking = ask($, [QUESTIONS[0]])
    await seen.clock.settle()
    await seen.clock.advance(100)
    const id = files.published().boss.card.ask
    await deliver(files, seen, [{ ask: id, answers: [{ id: 'q1', text: 'Только если он уже в Frameworks', other: true }] }])
    expect((await asking).result).toEqual({ questions: [QUESTIONS[0]], answers: { [ROUTER]: 'Только если он уже в Frameworks' } })
    files.release()
  })

  test('a page answer is checked against the pending question: a foreign or missing ask id, a wrong option, a bad multi-select and a missing answer are refused', async ($, on) => {
    const { files, seen, asks } = await office($, on)
    const asking = ask($)
    await seen.clock.settle()
    await seen.clock.advance(100)
    const id = files.published().boss.card.ask
    const s = await deliver(files, seen, [
      { ask: 'ask-00000000', answers: [{ id: 'q1', text: 'Нет' }, { id: 'q2', text: 'Камера' }] },
      { answers: [{ id: 'q1', text: 'Нет' }, { id: 'q2', text: 'Камера' }] },
      { ask: id, answers: [{ id: 'q1', text: 'Может быть' }, { id: 'q2', text: 'Камера' }] },
      { ask: id, answers: [{ id: 'q1', text: 'Нет' }, { id: 'q2', text: 'Камера, Настройки' }] },
      { ask: id, answers: [{ id: 'q1', text: 'Нет' }, { id: 'q2', text: 'Камера, Камера' }] },
      { ask: id, answers: [{ id: 'q1', text: 'Нет' }] },
      { ask: id, answers: [{ id: 'q1', text: 'Нет' }, { id: 'q1', text: 'Да (Recommended)' }] },
      { ask: id, answers: [{ id: 'q1', text: '   ' }, { id: 'q2', text: 'Камера' }] },
    ])
    expect(s.acks.map(ack => [ack.ok, ack.text])).toEqual([
      [false, 'Вопрос уже закрыт — ответь в окне Claude, если он ещё открыт'],
      [false, 'Вопрос уже закрыт — ответь в окне Claude, если он ещё открыт'],
      [false, 'Такого варианта нет в вопросе'],
      [false, 'Такого варианта нет в вопросе'],
      [false, 'Такого варианта нет в вопросе'],
      [false, 'Ответь на каждый вопрос'],
      [false, 'Ответ не к этому вопросу'],
      [false, 'Пустой ответ: выбери вариант или напиши свой'],
    ])
    expect(files.published().boss.card.reply).toBeUndefined()
    expect(asks.aborted()).toBe(false)
    asks.answer({ [ROUTER]: 'Нет', [SCREENS]: 'Галерея' })
    expect((await asking).result).toEqual({ questions: QUESTIONS, answers: { [ROUTER]: 'Нет', [SCREENS]: 'Галерея' } })
    files.release()
  })

  test('with the page closed the dialog alone answers; a late page answer and a stale ask id are refused', async ($, on) => {
    const { files, seen, asks } = await office($, on)
    const first = ask($)
    await seen.clock.settle()
    await seen.clock.advance(100)
    const old = files.published().boss.card.ask
    asks.answer({ [ROUTER]: 'Нет', [SCREENS]: 'Галерея' })
    expect((await first).result).toEqual({ questions: QUESTIONS, answers: { [ROUTER]: 'Нет', [SCREENS]: 'Галерея' } })
    expect(asks.aborted()).toBe(false)
    await seen.clock.advance(100)
    let s = files.published()
    expect([s.boss.card.asks, s.boss.card.reply?.state, s.boss.card.reply?.text]).toEqual([[], 'claude', 'Нет; Галерея'])
    expect(said(seen)).not.toContain('ответ из офиса')
    s = await deliver(files, seen, [{ ask: old, answers: [{ id: 'q1', text: 'Да (Recommended)' }, { id: 'q2', text: 'Камера' }] }])
    expect(s.acks.at(-1)?.text).toBe('Вопрос уже закрыт — ответь в окне Claude, если он ещё открыт')
    const second = ask($, [QUESTIONS[0]])
    await seen.clock.settle()
    await seen.clock.advance(100)
    const fresh = files.published().boss.card.ask
    expect(fresh).not.toBe(old)
    s = await deliver(files, seen, [{ request: 'b9', ask: old, answers: [{ id: 'q1', text: 'Да (Recommended)' }] }])
    expect(s.acks.at(-1)?.text).toBe('Вопрос уже закрыт — ответь в окне Claude, если он ещё открыт')
    asks.answer({ [ROUTER]: 'Да (Recommended)' })
    await second
    files.release()
  })

  test('when the mod cannot keep its state, the call falls back to the dialog and is never asked twice', async ($, on) => {
    let isBroken = false
    const { files, seen, asks } = await office($, on, below =>
      below('state.get', ($, e, next) => {
        const key = (e as unknown as { key: string }).key
        return isBroken && key === 'coordinator' ? ({ value: null } as never) : next(e)
      }),
    )
    isBroken = true
    const asking = ask($)
    await seen.clock.settle()
    isBroken = false
    await seen.clock.advance(100)
    expect(files.published().boss.card.isReadOnly).toBe(true)
    asks.answer({ [ROUTER]: 'Нет', [SCREENS]: 'Профиль' })
    expect((await asking).result).toEqual({ questions: QUESTIONS, answers: { [ROUTER]: 'Нет', [SCREENS]: 'Профиль' } })
    expect(asks.calls()).toBe(1)
    files.release()
  })

  test(
    'an abort from above clears the pending question, and so do /clear and the session end',
    {
      plugins: [
        {
          name: 'interrupts',
          tier: 'prepend',
          register(on) {
            on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
              const questions = (e as unknown as { questions: { question: string }[] }).questions
              if (questions[0]?.question !== 'Прервать?') return next(e)
              void next(e).catch(() => undefined)
              await $.clock.sleep(1_000)
              return { deny: 'interrupted' }
            })
          },
        },
      ],
    },
    async ($, on) => {
      on('session.end', ($, e) => ({ sessionId: e.sessionId }))
      const { files, seen, asks } = await office($, on)
      const stopped = ask($, [{ ...QUESTIONS[0], question: 'Прервать?' }])
      await seen.clock.settle()
    await seen.clock.advance(100)
      const id = files.published().boss.card.ask
      expect(id).toBeDefined()
      await seen.clock.advance(1_000)
      expect((await stopped).deny).toBe('interrupted')
      await seen.clock.advance(100)
      expect(asks.aborted()).toBe(true)
      let s = files.published()
      expect([s.boss.card.asks, s.boss.card.ask]).toEqual([[], undefined])
      s = await deliver(files, seen, [{ ask: id, answers: [{ id: 'q1', text: 'Нет' }] }])
      expect(s.acks.at(-1)?.text).toBe('Вопрос уже закрыт — ответь в окне Claude, если он ещё открыт')
      const cleared = ask($, [QUESTIONS[0]])
      await seen.clock.settle()
    await seen.clock.advance(100)
      expect(files.published().boss.card.ask).toBeDefined()
      await $.session.end({ reason: 'clear', sessionId: 's-1', resume: { id: 's-1' } })
      await seen.clock.advance(100)
      s = files.published()
      expect([s.boss.card.asks, s.boss.card.ask]).toEqual([[], undefined])
      asks.answer({ [ROUTER]: 'Нет' })
      await cleared
      const ended = ask($, [QUESTIONS[0]])
      await seen.clock.settle()
    await seen.clock.advance(100)
      expect((seen.state.get('coordinator') as OfficeCoordinator).live).toBeDefined()
      await $.session.end({ reason: 'other', sessionId: 's-2', resume: { id: 's-2' } })
      expect((seen.state.get('coordinator') as OfficeCoordinator).live).toBeUndefined()
      asks.answer({ [ROUTER]: 'Нет' })
      await ended
      files.release()
    },
  )
})

describe('Офис: what agents do, in plain Russian', () => {
  const say = (tool: string, args: Record<string, unknown> = {}) => describeTool(tool, args).text
  const bash = (command: string) => say('Bash', { command })

  test('searching, reading, listing, editing and creating', async () => {
    expect(say('Grep', { pattern: 'Router', path: '/Users/dev/app/Modules/HomeFeature' })).toBe('Ищет "Router" в HomeFeature')
    expect(bash('grep -rn "isLivePhoto" Modules/EditorFeature/Sources')).toBe('Ищет "isLivePhoto" в Sources')
    expect(bash('rg -n "very long pattern that goes on and on and on"')).toBe('Ищет "very long pattern that goes o…"')
    expect(say('Read', { file_path: '/wt/Modules/HomeFeature/HomeModel.swift' })).toBe('Читает HomeModel.swift')
    expect(bash('cat /wt/Project.swift')).toBe('Читает Project.swift')
    expect(bash("sed -n '1,80p' /wt/Modules/HomeFeature/HomeModel.swift")).toBe('Читает HomeModel.swift')
    expect(bash('head -40 /wt/README.md')).toBe('Читает README.md')
    expect(bash('ls -la /wt/Modules/HomeFeature')).toBe('Смотрит файлы в HomeFeature')
    expect(bash('find Modules -name "*.swift"')).toBe('Смотрит файлы в Modules')
    expect(say('Glob', { pattern: 'Modules/**/*Router*.swift' })).toBe('Смотрит файлы в Modules')
    expect(say('Edit', { file_path: '/wt/A/B/CameraView.swift' })).toBe('Правит CameraView.swift')
    expect(say('Write', { file_path: '/wt/A/B/NewView.swift' })).toBe('Создаёт NewView.swift')
  })

  test('builds, lint, git, PRs, the simulator, the web, Jira, Confluence, skills, agents and messages', async () => {
    expect(bash('xcodebuild -scheme App-PR test')).toBe('Собирает и гоняет тесты')
    expect(bash('./Scripts/gate.sh')).toBe('Собирает и гоняет тесты')
    expect(bash('swiftlint lint --quiet')).toBe('Проверяет стиль кода')
    expect(bash('git diff develop...HEAD')).toBe('Смотрит изменения в git')
    expect(bash('git log --oneline -5')).toBe('Смотрит изменения в git')
    expect(bash('git status --short')).toBe('Смотрит изменения в git')
    expect(bash('git commit -m "PROJ-1: x"')).toBe('Коммитит')
    expect(bash('gh pr view 1254 --json title')).toBe('Читает PR #1254')
    expect(bash('gh pr diff 1254')).toBe('Читает PR #1254')
    expect(say('mcp__Claude_Code_iOS_Simulator__control', { action: 'tap' })).toBe('Нажимает в симуляторе')
    expect(say('mcp__Claude_Code_iOS_Simulator__control', { action: 'screenshot' })).toBe('Снимает экран симулятора')
    expect(bash('xcrun simctl install booted App.app')).toBe('Ставит приложение на симулятор/телефон')
    expect(bash('./scripts/ios.sh run')).toBe('Ставит приложение на симулятор/телефон')
    expect(say('WebFetch', { url: 'https://example.com' })).toBe('Ищет в интернете')
    expect(say('WebSearch', { query: 'swiftui' })).toBe('Ищет в интернете')
    expect(say('mcp__04c7__getJiraIssue', { issueIdOrKey: 'PROJ-123' })).toBe('Читает задачу PROJ-123')
    expect(say('mcp__04c7__getConfluencePage', { pageId: '42' })).toBe('Читает страницу Confluence')
    expect(say('Skill', { skill: 'ios-team:project-lead' })).toBe('Открывает правила: project-lead')
    expect(say('Agent', { subagent_type: 'ios-team:qa-tester' })).toBe('Поручает задачу: qa-tester')
    expect(say('SendMessage', { to: 'ios-engineer' })).toBe('Пишет агенту ios-engineer')
    expect(say('AskUserQuestion', { questions: [{ question: 'Начинаем?' }] })).toBe('Задаёт тебе вопрос')
  })

  test('a compound command takes its first meaningful part; unknown commands and secret-looking paths', async () => {
    expect(bash('cd /wt && grep -rn "Router" Modules | head -20')).toBe('Ищет "Router" в Modules')
    expect(bash('echo start; cd /tmp && xcodebuild test | tail -5')).toBe('Собирает и гоняет тесты')
    expect(bash('frobnicate --all')).toBe('Выполняет команду frobnicate')
    const config = ['Sec', 'rets/App.xc', 'config'].join('')
    const key = ['/wt/keys/AuthKey_ABC', '.p', '8'].join('')
    expect(bash(`cat ${config}`)).toBe('Читает …')
    expect(say('Read', { file_path: key })).toBe('Читает …')
    expect(bash(`grep API_TOKEN ${['.e', 'nv'].join('')}`)).toBe('Ищет «…» в …')
    expect(say('Grep', { pattern: 'password', path: '/wt/Modules' })).toBe('Ищет «…» в Modules')
    expect(Array.from(say('Read', { file_path: `/wt/${'VeryLongName'.repeat(10)}.swift` })).length).toBeLessThanOrEqual(60)
  })

  test('spend says it will be counted when the agent finishes, shows running steps, then the final figure', async ($, on) => {
    on('turn.step', async function* ($, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: { input_tokens: 20_000, output_tokens: 1_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-sonnet-4-6' } as never, messageCount: 1 }
    })
    const seen = world(on, { 'eng-1': 'claude-sonnet-4-6' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    expect(person(snap(seen), 'eng-1')?.card.spend).toBe('pending')
    for await (const chunk of $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-4-6', messageCount: 1, agentId: 'eng-1' } as never)) void chunk
    let card = person(snap(seen), 'eng-1')?.card
    expect([card?.spend, card?.tokens]).toEqual(['running', 21_000])
    expect(card?.cost).toBeGreaterThan(0)
    await $.turn.complete(finish('eng-1', DONE, { input_tokens: 50_000, output_tokens: 2_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }))
    card = person(snap(seen), 'eng-1')?.card
    expect([card?.spend, card?.tokens]).toEqual(['final', 52_000])
  })
})

describe('Офис: writing from the office and opening the session', () => {
  type Submits = { texts: string[]; mode: (how: 'enter' | 'hold' | 'drop' | 'throw') => void; release: () => void }

  function submits(on: On): Submits {
    const texts: string[] = []
    let how: 'enter' | 'hold' | 'drop' | 'throw' = 'enter'
    let open: () => void = () => undefined
    on('prompt.submit', async ($, e) => {
      texts.push(e.text)
      if (how === 'throw') throw new Error('no prompt box in this session')
      if (how === 'drop') return { drop: 'в окне Claude открыт диалог' }
      if (how === 'hold') await new Promise<void>(resolve => (open = resolve))
      return { text: e.text }
    })
    return { texts, mode: next => (how = next), release: () => open() }
  }

  function sessionTool(on: On, reply: () => { content: { type: string; text: string }[]; isError: boolean }) {
    const calls: string[] = []
    on('mcp.call', ($, e) => {
      calls.push(`${e.server}/${e.tool}/${JSON.stringify(e.args)}`)
      return { value: reply() }
    })
    return calls
  }

  async function office($: Engine, on: On, spawns: Record<string, string> = {}, link: () => { content: { type: string; text: string }[]; isError: boolean } = () => ({ content: [], isError: true })) {
    const calls = sessionTool(on, link)
    const sent = submits(on)
    const files = host(on, { canOpen: true })
    panes(on)
    const seen = world(on, spawns)
    await $.command.run(officeCommand)
    await seen.clock.advance(100)
    return { files, seen, sent, calls }
  }

  async function deliver(files: Host, seen: World, actions: Record<string, unknown>[]): Promise<Snapshot> {
    files.files.set(`${DIR}/inbox.json`, JSON.stringify(actions.map((one, index) => ({ request: `w${index + 1}`, text: '', at: 1, ...one }))))
    await seen.clock.advance(500)
    await seen.clock.advance(100)
    return files.published()
  }

  const LINK = 'claude://claude.ai/epitaxy/local_7f3a9c21-55e0-4c2b-9a1e-0d4f8b6e2c11'

  test("a message to an agent is submitted as the user's own prompt, then marked sent and delivered once the coordinator passes it on", async ($, on) => {
    const { files, seen, sent } = await office($, on, { 'eng-1': 'claude-sonnet-4-6' })
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    let s = await deliver(files, seen, [{ action: 'say', agent: 'eng-1', text: '  Проверь   ещё\u0007 iPad\r\nи поворот  ' }])
    const full = 'Сообщение для ios-engineer (eng-1): Проверь ещё iPad\nи поворот'
    expect(sent.texts).toEqual([full])
    expect(person(s, 'eng-1')?.card.said.map(one => [one.text, one.state])).toEqual([['Проверь ещё iPad и поворот', 'queued']])
    expect(s.events.at(-1)).toEqual(expect.objectContaining({ who: 'Вы → ios-engineer', text: 'Проверь ещё iPad и поворот' }))
    await $.turn.start({ turnId: 't9', text: full })
    await seen.clock.advance(100)
    s = files.published()
    expect(person(s, 'eng-1')?.card.said[0]?.state).toBe('sent')
    await $.tool.call({ tool: 'SendMessage', to: 'ios-engineer', message: 'Проверь ещё iPad' } as unknown as ToolCallArgs)
    await seen.clock.advance(100)
    s = files.published()
    expect(person(s, 'eng-1')?.card.said[0]?.state).toBe('delivered')
    files.release()
  })

  test('a message to the coordinator goes in bare, and turns «answered» when that turn completes', async ($, on) => {
    const { files, seen, sent } = await office($, on)
    let s = await deliver(files, seen, [{ action: 'say', agent: 'coordinator', text: 'Как там PROJ-1795?' }])
    expect(sent.texts).toEqual(['Как там PROJ-1795?'])
    expect(s.acks.at(-1)?.text).toBe('Отправлено в Claude')
    await $.turn.start({ turnId: 't5', text: 'Как там PROJ-1795?' })
    await $.turn.complete({ answer: 'Идёт ревью.', durationMs: 5, isAborted: false, turnId: 't5', reason: 'answer' })
    await seen.clock.advance(100)
    s = files.published()
    expect(s.boss.card.said.map(one => [one.text, one.state])).toEqual([['Как там PROJ-1795?', 'answered']])
    files.release()
  })

  test('while the coordinator works the message waits, then enters once its turn starts', async ($, on) => {
    const { files, seen, sent } = await office($, on)
    sent.mode('hold')
    await $.turn.start({ turnId: 't1', text: 'долгая задача' })
    let s = await deliver(files, seen, [{ action: 'say', agent: 'coordinator', text: 'и ещё вот это' }])
    expect(s.acks.at(-1)?.text).toBe('Отправлено — ждёт, пока координатор освободится')
    expect(s.boss.card.said[0]?.state).toBe('queued')
    sent.release()
    await $.turn.complete({ answer: 'готово', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
    await $.turn.start({ turnId: 't2', text: 'и ещё вот это' })
    await seen.clock.advance(100)
    s = files.published()
    expect(s.boss.card.said[0]?.state).toBe('sent')
    files.release()
  })

  test('a refused submit says why and keeps the message; a throw is a refusal too', async ($, on) => {
    const { files, seen, sent } = await office($, on, { 'qa-1': 'claude-sonnet-4-6' })
    await $.agent.spawn(spawn('ios-team:qa-tester', 'QA'))
    sent.mode('drop')
    await deliver(files, seen, [{ action: 'say', agent: 'qa-1', text: 'Сними видео' }])
    await seen.clock.advance(100)
    let s = files.published()
    expect(person(s, 'qa-1')?.card.said.map(one => [one.text, one.state, one.why])).toEqual([['Сними видео', 'refused', 'в окне Claude открыт диалог']])
    sent.mode('throw')
    await deliver(files, seen, [{ request: 'w7', action: 'say', agent: 'qa-1', text: 'И скриншоты' }])
    await seen.clock.advance(100)
    s = files.published()
    expect(person(s, 'qa-1')?.card.said[0]).toEqual(expect.objectContaining({ text: 'И скриншоты', state: 'refused', why: expect.any(String) }))
    files.release()
  })

  test('one submit per request id: a repeated request is not sent twice; empty, oversize and gone targets are refused', async ($, on) => {
    const { files, seen, sent } = await office($, on, { 'gp-1': 'claude-haiku-4-5' })
    await $.agent.spawn(spawn('general-purpose', 'Сводка'))
    await deliver(files, seen, [
      { request: 'same', action: 'say', agent: 'coordinator', text: 'раз' },
      { request: 'same', action: 'say', agent: 'coordinator', text: 'раз' },
    ])
    let s = await deliver(files, seen, [
      { request: 'same', action: 'say', agent: 'coordinator', text: 'раз' },
      { request: 'e1', action: 'say', agent: 'coordinator', text: ' \u0000\t ' },
      { request: 'e2', action: 'say', agent: 'nobody', text: 'привет' },
    ])
    expect(sent.texts).toEqual(['раз'])
    expect(s.acks.slice(-2).map(ack => [ack.ok, ack.text])).toEqual([
      [false, 'Пустое сообщение: напиши текст, до 2000 знаков'],
      [false, 'Этого агента уже нет в офисе'],
    ])
    await $.tool.call({ tool: 'TaskStop', task_id: 'gp-1' } as unknown as ToolCallArgs)
    await seen.clock.advance(60_000)
    s = await deliver(files, seen, [{ request: 'e3', action: 'say', agent: 'gp-1', text: 'ты где?' }])
    expect(s.acks.at(-1)?.text).toBe('Этого агента уже нет в офисе')
    expect(sent.texts).toEqual(['раз'])
    files.release()
  })

  test('hostile text goes in as plain text: bidi and control characters are stripped, markup stays text', async ($, on) => {
    const { files, seen, sent } = await office($, on)
    const s = await deliver(files, seen, [{ action: 'say', agent: 'coordinator', text: '<img src=x onerror="alert(1)">\u202eтекст\u2066 \u001b[31mкрасный' }])
    expect(sent.texts).toEqual(['<img src=x onerror="alert(1)"> текст [31mкрасный'])
    expect(s.boss.card.said[0]?.text).toBe('<img src=x onerror="alert(1)"> текст [31mкрасный')
    expect(logHtml(s.events)).not.toContain('<img')
    files.release()
  })

  test('the session link comes from ccd_session_mgmt get_session for "self"; the pane and the page open it with open', async ($, on) => {
    const { files, seen, calls } = await office($, on, {}, () => ({ content: [{ type: 'text', text: JSON.stringify({ sessionId: 'local_7f3a', title: 'PROJ-1795', link: LINK }) }], isError: false }))
    expect(calls[0]).toBe('ccd_session_mgmt/get_session/{"session_id":"self"}')
    const s = files.published()
    expect(s.session).toEqual({ key: 'PROJ-1795', main: 'PROJ-1795', sub: '', link: LINK })
    expect(barHtml(s.hud)).not.toContain('Открыть сессию в Claude')
    const shown = await pane($)
    expect(shown.keys).toContain('open-session')
    const ui = await $.ui.mount({ ...MOUNT, surface: 'desktop' })
    await ui.press({ key: 'open-session' })
    await ui.unmount()
    const acked = await deliver(files, seen, [{ action: 'session', agent: 'coordinator' }])
    expect(files.runs.filter(argv => argv[0] === 'open' && argv[1] === LINK)).toHaveLength(2)
    expect(acked.acks.at(-1)?.text).toBe('Открыл сессию в Claude')
    files.release()
  })

  test('the session label: the ticket key from the branch, the title or the folder, never twice; the tab title carries the key', async () => {
    expect(ticketOf('feature/PROJ-1854', 'Ревью PROJ-1700', 'app-PROJ-1600')).toBe('PROJ-1854')
    expect(ticketOf('develop', 'Ревью PROJ-1700', 'app-PROJ-1600')).toBe('PROJ-1700')
    expect(ticketOf('', 'Без номера', 'app-PROJ-1600')).toBe('PROJ-1600')
    expect(ticketOf('', '', 'app')).toBe('')
    expect(sessionLabel('Work tree feature', 'feature/PROJ-1854', 'app-PROJ-1854')).toEqual({ key: 'PROJ-1854', main: 'PROJ-1854 · Work tree feature', sub: 'feature/PROJ-1854 · app-PROJ-1854' })
    expect(sessionLabel('Work tree feature PROJ-1854', 'feature/PROJ-1854', 'app-PROJ-1854').main).toBe('Work tree feature PROJ-1854')
    expect(sessionLabel('', 'bugfix/PROJ-77', '')).toEqual({ key: 'PROJ-77', main: 'PROJ-77', sub: 'bugfix/PROJ-77' })
    expect(sessionLabel('', '', 'app')).toEqual({ key: '', main: 'app', sub: '' })
    expect(tabTitle({ key: 'PROJ-1854', main: 'x', sub: '' })).toBe('Офис · PROJ-1854')
    expect(tabTitle({ key: '', main: 'app', sub: '' })).toBe('Офис')
    expect(tabTitle(undefined)).toBe('Офис')
  })

  test('the label comes from get_session, the git branch and the worktree folder, and refreshes on /office and every five minutes', { timeoutMs: 30_000 }, async ($, on) => {
    let title = 'Work tree feature'
    let branch = 'feature/PROJ-1854'
    on('session.root', () => ({ value: '/Users/dev/app-PROJ-1854' }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    const calls = sessionTool(on, () => ({ content: [{ type: 'text', text: JSON.stringify({ title, link: LINK }) }], isError: false }))
    submits(on)
    const files = host(on, { canOpen: true, branch: () => branch })
    panes(on)
    const seen = world(on, {})
    await $.command.run(officeCommand)
    await seen.clock.advance(100)
    let s = files.published()
    expect(s.session).toEqual({ key: 'PROJ-1854', main: 'PROJ-1854 · Work tree feature', sub: 'feature/PROJ-1854 · app-PROJ-1854', link: LINK })
    expect(files.runs).toContainEqual(['git', '-C', '/Users/dev/app-PROJ-1854', 'branch', '--show-current'])
    title = '<img src=x onerror="alert(1)">\u202e Новый заголовок'
    branch = 'not a branch; rm -rf /'
    await $.command.run(officeCommand)
    await seen.clock.advance(100)
    s = files.published()
    expect(s.session).toEqual({ key: 'PROJ-1854', main: 'PROJ-1854 · <img src=x onerror="alert(1)"> Новый заголовок', sub: 'app-PROJ-1854', link: LINK })
    const before = calls.length
    await $.session.start({ cwd: '/tmp/x', surface: 'desktop', isInteractive: true })
    title = 'Ревью'
    await seen.clock.advance(5 * 60_000 + 100)
    await seen.clock.advance(100)
    expect(calls.length).toBeGreaterThan(before)
    expect(files.published().session?.main).toBe('PROJ-1854 · Ревью')
    files.release()
  })

  test('no link, a refusal, an error or a foreign link hide the button and say why in the pane', async ($, on) => {
    let reply: () => { content: { type: string; text: string }[]; isError: boolean } = () => ({ content: [{ type: 'text', text: 'denied by the auto mode classifier' }], isError: true })
    const { files, seen } = await office($, on, {}, () => reply())
    let shown = await pane($)
    expect(shown.keys).not.toContain('open-session')
    expect(shown.text).toContain('Сессия в Claude: ccd_session_mgmt отказал: denied by the auto mode classifier')
    expect(files.published().session).toBeUndefined()
    reply = () => ({ content: [{ type: 'text', text: '{"link":"claude://evil.example/x"}' }], isError: false })
    await $.command.run(officeCommand)
    await seen.clock.advance(100)
    shown = await pane($)
    expect(shown.text).toContain('Сессия в Claude: в ответе ccd_session_mgmt нет ссылки claude://')
    reply = () => {
      throw new Error('tool not allowed')
    }
    await $.command.run(officeCommand)
    await seen.clock.advance(100)
    shown = await pane($)
    expect(shown.keys).not.toContain('open-session')
    const s = await deliver(files, seen, [{ action: 'session', agent: 'coordinator' }])
    expect(s.acks.at(-1)?.ok).toBe(false)
    expect(files.runs.some(argv => argv[0] === 'open' && String(argv[1]).startsWith('claude://'))).toBe(false)
    files.release()
  })
})

describe('Офис: model, effort and the route reason', () => {
  const STEP = { answer: '', toolUses: [], stopReason: 'end_turn' as const, messageCount: 1 }

  async function step($: Engine, effort: string, agentId?: string) {
    for await (const chunk of $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-4-6', messageCount: 1, effort, ...(agentId !== undefined ? { agentId } : {}) } as never)) void chunk
  }

  test('the effort the Agent call asks for shows next to the model, in words', async ($, on) => {
    let callId = ''
    on('tool.call', { tool: 'Agent' }, ($, e) => {
      callId = e.tool_use_id
      return { result: {} as never }
    })
    const seen = world(on, { 'eng-1': 'claude-sonnet-4-6', 'gp-1': 'claude-haiku-4-5' })
    await $.tool.call({ tool: 'Agent', description: 'Код', prompt: 'x', subagent_type: 'ios-team:ios-engineer', model: 'sonnet', effort: 'medium' } as unknown as ToolCallArgs)
    await $.agent.spawn({ ...spawn('ios-team:ios-engineer', 'Код'), tool_use_id: callId, model: 'sonnet' })
    let s = snap(seen)
    expect([person(s, 'eng-1')?.model, person(s, 'eng-1')?.card.effort]).toEqual(['Sonnet', 'medium (обычно)'])
    expect(said(seen)).toContain('arrived: Код · Sonnet medium')
    expect(await rows($)).toContain('ios-engineer · Sonnet medium · ')
    await $.tool.call({ tool: 'Agent', description: 'Сводка', prompt: 'x', subagent_type: 'general-purpose', effort: 'turbo' } as unknown as ToolCallArgs)
    await $.agent.spawn({ ...spawn('general-purpose', 'Сводка'), tool_use_id: callId })
    s = snap(seen)
    expect(person(s, 'gp-1')?.card.effort).toBeUndefined()
    expect(effortLabel('xhigh')).toBe('xhigh (очень глубоко)')
    expect(effortLabel('max')).toBe('max (максимум)')
    expect(effortLabel('low')).toBe('low (быстро)')
    expect(effortLabel('high')).toBe('high (глубоко)')
  })

  test("without an asked effort the default comes from the agent file of the plugin the type belongs to, read once", async ($, on) => {
    const reads: string[] = []
    on('env.get', ($, e) => ({ value: ({ HOME: '/u/home', CLAUDE_CODE_PLUGIN_DIRS: '/work/other:~/team-plugin' } as Record<string, string>)[e.name] }))
    on('fs.list', () => {
      throw new Error('ENOENT')
    })
    on('fs.read', ($, e) => {
      reads.push(e.path)
      const files: Record<string, string> = {
        '/work/other/.claude-plugin/plugin.json': '{"name":"other"}',
        '/u/home/team-plugin/.claude-plugin/plugin.json': '{"name":"ios-team"}',
        '/u/home/team-plugin/agents/qa-tester.md': '---\nname: qa-tester\nmodel: sonnet\neffort: high\n---\nYou are QA.\neffort: low\n',
      }
      return { value: files[e.path] ?? '' }
    })
    const seen = world(on, { 'qa-1': 'claude-sonnet-4-6', 'qa-2': 'claude-sonnet-4-6' })
    await $.agent.spawn(spawn('ios-team:qa-tester', 'QA'))
    await $.agent.spawn(spawn('ios-team:qa-tester', 'QA iPad'))
    expect(person(snap(seen), 'qa-1')?.card.effort).toBe('high (глубоко)')
    expect(reads.filter(path => path.endsWith('/qa-tester.md'))).toEqual(['/u/home/team-plugin/agents/qa-tester.md'])
    expect(reads.filter(path => path.includes('/Users/'))).toEqual([])
    expect(effortFromDefinition('no frontmatter\neffort: high')).toBe('')
    expect(effortFromDefinition('---\neffort: "medium"\n---')).toBe('medium')
  })

  test('the agent default is also found in an installed plugin and in the project agents; with nothing installed it is left out without an error', async ($, on) => {
    on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/u/home' : undefined }))
    on('session.root', () => ({ value: '/work/app' }))
    const dirs: Record<string, string[]> = { '/u/home/.claude/plugins/cache': ['acme-market'], '/u/home/.claude/plugins/cache/acme-market/acme': ['1.2.0', '1.10.0'] }
    on('fs.list', ($, e) => {
      const names = dirs[e.path]
      if (names === undefined) throw new Error('ENOENT')
      return { value: names.map(name => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })) }
    })
    const files: Record<string, string> = {
      '/u/home/.claude/plugins/cache/acme-market/acme/1.10.0/agents/designer.md': '---\neffort: low\n---',
      '/work/app/.claude/agents/helper.md': '---\neffort: xhigh\n---',
    }
    const reads: string[] = []
    on('fs.read', ($, e) => {
      reads.push(e.path)
      if (files[e.path] === undefined) throw new Error('ENOENT')
      return { value: files[e.path] ?? '' }
    })
    const seen = world(on, { 'de-1': 'claude-sonnet-4-6', 'he-1': 'claude-sonnet-4-6', 'no-1': 'claude-sonnet-4-6', 'ex-1': 'claude-haiku-4-5' })
    await $.agent.spawn(spawn('acme:designer', 'Макет'))
    await $.agent.spawn(spawn('helper', 'Сводка'))
    await $.agent.spawn(spawn('ghost:nobody', 'Ничего'))
    await $.agent.spawn(spawn('Explore', 'Поиск'))
    const s = snap(seen)
    expect(person(s, 'de-1')?.card.effort).toBe('low (быстро)')
    expect(person(s, 'he-1')?.card.effort).toBe('xhigh (очень глубоко)')
    expect(person(s, 'no-1')?.card.effort).toBeUndefined()
    expect(person(s, 'ex-1')?.card.effort).toBeUndefined()
    expect(reads.some(path => path.includes('Explore'))).toBe(false)
    expect(agentRefOf('../x')).toBeUndefined()
    expect(agentRefOf('a:b:c')).toBeUndefined()
    expect(agentRefOf('ios-team:qa-tester')).toEqual({ plugin: 'ios-team', name: 'qa-tester' })
    expect(pluginDirsOf('/a/:~/b: :relative', '/u/home')).toEqual(['/a', '/u/home/b'])
    expect(installPathsOf('{"version":2,"plugins":{"acme@m":[{"installPath":"/p/acme"}],"acmex@m":[{"installPath":"/p/x"}]}}', 'acme')).toEqual(['/p/acme'])
    expect(installPathsOf('not json', 'acme')).toEqual([])
  })

  test('a clean machine: no HOME, no plugins, nothing on disk — the agent default is left out and nothing throws', async ($, on) => {
    on('env.get', () => ({ value: undefined }))
    on('session.root', () => {
      throw new Error('no root')
    })
    on('fs.list', () => {
      throw new Error('ENOENT')
    })
    on('fs.read', () => {
      throw new Error('ENOENT')
    })
    const seen = world(on, { 'x-1': 'claude-sonnet-4-6' })
    await $.agent.spawn(spawn('some-team:reviewer', 'Ревью'))
    const s = snap(seen)
    expect(person(s, 'x-1')?.name).toBe('reviewer')
    expect(person(s, 'x-1')?.card.effort).toBeUndefined()
  })

  test("an unknown effort is left out, and the model's own step fills it in once the agent runs", async ($, on) => {
    on('turn.step', async function* ($, e) {
      return { turnId: e.turnId, index: e.index, ...STEP, usage: null as never }
    })
    on('fs.read', () => ({ value: '' }))
    const seen = world(on, { 'ex-1': 'claude-haiku-4-5' })
    await $.agent.spawn(spawn('Explore', 'Найти роутер'))
    let s = snap(seen)
    expect(person(s, 'ex-1')?.card.effort).toBeUndefined()
    expect(said(seen)).toContain('arrived: Найти роутер · Haiku')
    await step($, 'xhigh', 'ex-1')
    s = snap(seen)
    expect(person(s, 'ex-1')?.card.effort).toBe('xhigh (очень глубоко)')
  })

  test('the route reason from the prompt is shown under the header, cut to 120 characters, as plain text', async ($, on) => {
    const hostile = '<img src=x onerror="alert(1)"> обычные тесты по готовому плану'
    const seen = world(on, { 'eng-1': 'claude-sonnet-4-6', 'rev-1': 'claude-sonnet-4-6', 'gp-1': 'claude-haiku-4-5' })
    on('fs.read', () => ({ value: '' }))
    await $.agent.spawn({ ...spawn('ios-team:ios-engineer', 'Код'), prompt: `route: sonnet medium — ${hostile}\nTicket PROJ-1739: ...` })
    await $.agent.spawn({ ...spawn('ios-team:reviewer', 'Ревью'), prompt: `Ревью PR.\nroute: opus high - ${'очень длинная причина '.repeat(10)}` })
    await $.agent.spawn({ ...spawn('general-purpose', 'Сводка'), prompt: 'Собери логи.\nНикакого маршрута.' })
    const s = snap(seen)
    expect(person(s, 'eng-1')?.card.route).toBe(hostile)
    const long = person(s, 'rev-1')?.card.route ?? ''
    expect([Array.from(long).length, long.endsWith('…'), long.startsWith('очень длинная причина')]).toEqual([120, true, true])
    expect(person(s, 'gp-1')?.card.route).toBeUndefined()
    expect(routeOf('route: haiku low\nx')).toBe('haiku low')
    expect(routeOf('a\nb\nc\nd\ne\nroute: late — no')).toBe('')
    expect(routeOf('route: sonnet low — line\u0000with\u001bcontrol')).toBe('line with control')
  })

  test('the coordinator header carries the session model and the effort its own steps use', async ($, on) => {
    on('turn.step', async function* ($, e) {
      return { turnId: e.turnId, index: e.index, ...STEP, usage: null as never }
    })
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    const seen = world(on, {})
    await $.session.start({ cwd: '/tmp/x', surface: 'terminal', isInteractive: false })
    let s = snap(seen)
    expect([s.boss.model, s.boss.card.effort]).toEqual(['Opus', undefined])
    await step($, 'high')
    s = snap(seen)
    expect([s.boss.model, s.boss.card.effort]).toEqual(['Opus', 'high (глубоко)'])
    expect(await rows($)).toContain('Opus high · ')
  })
})

describe('Офис: room and kit', () => {
  test('the room is assembled from kit sprites to the reel inventory', async () => {
    const room = roomLayers(false)
    const svg = room.ground + room.drawables.map(piece => piece.svg).join('')
    const count = (id: string) => (svg.match(new RegExp(`href="#k-${id}"`, 'g')) ?? []).length
    const inventory: Record<string, number> = {
      'window-2-l': 1,
      'window-plant-l': 1,
      'window-wide-r': 1,
      'vent-r': 2,
      'vent-l': 2,
      'cork-l': 1,
      'copier-black-l': 1,
      'copier-white-l': 2,
      'flipchart-l': 1,
      'clock-r': 1,
      'clock-l': 1,
      'whiteboard-r': 1,
      'whiteboard-l': 1,
      boxes: 1,
      wardrobe: 2,
      locker: 2,
      'poster-r': 1,
      'stickies-r': 1,
      cooler: 1,
      fridge: 1,
      counter: 1,
      'wall-cabinet': 1,
      'rack-l': 2,
      'sofa-left': 1,
      'sofa-mid': 1,
      'sofa-right': 1,
      rug: 1,
      'side-table': 1,
      'schedule-l': 1,
      'table-orange': 1,
      'chair-wood': 2,
      'lamp-red': 1,
      'desk-back': 5,
      'desk-front': 5,
      'desk-white': 3,
      monitor: 5,
      'monitor-back': 5,
      imac: 3,
      tower: 3,
      binders: 3,
      trash: 3,
      bin: 10,
      'chair-back': 8,
      'chair-front': 5,
      partition: 21,
      door: 1,
    }
    for (const [id, expected] of Object.entries(inventory)) expect([id, count(id)]).toEqual([id, expected])
    expect(count('glass-y') + count('glass-x')).toBeGreaterThanOrEqual(8)
    for (const item of [...FLOOR, ...EDGES, ...WALLS]) expect(KIT[item.sprite]).toBeDefined()
    expect(svg).toContain('fill="url(#k-floor-p)"')
    expect(roomLayers(true).drawables.map(piece => piece.svg).join('')).toContain('href="#k-door-open"')
  })

  test('walkability comes from the sprite footprints and glass edges', async () => {
    const seats = [...DESKS.map(desk => desk.seat), BOSS_DESK.seat, ...LOUNGE_SPOTS, ...COFFEE_SPOTS, ...STUDY_SPOTS, ...OVERFLOW_SPOTS]
    for (const seat of seats) {
      const path = findPath(DOOR, seat)
      expect(path[path.length - 1]).toEqual(seat)
      let prev = DOOR
      for (const step of path) {
        const here = `${step.x},${step.y}`
        if (step.x !== seat.x || step.y !== seat.y) expect([here, BLOCKED.has(here)]).toEqual([here, false])
        expect(BLOCKED_EDGES.has(`${prev.x},${prev.y}|${here}`)).toBe(false)
        expect(Math.abs(step.x - prev.x) + Math.abs(step.y - prev.y)).toBe(1)
        prev = step
      }
    }
    expect(BLOCKED.has('9,4')).toBe(true)
    expect(BLOCKED.has('0,6')).toBe(true)
    expect(BLOCKED_EDGES.has('6,10|7,10')).toBe(true)
    expect(BLOCKED_EDGES.has('4,7|4,8')).toBe(true)
  })

  test('the kit catalog shows every sprite and screen state once', async () => {
    const svg = kitSvg(1_000_000)
    for (const [id, sprite] of Object.entries(KIT)) {
      if (sprite.kind === 'wall') for (const side of ['r', 'l']) expect(svg).toContain(`data-kit="${id}-${side}"`)
      else expect(svg).toContain(`data-kit="${id}"`)
    }
    for (const screen of ['off', 'code', 'term', 'web', 'chart', 'photo']) expect(svg).toContain(`data-kit="screen-${screen}"`)
  })

  test('interior: wall items keep their own wall space with a gap, never over a window or tall furniture', async () => {
    const slots = wallSlots()
    const GAP_TILES = 0.2
    const GAP_Z = 4
    const clash: string[] = []
    slots.forEach((a, i) =>
      slots.slice(i + 1).forEach(b => {
        if (a.plane !== b.plane || (!a.isDecor && !b.isDecor)) return
        const apart = a.to + GAP_TILES <= b.from || b.to + GAP_TILES <= a.from || a.z1 + GAP_Z <= b.z0 || b.z1 + GAP_Z <= a.z0
        if (!apart) clash.push(`${a.what}@${a.from.toFixed(1)} × ${b.what}@${b.from.toFixed(1)}`)
      }),
    )
    expect(clash).toEqual([])
    for (const slot of slots.filter(one => one.isDecor)) {
      expect(slot.from).toBeGreaterThanOrEqual(0)
      expect(slot.to).toBeLessThanOrEqual(slot.plane === 'y' ? GRID_W : GRID_H)
    }
    for (const clock of slots.filter(one => one.what === 'clock')) expect(clock.z0).toBeGreaterThanOrEqual(60)
  })

  test('interior: footprints never overlap, stay on the floor, and keep a tile of floor from glass; nothing floats', async () => {
    const solid = FLOOR.filter(item => {
      const sprite = KIT[item.sprite]
      return sprite?.kind === 'floor' && !sprite.ground && (sprite.blocks || item.sprite.startsWith('chair'))
    })
    const owner = new Map<string, string>()
    const clash: string[] = []
    for (const item of solid) {
      const sprite = KIT[item.sprite]
      if (sprite?.kind !== 'floor') continue
      for (let dx = 0; dx < sprite.w; dx += 1)
        for (let dy = 0; dy < sprite.d; dy += 1) {
          const x = Math.floor(item.x) + dx
          const y = Math.floor(item.y) + dy
          expect(x >= 0 && y >= 0 && x < GRID_W && y < GRID_H).toBe(true)
          const here = AT(x, y)
          const seat = item.sprite.startsWith('chair') || item.sprite.startsWith('sofa') ? 'seat' : 'solid'
          const before = owner.get(here)
          if (before !== undefined) clash.push(`${here}: ${before} × ${item.sprite}`)
          owner.set(here, `${item.sprite}/${seat}`)
        }
    }
    expect(clash).toEqual([])
    const rug = FLOOR.find(item => item.sprite === 'rug')
    const rugTiles = new Set<string>()
    if (rug !== undefined) for (let dx = 0; dx < 4; dx += 1) for (let dy = 0; dy < 3; dy += 1) rugTiles.add(AT(rug.x + dx, rug.y + dy))
    const furnitureNearGlass: string[] = []
    for (const edge of EDGES) {
      if (!edge.sprite.startsWith('glass') && edge.sprite !== 'partition') continue
      const sides = edge.sprite === 'glass-y' || edge.sprite === 'partition' ? [AT(edge.x, edge.y - 1), AT(edge.x, edge.y)] : [AT(edge.x - 1, edge.y), AT(edge.x, edge.y)]
      for (const side of sides) {
        if (rugTiles.has(side)) furnitureNearGlass.push(`${edge.sprite}@${edge.x},${edge.y} touches the rug`)
        const what = owner.get(side) ?? ''
        if (/^(desk|chair|table)/.test(what)) furnitureNearGlass.push(`${edge.sprite}@${edge.x},${edge.y} touches ${what}`)
      }
      const [a, b] = sides
      if (a !== undefined && b !== undefined && rugTiles.has(a) && rugTiles.has(b)) furnitureNearGlass.push(`${edge.sprite} crosses the rug`)
    }
    expect(furnitureNearGlass).toEqual([])
    const supports = new Set(FLOOR.filter(item => SUPPORTS.has(item.sprite)).map(item => AT(Math.floor(item.x), Math.floor(item.y))))
    const floating = FLOOR.filter(item => NEEDS_SUPPORT.has(item.sprite) && !supports.has(AT(Math.floor(item.x), Math.floor(item.y)))).map(item => `${item.sprite}@${item.x},${item.y}`)
    expect(floating).toEqual([])
  })

  test('interior: every named spot is reachable, standing spots are free floor, and seats are real seats', async () => {
    const standing = [...COFFEE_SPOTS, ...STUDY_SPOTS, ...LAPTOP_SPOTS, DOOR]
    for (const spot of standing) expect([AT(spot.x, spot.y), BLOCKED.has(AT(spot.x, spot.y))]).toEqual([AT(spot.x, spot.y), false])
    for (const spot of LOUNGE_SPOTS) expect(FLOOR.some(item => item.sprite.startsWith('sofa') && item.x === spot.x && item.y === spot.y)).toBe(true)
    for (const seat of MEETING_SEATS) expect(FLOOR.some(item => item.sprite === 'chair-wood' && item.x === seat.tile.x && item.y === seat.tile.y)).toBe(true)
    for (const desk of [...DESKS, BOSS_DESK]) expect(FLOOR.some(item => item.sprite.startsWith('chair') && item.x === desk.seat.x && item.y === desk.seat.y)).toBe(true)
    for (const spot of [...standing, ...LOUNGE_SPOTS, ...OVERFLOW_SPOTS, ...DESKS.map(desk => desk.seat), BOSS_DESK.seat]) {
      const path = findPath(DOOR, spot)
      expect(isSameTile(path[path.length - 1] ?? DOOR, spot)).toBe(true)
      for (const step of path.slice(0, -1)) expect(BLOCKED.has(AT(step.x, step.y))).toBe(false)
    }
  })
})

describe('portability', () => {
  test('node is looked for on PATH first, then the common install places, nvm and fnm at their newest version', async () => {
    const found = nodeCandidates('/u/home', { nvm: ['v18.20.0', 'v22.3.1', 'v20.11.0', 'system'], fnm: ['v21.0.0'], fnmMac: [] })
    expect(found).toEqual([
      'node',
      '/opt/homebrew/bin/node',
      '/usr/local/bin/node',
      '/u/home/.volta/bin/node',
      '/u/home/.nvm/versions/node/v22.3.1/bin/node',
      '/u/home/.local/share/fnm/node-versions/v21.0.0/installation/bin/node',
      '/u/home/.asdf/shims/node',
      '/u/home/.local/share/mise/shims/node',
      '/usr/bin/node',
    ])
    expect(nodeCandidates('', { nvm: ['v22.0.0'], fnm: [], fnmMac: [] })).toEqual(['node', '/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node'])
    expect(newestVersion(['v9.1.0', 'v10.0.0', 'v10.0.10'])).toBe('v10.0.10')
    expect(newestVersion([])).toBeUndefined()
  })

  test('without Homebrew the server runs under the newest nvm node; PATH node is used when it answers', async ($, on) => {
    const nvm = '/u/home/.nvm/versions/node/v22.3.1/bin/node'
    const files = host(on, { nodes: { [nvm]: 'v22.3.1', '/u/home/.nvm/versions/node/v20.0.0/bin/node': 'v20.0.0' }, env: { HOME: '/u/home' }, dirs: { '/u/home/.nvm/versions/node': ['v20.0.0', 'v22.3.1'] } })
    panes(on)
    world(on, {})
    await $.command.run(officeCommand)
    expect(files.spawns.map(argv => argv[0])).toEqual([nvm])
    expect(files.runs.filter(argv => argv[1] === '--version').map(argv => argv[0])).toEqual(['node', nvm, 'python3'])
    files.release()
  })

  test('node on PATH wins over the install places', async ($, on) => {
    const files = host(on, { nodes: { node: 'v20.11.0', [NODE]: 'v22.11.0' } })
    panes(on)
    world(on, {})
    await $.command.run(officeCommand)
    expect(files.spawns.map(argv => argv[0])).toEqual(['node'])
    files.release()
  })

  test('a node that is too old is skipped for python3; with neither the reply and the pane say what to install', async ($, on) => {
    const files = host(on, { nodes: { [NODE]: 'v16.20.2' }, python: 'Python 3.6.9', language: 'русский' })
    panes(on)
    world(on, {})
    const result = await $.command.run(officeCommand)
    expect(files.spawns).toEqual([])
    expect(result.text).toBe('Офису нужен Node.js 18+ или Python 3.8+, а найден только Node.js v16.20.2, Python 3.6.9 — это слишком старая версия. Обнови Node.js с nodejs.org (или `brew upgrade node`) и набери /office снова.')
    expect((await pane($)).text).toContain('Node.js v16.20.2')
    expect((await pane($)).buttons).toEqual(['Start office'])
  })

  test('with no node and no python3 at all the message names both and how to install, in English when the session is English', async ($, on) => {
    const files = host(on, { nodes: {}, python: '', language: 'English' })
    panes(on)
    world(on, {})
    const result = await $.command.run(officeCommand)
    expect(files.spawns).toEqual([])
    expect(result.text).toBe('The office needs Node.js 18+ or Python 3.8+, and neither was found. Install Node.js from nodejs.org (or `brew install node`), then run /office again.')
  })

  test('the session language comes from the language setting, then the last prompt, then the locale; unknown gives both lines', async ($, on) => {
    const files = host(on, { nodes: {}, python: '' })
    panes(on)
    world(on, {})
    await $.turn.start({ turnId: 't1', text: 'Открой офис' })
    const result = await $.command.run(officeCommand)
    expect(result.text).toBe(problemText({ kind: 'missing', tooOld: [] }, 'ru'))
    expect(files.spawns).toEqual([])
    expect(langOf('russian', '', '')).toBe('ru')
    expect(langOf('english', 'Привет', 'ru_RU.UTF-8')).toBe('en')
    expect(langOf(undefined, 'Привет', '')).toBe('ru')
    expect(langOf(undefined, 'open the office', 'ru_RU.UTF-8')).toBe('en')
    expect(langOf(undefined, '', 'ru_RU.UTF-8')).toBe('ru')
    expect(langOf(undefined, '', 'en_US.UTF-8')).toBe('en')
    expect(langOf(undefined, '/office 123', 'C')).toBe('en')
    expect(langOf(undefined, '', '')).toBe('both')
    expect(problemText({ kind: 'missing', tooOld: [] }, 'both').split('\n')).toEqual([problemText({ kind: 'missing', tooOld: [] }, 'ru'), problemText({ kind: 'missing', tooOld: [] }, 'en')])
  })

  test('a port that cannot be bound is reported with the reason and what to check', async ($, on) => {
    const files = host(on, { language: 'ru', serverError: 'Error: listen EPERM: operation not permitted 127.0.0.1\n    at Server.setupListenHandle\n' })
    panes(on)
    world(on, {})
    const result = await $.command.run(officeCommand)
    expect(files.spawns.map(argv => argv[0])).toEqual([NODE, 'python3'])
    expect(result.text).toBe('Сервер офиса не смог открыть локальный порт на 127.0.0.1 (Error: listen EPERM: operation not permitted 127.0.0.1). Проверь, что фаервол, песочница или политика не запрещают локальные порты, и набери /office снова.')
  })

  test('a server that starts and dies, a missing port file and an unwritable folder each say what to do next', async () => {
    expect(problemText({ kind: 'crashed', reason: 'SyntaxError: x' }, 'en')).toBe('The office server did not start (SyntaxError: x). Check that Node.js 18+ (nodejs.org) or Python 3.8+ is installed and runs, then run /office again; if that does not help, restart the Claude Code session.')
    expect(problemText({ kind: 'crashed', reason: '' }, 'ru')).toBe('Сервер офиса не запустился. Проверь, что Node.js 18+ (nodejs.org) или Python 3.8+ установлен и работает, и набери /office снова; если не помогло — перезапусти сессию Claude Code.')
    expect(problemText({ kind: 'no-port' }, 'en')).toBe('The office server started but did not report its port. Run /office again; if that does not help, restart the Claude Code session.')
    expect(problemText({ kind: 'unwritable', dir: '/ro/office/s' }, 'en')).toBe('The office data folder is not writable: /ro/office/s. Free some disk space or grant write access (or point CLAUDE_PLUGIN_DATA at another folder), then run /office again.')
    expect(problemText({ kind: 'unwritable', dir: '/ro/office/s' }, 'ru')).toBe('Папка данных офиса недоступна для записи: /ro/office/s. Освободи место на диске или дай права на запись (или укажи другую папку в CLAUDE_PLUGIN_DATA) и набери /office снова.')
    expect(sayShowing({ how: 'manual', url: 'http://127.0.0.1:1/?token=t', lang: 'en' })).toBe('Could not open the browser — open this link in any browser on this computer: http://127.0.0.1:1/?token=t')
    expect(sayShowing({ how: 'manual', url: 'http://127.0.0.1:1/?token=t', lang: 'ru' })).toBe('Не смог открыть браузер сам — открой ссылку в любом браузере на этом компьютере: http://127.0.0.1:1/?token=t')
  })

  test('a browser that cannot be opened with open or xdg-open gives the link', async ($, on) => {
    const files = host(on, { language: 'en' })
    panes(on)
    world(on, {})
    const result = await $.command.run(officeCommand)
    const url = `http://127.0.0.1:${PORT}/?token=${files.token()}`
    expect(files.runs.filter(argv => argv[1] === url).map(argv => argv[0])).toEqual(['open', 'xdg-open'])
    expect(result.text).toBe(`Could not open the browser — open this link in any browser on this computer: ${url}`)
    files.release()
  })

  test("the office's own message line names the OS user's first name, or «Вы» when there is none", async () => {
    expect(firstNameOf('Oleg Kalistratov')).toBe('Oleg')
    expect(firstNameOf('  Анна  ')).toBe('Анна')
    expect(firstNameOf('')).toBe('')
    expect(firstNameOf('<script>')).toBe('')
    expect(passwdNameOf('jane:x:1000:1000:Jane Doe,,,:/home/jane:/bin/bash')).toBe('Jane Doe')
    expect(userLabelOf('')).toBe('Вы')
    expect(userLabelOf('Jane')).toBe('Jane')
  })

  test('a message from the office is labelled with the first name, never with the login', async ($, on) => {
    const sent: string[] = []
    on('prompt.submit', ($, e) => {
      sent.push(e.text)
      return { text: e.text }
    })
    const files = host(on, { fullName: 'Jane Doe', env: { USER: 'jane' } })
    panes(on)
    const seen = world(on, { 'eng-1': 'claude-sonnet-4-6' })
    await $.command.run(officeCommand)
    await $.agent.spawn(spawn('ios-team:ios-engineer', 'Код'))
    files.files.set(`${DIR}/inbox.json`, JSON.stringify([{ request: 'r1', action: 'say', agent: 'eng-1', text: 'Привет', at: 1 }]))
    await seen.clock.advance(500)
    await seen.clock.advance(100)
    expect(files.published().events.at(-1)).toEqual(expect.objectContaining({ who: 'Jane → ios-engineer' }))
    files.release()
  })

  test('a full name that is only the login reads «Вы»', async ($, on) => {
    on('prompt.submit', ($, e) => ({ text: e.text }))
    const files = host(on, { fullName: 'dev', env: { USER: 'dev' } })
    panes(on)
    const seen = world(on, {})
    await $.command.run(officeCommand)
    files.files.set(`${DIR}/inbox.json`, JSON.stringify([{ request: 'r1', action: 'say', agent: 'coordinator', text: 'Как дела?', at: 1 }]))
    await seen.clock.advance(500)
    await seen.clock.advance(100)
    expect(files.published().events.at(-1)).toEqual(expect.objectContaining({ who: 'Вы → claude' }))
    files.release()
  })

  test('an unknown agent type shows its own name with a generic contractor look; built-in types get their own roles', async ($, on) => {
    const seen = world(on, { 'de-1': 'claude-sonnet-4-6', 'pl-1': 'claude-opus-5-5' })
    on('fs.read', () => ({ value: '' }))
    await $.agent.spawn(spawn('acme-studio:ux-designer', 'Макет'))
    await $.agent.spawn(spawn('Plan', 'План'))
    const s = snap(seen)
    expect(person(s, 'de-1')?.name).toBe('ux-designer')
    expect(person(s, 'de-1')?.card.role).toBe('Помощник')
    expect(isStaff('acme-studio:ux-designer')).toBe(false)
    expect(['suit', 'hoodie', 'smart', 'creative', 'street', 'accountant']).toContain(lookOf('de-1', 'acme-studio:ux-designer').outfit.family)
    expect(person(s, 'pl-1')?.name).toBe('plan')
    expect(person(s, 'pl-1')?.card.role).toBe('Планировщик')
    expect(roleOf('Explore').label).toBe('Поиск по коду')
    expect(roleOf('Explore').icon).toBe('magnifier')
    expect(roleOf('general-purpose').icon).toBe('doc')
    expect(roleOf('claude-code-guide').label).toBe('Справка по Claude Code')
    expect(roleOf('acme:Explore').label).toBe('Помощник')
    expect(roleOf('ios-team:qa-tester').label).toBe('Тестировщик')
  })

  test('a session with no plugins and only the main agent shows the solo office', async ($, on) => {
    const files = host(on, { env: {} })
    panes(on)
    world(on, {})
    const result = await $.command.run(officeCommand)
    expect(result.text).toContain(`http://127.0.0.1:${PORT}/?token=`)
    const s = files.published()
    expect(s.people).toEqual([])
    expect(s.boss.name).toBe('claude')
    expect(JSON.stringify(s)).not.toMatch(/NaN|undefined|ios-team|\/Users\//)
    expect((await pane($)).text).not.toMatch(/NaN|undefined/)
    files.release()
  })
})
