import type { OfficeAgent, OfficeCoordinator, OfficeEvent, OfficeLink } from '../../types'
import { describeTool, parseResult } from '../../hooks/roles'
import { buildSnapshot } from '../../hooks/snapshot'
import type { Snapshot } from '../../hooks/snapshot'
import { IDLE_COORDINATOR, completeAgent, endTool, enterBoss, spawnAgent, startTool, stepAgents, stepBoss, stopNow } from '../../hooks/world'
import type { Reserved } from '../../hooks/world'

type World = { agents: Record<string, OfficeAgent>; boss: OfficeCoordinator; events: OfficeEvent[]; reserved: Reserved; now: number; version: number; startedAt: number }

type Step = readonly [number, (world: World) => void]

const DEMO_SESSION: OfficeLink = { status: 'none', url: '', detail: 'в демо сессии нет', title: 'Demo session', branch: 'feature/PROJ-1234', folder: 'app-PROJ-1234' }

function result(status: string, summary: string): string {
  return ['```result', `status: ${status}`, `summary: ${summary}`, '```'].join('\n')
}

function spawn(world: World, id: string, type: string, description: string, model: string, effort?: string, why?: string): void {
  const brief = why !== undefined ? `route: ${model} ${effort ?? ''} — ${why}\n${description}.` : `${description}.`
  const change = spawnAgent(world.agents, world.reserved, id, { type, description, model, ...(effort !== undefined ? { effort } : {}), background: true, brief }, world.now, world.boss)
  world.agents = change.agents
  world.reserved = change.reserved
  world.events.push(...change.events)
  world.boss = { ...world.boss, isLead: true }
}

function tool(world: World, id: string, name: string, args: Record<string, unknown>): void {
  const change = startTool(world.agents, id, describeTool(name, args), name, world.now, world.reserved, world.boss)
  world.reserved = change.reserved
  world.agents = endTool(change.agents, id, world.now, false, world.now + 1200)
  world.events.push(...change.events)
}

const QA_RESULT = [
  '```result',
  'agent: qa-tester',
  'status: needs_decision',
  'summary: камера проверена на iPhone, нужен выбор по iPad',
  'needs_decision:',
  '  - {id: d1, question_ru: "Проверять на iPad?", options: ["Да (Recommended)", "Нет"], recommended: "Да", why: "На iPad другой layout, в PROJ-1600 он уже ломался"}',
  '  - {id: d2, question_ru: "Записать видео для PR?", options: ["Да, 20 секунд", "Только скриншоты"]}',
  'not_verified: [iPad mini, поворот экрана]',
  '```',
].join('\n')

const REVIEW_RESULT = ['```result', 'agent: reviewer', 'status: failed', 'summary: сборка упала', 'noticed:', '  - в CameraView.swift остался print', '```'].join('\n')

function finish(world: World, id: string, status: string, summary: string, text = result(status, summary)): void {
  const change = completeAgent(world.agents, id, { parsed: parseResult(text), reason: 'answer', isAborted: false, usage: { input_tokens: 40_000, output_tokens: 4_000, cache_read_input_tokens: 120_000, cache_creation_input_tokens: 0 } }, world.now)
  world.agents = change.agents
  world.events.push(...change.events)
}

function boss(world: World, change: Partial<OfficeCoordinator>): void {
  world.boss = { ...world.boss, ...change, lastAt: world.now, statusAt: world.now }
}

const SCRIPT: readonly Step[] = [
  [0, world => (world.boss = enterBoss({ ...world.boss, model: 'Opus', effort: 'high', turns: 1 }, world.agents, world.now))],
  [600, world => boss(world, { status: 'working', activity: 'Читает твоё сообщение', act: 'read' })],
  [1500, world => spawn(world, 'eng', 'ios-team:ios-engineer', 'Тесты PROJ-1739', 'claude-sonnet-4-6', 'medium', 'обычные тесты по готовому плану, без движка и Metal')],
  [1600, world => spawn(world, 'qa', 'ios-team:qa-tester', 'QA камеры', 'claude-sonnet-4-6', 'high')],
  [1700, world => spawn(world, 'rev', 'ios-team:reviewer', 'Ревью PR #1254', 'claude-sonnet-4-6', 'high', 'общий слой, больше 150 строк — нужна внимательная проверка')],
  [1800, world => spawn(world, 'ex', 'Explore', 'Найти роутер', 'claude-haiku-4-5', 'low')],
  [1900, world => spawn(world, 'gp', 'general-purpose', 'Сводка логов', 'claude-haiku-4-5')],
  [2500, world => boss(world, { status: 'working', activity: 'Поручает задачу: reviewer', act: 'talk' })],
  [14_000, world => tool(world, 'eng', 'Edit', { file_path: '/wt/Modules/HomeFeature/HomeModel.swift' })],
  [14_400, world => tool(world, 'qa', 'mcp__Claude_Code_iOS_Simulator__control', { action: 'tap' })],
  [14_800, world => tool(world, 'rev', 'Read', { file_path: '/wt/CameraView.swift' })],
  [15_200, world => tool(world, 'gp', 'Bash', { command: 'xcodebuild -scheme App-PR test' })],
  [19_000, world => tool(world, 'ex', 'Grep', { pattern: 'Router', path: '/wt/Modules' })],
  [21_000, world => finish(world, 'qa', 'needs_decision', 'Проверять на iPad?', QA_RESULT)],
  [22_000, world => finish(world, 'rev', 'failed', 'сборка упала', REVIEW_RESULT)],
  [23_000, world => finish(world, 'gp', 'ok', 'логи собраны')],
  [25_000, world => tool(world, 'eng', 'Bash', { command: 'xcodebuild test' })],
  [27_000, world => finish(world, 'eng', 'ok', 'тесты зелёные')],
  [28_000, world => spawn(world, 'an', 'ios-team:analytics', 'События камеры', 'claude-sonnet-4-6')],
  [28_100, world => spawn(world, 'pub', 'ios-team:publisher', 'PR в develop', 'claude-sonnet-4-6')],
  [31_000, world => {
    const change = stopNow(world.agents, 'ex', 'не нужно', world.now)
    world.agents = change.agents
    world.events.push(...change.events)
  }],
  [33_000, world => boss(world, { status: 'asking', activity: 'Берём роутер из HomeFeature?', act: 'other', asks: [{ id: 'q1', question: 'Берём роутер из HomeFeature?', options: ['Да, из HomeFeature', 'Нет, пишем свой'] }] })],
  [40_000, world => tool(world, 'an', 'Read', { file_path: '/wt/AnalyticsEvent.swift' })],
  [40_400, world => tool(world, 'pub', 'WebFetch', { url: 'https://github.com' })],
  [42_000, world => boss(world, { status: 'done', activity: 'Ждёт тебя', turns: 2 })],
  [44_000, world => tool(world, 'qa', 'mcp__Claude_Code_iOS_Simulator__control', { action: 'swipe' })],
]

const LOOP_MS = 70_000

function fresh(now: number): World {
  return { agents: {}, boss: { ...IDLE_COORDINATOR }, events: [], reserved: {}, now, version: 0, startedAt: now }
}

export function startDemo(publish: (snapshot: Snapshot) => void, startAt: number): { tick: (now: number) => void } {
  let world = fresh(startAt)
  let start = startAt
  let next = 0
  const tick = (now: number) => {
    world.now = now
    if (world.now - start > LOOP_MS) {
      world = { ...fresh(world.now), version: world.version }
      start = world.now
      next = 0
    }
    while (next < SCRIPT.length) {
      const step = SCRIPT[next]
      if (step === undefined || world.now - start < step[0]) break
      step[1](world)
      next += 1
    }
    const stepped = stepAgents(world.agents, world.now, world.boss)
    world.agents = stepped.agents
    world.events.push(...stepped.events)
    world.boss = stepBoss(world.boss, world.agents, world.now, stepped.boss)
    world.version += 1
    publish(buildSnapshot({ version: world.version, now: world.now, startedAt: world.startedAt, agents: world.agents, coordinator: world.boss, events: world.events.slice(-24), link: DEMO_SESSION }))
  }
  return { tick }
}
