import { atom, read, update } from 'claude-code'
import type { EngineInterface, Next, Register, Timer, ToolCallInput, ToolCallResult } from 'claude-code'

import type { OfficeAck, OfficeAgent, OfficeAsk, OfficeBossReply, OfficeCoordinator, OfficeEvent, OfficeLink, OfficeSaid, OfficeSaidState, OfficeServerStatus, OfficeStatus, OfficeTurn } from '../types'

import {
  EMPTY_TOKENS,
  STATUS_WORD,
  addTokens,
  clip,
  costOf,
  describeTool,
  effortFromDefinition,
  effortOf,
  formatCost,
  formatDuration,
  modelBadge,
  parseResult,
  roleOf,
  toolName,
} from './roles'
import { ASK_CLOSED, NODE_MIN, PORT_WAIT_MS, PUBLISH_MS, agentRefOf, answerText, errorLineOf, firstNameOf, installPathsOf, isPortError, isPythonRecent, langOf, manifestNameOf, newestVersion, nodeCandidates, nodeVersionOf, passwdNameOf, pluginDirsOf, problemText, pythonVersionOf, userLabelOf, askIdOf, branchOf, checkAnswers, folderOf, sessionTitleOf, cleanMessage, converseText, hashOf, messageFor, sessionLinkOf, hostPathsOf, nextVersion, officeUrl, randomToken, readInbox, readPortFile, sayShowing, serverCommands, stopText } from './office-host'
import type { HostPaths, Lang, OfficeAction, Picked, ServerProblem, Showing } from './office-host'
import { buildSnapshot } from './snapshot'
import {
  BEAT_MS,
  EVENTS_KEPT,
  IDLE_COORDINATOR,
  RUNS_KEPT,
  TICK_MS,
  TURNS_KEPT,
  TURN_TOOLS_KEPT,
  bossEvent,
  bossLabel,
  autoOpenOf,
  bossToDesk,
  canStop,
  completeAgent,
  endTool,
  endsWithQuestion,
  enterBoss,
  findAgent,
  leaveAll,
  messageAgent,
  nameOf,
  noteOf,
  objectiveOf,
  opensAt,
  questionOf,
  seatBoss,
  sessionCost,
  settleRun,
  spawnAgent,
  startTool,
  stepAgents,
  stepBoss,
  stopNow,
  tickMode,
  visibleAgents,
} from './world'

const PANE = 'agent-office'
const TITLE = 'Офис'

const agents = atom({ plugin: 'agent-office', key: 'agents' } as const, {})
const coordinator = atom({ plugin: 'agent-office', key: 'coordinator' } as const, IDLE_COORDINATOR)
const events = atom({ plugin: 'agent-office', key: 'events' } as const, [])
const startedAt = atom({ plugin: 'agent-office', key: 'startedAt' } as const, 0)
const beat = atom({ plugin: 'agent-office', key: 'beat' } as const, 0)
const autoOpened = atom({ plugin: 'agent-office', key: 'autoOpened' } as const, false)
const reserved = atom({ plugin: 'agent-office', key: 'reserved' } as const, {})
const server = atom({ plugin: 'agent-office', key: 'server' } as const, { status: 'off' as const, url: '', detail: '' })
const acks = atom({ plugin: 'agent-office', key: 'acks' } as const, [])
const said = atom({ plugin: 'agent-office', key: 'said' } as const, [])
const NO_LINK: OfficeLink = { status: 'unknown', url: '', detail: '' }
const link = atom({ plugin: 'agent-office', key: 'link' } as const, NO_LINK)
const SAID_KEPT = 30
const USER_COLOR = '#5b8def'

const BUILT_IN_TYPES: ReadonlySet<string> = new Set(['Explore', 'Plan', 'general-purpose', 'claude-code-guide', 'statusline-setup', 'fork', 'teammate'])

const askedEffort = new Map<string, string>()
const defaultEfforts = new Map<string, string>()

async function textOf($: EngineInterface, path: string): Promise<string> {
  const text = await $.fs.read(path).catch(() => '')
  return typeof text === 'string' ? text : ''
}

async function dirsIn($: EngineInterface, path: string): Promise<string[]> {
  const entries = await $.fs.list(path).catch(() => [])
  return entries.filter(entry => entry.kind !== 'file').map(entry => entry.name)
}

async function homeOf($: EngineInterface): Promise<string> {
  return ((await $.env.get('HOME').catch(() => undefined)) ?? '').replace(/\/+$/, '')
}

async function pluginRootsOf($: EngineInterface, plugin: string, home: string): Promise<string[]> {
  const roots: string[] = []
  for (const dir of pluginDirsOf(await $.env.get('CLAUDE_CODE_PLUGIN_DIRS').catch(() => undefined), home)) {
    if (manifestNameOf(await textOf($, `${dir}/.claude-plugin/plugin.json`)) === plugin) roots.push(dir)
  }
  if (home === '') return roots
  const plugins = `${home}/.claude/plugins`
  roots.push(...installPathsOf(await textOf($, `${plugins}/installed_plugins.json`), plugin))
  for (const marketplace of await dirsIn($, `${plugins}/cache`)) {
    const versions = await dirsIn($, `${plugins}/cache/${marketplace}/${plugin}`)
    const newest = newestVersion(versions) ?? versions[0]
    if (newest !== undefined) roots.push(`${plugins}/cache/${marketplace}/${plugin}/${newest}`)
  }
  return roots
}

async function definitionPaths($: EngineInterface, subagentType: string): Promise<string[]> {
  const ref = agentRefOf(subagentType)
  if (ref === undefined || (ref.plugin === '' && BUILT_IN_TYPES.has(ref.name))) return []
  const home = await homeOf($)
  if (ref.plugin !== '') return (await pluginRootsOf($, ref.plugin, home)).map(root => `${root}/agents/${ref.name}.md`)
  const project = await $.session.root().catch(() => '')
  return [project && `${project}/.claude/agents/${ref.name}.md`, home && `${home}/.claude/agents/${ref.name}.md`].filter(path => path !== '')
}

async function defaultEffort($: EngineInterface, subagentType: string): Promise<string> {
  const known = defaultEfforts.get(subagentType)
  if (known !== undefined) return known
  let effort = ''
  try {
    for (const path of await definitionPaths($, subagentType)) {
      const text = await textOf($, path)
      if (text === '') continue
      effort = effortFromDefinition(text)
      break
    }
  } catch {
    effort = ''
  }
  defaultEfforts.set(subagentType, effort)
  return effort
}

let userLabel: string | undefined

async function userLabelFor($: EngineInterface): Promise<string> {
  if (userLabel !== undefined) return userLabel
  const login = (await $.env.get('USER').catch(() => undefined)) ?? ''
  const fromOs = async (argv: readonly string[], pick: (out: string) => string): Promise<string> => {
    const result = await $.process.run(argv, { timeoutMs: 3_000 }).catch(() => undefined)
    return result !== undefined && result.exitCode === 0 ? pick(result.stdout) : ''
  }
  let full = await fromOs(['id', '-F'], out => out.trim())
  if (full === '' && login !== '') full = await fromOs(['getent', 'passwd', login], out => passwdNameOf(out.trim()))
  userLabel = userLabelOf(full.trim().toLowerCase() === login.toLowerCase() ? '' : firstNameOf(full))
  return userLabel
}

let lastPrompt = ''

async function langFor($: EngineInterface): Promise<Lang> {
  const settings = await $.settings.read().catch(() => ({}) as Record<string, unknown>)
  const locale = (await $.env.get('LC_ALL').catch(() => undefined)) || (await $.env.get('LANG').catch(() => undefined)) || ''
  return langOf(settings['language'], lastPrompt, locale)
}

const LEAD_SKILL = /(^|:)([\w-]+-)?lead$/

type Pose = 'type' | 'think' | 'raise' | 'coffee' | 'fail' | 'done' | 'walk' | 'sofa' | 'idle' | 'ask'

const ASCII: Readonly<Record<Pose, string>> = {
  type: ' o-[]',
  think: ' o .:',
  raise: ' \\o ?',
  ask: ' \\o ?',
  coffee: ' o_u ',
  fail: '(o) !',
  done: ' \\o/ ',
  walk: ' o>  ',
  sofa: ' o_h ',
  idle: ' o   ',
}

const POSE_COLOR: Readonly<Partial<Record<Pose, string>>> = {
  raise: '#E2A400',
  ask: '#E2A400',
  coffee: '#E2A400',
  done: '#27AE60',
  sofa: '#27AE60',
  fail: '#EB5757',
  think: '#6C8EEF',
}


let timer: Timer | undefined
let timerPeriod = 0
let isTicking = false
let isTerminalFullscreen: boolean | undefined

async function now($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

type Stream = ReturnType<EngineInterface['process']['spawn']>

let child: { stream: Stream } | undefined
let pending: Timer | undefined
let starting: Promise<void> | undefined
let lastVersion = 0

async function hostPaths($: EngineInterface): Promise<HostPaths> {
  const data = await $.env.get('CLAUDE_PLUGIN_DATA')
  const tmp = await $.env.get('TMPDIR')
  const id = await $.session.id().catch(() => 'session')
  return hostPathsOf(data, tmp, id)
}

async function writeAtomic($: EngineInterface, path: string, text: string): Promise<void> {
  const tmp = `${path}.tmp`
  await $.fs.write(tmp, text)
  const moved = await $.process
    .run(['/bin/mv', '-f', tmp, path])
    .then(result => result.exitCode === 0)
    .catch(() => false)
  if (!moved) await $.fs.write(path, text)
}

async function writeSnapshot($: EngineInterface): Promise<void> {
  const paths = await hostPaths($)
  const at = await now($)
  lastVersion = nextVersion(lastVersion, at)
  const snapshot = buildSnapshot({
    version: lastVersion,
    now: at,
    startedAt: (await read($, startedAt)) || at,
    agents: await read($, agents),
    coordinator: await read($, coordinator),
    events: await read($, events),
    acks: await read($, acks),
    said: await read($, said),
    link: await read($, link),
  })
  await writeAtomic($, paths.state, JSON.stringify(snapshot))
}

function publish($: EngineInterface): void {
  if (pending !== undefined) return
  pending = $.clock.after(PUBLISH_MS, () => {
    pending = undefined
    void writeSnapshot($).catch(() => undefined)
  })
}

async function setServer($: EngineInterface, status: OfficeServerStatus, url: string, detail: string): Promise<void> {
  await update($, server, () => ({ status, url, detail }))
}

async function waitReady(stream: Stream, stderr: string[]): Promise<boolean> {
  try {
    for (;;) {
      const piece = await stream.next()
      if (piece.done === true) return false
      if (piece.value.stream === 'stderr') stderr.push(piece.value.text)
      if (piece.value.stream === 'stdout' && piece.value.text.includes('ready')) return true
    }
  } catch {
    return false
  }
}

async function drain($: EngineInterface, stream: Stream): Promise<void> {
  try {
    for await (const piece of stream) void piece
  } catch {
    void 0
  } finally {
    if (child?.stream === stream) {
      child = undefined
      inboxTimer?.cancel()
      inboxTimer = undefined
      await setServer($, 'off', '', 'The office server stopped.').catch(() => undefined)
    }
  }
}

type Launched = { isUp: boolean; stderr: string }

async function launch($: EngineInterface, argv: readonly string[]): Promise<Launched> {
  let stream: Stream
  try {
    stream = $.process.spawn({ argv })
  } catch {
    return { isUp: false, stderr: '' }
  }
  child = { stream }
  const stderr: string[] = []
  const isReady = await Promise.race([waitReady(stream, stderr), $.clock.sleep(PORT_WAIT_MS).then(() => false)])
  if (!isReady) {
    if (child?.stream === stream) child = undefined
    void stream.return({ code: null, signal: null }).catch(() => undefined)
    return { isUp: false, stderr: stderr.join('') }
  }
  void drain($, stream)
  return { isUp: true, stderr: '' }
}

type Runtimes = { node?: string; python: boolean; tooOld: string[] }

async function versionOf($: EngineInterface, executable: string): Promise<string | undefined> {
  const result = await $.process.run([executable, '--version'], { timeoutMs: 5_000 }).catch(() => undefined)
  return result !== undefined && result.exitCode === 0 ? `${result.stdout} ${result.stderr}`.trim() : undefined
}

async function findRuntimes($: EngineInterface): Promise<Runtimes> {
  const home = await homeOf($)
  const tooOld: string[] = []
  const versions = {
    nvm: home ? await dirsIn($, `${home}/.nvm/versions/node`) : [],
    fnm: home ? await dirsIn($, `${home}/.local/share/fnm/node-versions`) : [],
    fnmMac: home ? await dirsIn($, `${home}/Library/Application Support/fnm/node-versions`) : [],
  }
  let node: string | undefined
  for (const candidate of nodeCandidates(home, versions)) {
    if (candidate !== 'node' && !(await $.fs.exists(candidate).catch(() => false))) continue
    const output = await versionOf($, candidate)
    const major = output === undefined ? undefined : nodeVersionOf(output)
    if (major === undefined) continue
    if (major >= NODE_MIN) {
      node = candidate
      break
    }
    const shown = `Node.js ${output?.trim().split(/\s+/)[0] ?? ''}`
    if (!tooOld.includes(shown)) tooOld.push(shown)
  }
  const pythonOutput = (await versionOf($, 'python3')) ?? ''
  const python = pythonVersionOf(pythonOutput)
  if (python !== undefined && !isPythonRecent(python)) tooOld.push(/Python [\d.]+/.exec(pythonOutput)?.[0] ?? `Python ${python.join('.')}`)
  return { node, python: python !== undefined && isPythonRecent(python), tooOld }
}

async function failServer($: EngineInterface, problem: ServerProblem): Promise<void> {
  await setServer($, 'failed', '', problemText(problem, await langFor($)))
}

async function startServer($: EngineInterface): Promise<void> {
  const paths = await hostPaths($)
  const token = randomToken()
  await setServer($, 'starting', '', 'Starting the office server…')
  try {
    await writeSnapshot($)
    await $.fs.write(paths.port, '{}')
  } catch {
    await failServer($, { kind: 'unwritable', dir: paths.dir })
    return
  }
  const runtimes = await findRuntimes($)
  const [nodeCommand, pythonCommand] = serverCommands($.plugin.root, runtimes.node ?? 'node', paths, token)
  const commands = [runtimes.node !== undefined ? nodeCommand : undefined, runtimes.python ? pythonCommand : undefined].filter((argv): argv is string[] => argv !== undefined)
  if (commands.length === 0) {
    await failServer($, { kind: 'missing', tooOld: runtimes.tooOld })
    return
  }
  let isUp = false
  const errors: string[] = []
  for (const argv of commands) {
    const launched = await launch($, argv)
    isUp = launched.isUp
    if (isUp) break
    errors.push(launched.stderr)
  }
  if (!isUp) {
    const portError = errors.find(isPortError)
    await failServer($, portError !== undefined ? { kind: 'port', reason: errorLineOf(portError) } : { kind: 'crashed', reason: errorLineOf(errors.join('\n')) })
    return
  }
  const begin = await now($)
  while ((await now($)) - begin < PORT_WAIT_MS) {
    const text = await $.fs.read(paths.port).catch(() => '')
    const port = readPortFile(typeof text === 'string' ? text : '', token)
    if (port !== undefined) {
      await setServer($, 'running', officeUrl(port, token), `Serving on 127.0.0.1:${port}.`)
      inboxTimer?.cancel()
      inboxTimer = $.clock.every(INBOX_MS, () => void takeInbox($).catch(() => undefined))
      return
    }
    await $.clock.sleep(100)
  }
  await failServer($, { kind: 'no-port' })
}

function ensureServer($: EngineInterface): Promise<void> {
  if (child !== undefined) return Promise.resolve()
  starting ??= startServer($)
    .catch(async (error: unknown) => failServer($, { kind: 'crashed', reason: errorLineOf(String(error)) }).catch(() => undefined))
    .finally(() => {
      starting = undefined
    })
  return starting
}

async function stopServer($: EngineInterface): Promise<void> {
  const running = child
  child = undefined
  pending?.cancel()
  pending = undefined
  inboxTimer?.cancel()
  inboxTimer = undefined
  if (running !== undefined) void running.stream.return({ code: null, signal: null }).catch(() => undefined)
  await setServer($, 'off', '', 'The office server is stopped.').catch(() => undefined)
}

const INBOX_MS = 400
const HANDLED_KEPT = 50
const ACKS_KEPT = 10

let inboxTimer: Timer | undefined
let isTaking = false
const handled: string[] = []
let ownStop: { id: string; why: string } | undefined

type Filled = { how: 'input' | 'clipboard' | 'none'; text: string }

async function surfaceOf($: EngineInterface): Promise<'terminal' | 'desktop' | 'mobile' | 'vscode'> {
  const surfaces = await $.session.surfaces().catch(() => [])
  return surfaces.find(surface => surface !== 'terminal') ?? 'terminal'
}

async function fill($: EngineInterface, text: string): Promise<Filled> {
  const isFilled = await $.prompt
    .fill({ text, mode: 'replace' })
    .then(result => result.isFilled)
    .catch(() => false)
  if (isFilled) return { how: 'input', text: `Поставил в поле ввода: «${text.trim()}»` }
  const surface = await surfaceOf($)
  const isCopied = await $.ui
    .copy({ text: text.trim(), surface })
    .then(result => result.isCopied)
    .catch(() => false)
  if (isCopied) return { how: 'clipboard', text: `Поле ввода недоступно — скопировал в буфер обмена: «${text.trim()}»` }
  return { how: 'none', text: `Не смог поставить в поле ввода. Текст: «${text.trim()}»` }
}

async function ackOf($: EngineInterface, action: OfficeAction, ok: boolean, text: string): Promise<void> {
  const at = await now($)
  const ack: OfficeAck = { request: action.request, ok, text: clip(text, 300), at }
  await update($, acks, list => [...list, ack].slice(-ACKS_KEPT))
}

function answersFor(action: OfficeAction, asks: readonly OfficeAsk[]): { id: string; text: string }[] {
  if (action.answers.length > 0) return action.answers
  const first = asks[0]
  return first !== undefined ? [{ id: first.id, text: action.text }] : []
}

async function answer($: EngineInterface, action: OfficeAction, agent: OfficeAgent): Promise<void> {
  const asks = agent.asks
  if (asks === undefined) {
    await ackOf($, action, false, 'Вопроса больше нет: агент уже продолжил работу')
    return
  }
  const given = answersFor(action, asks)
  const text = answerText(nameOf(agent), action.agent, asks, given)
  if (text === undefined) {
    await ackOf($, action, false, 'Пустой ответ: выбери вариант или напиши свой')
    return
  }
  const filled = await fill($, text)
  if (filled.how === 'none') {
    await ackOf($, action, false, filled.text)
    return
  }
  const summary = clip(given.filter(one => one.text.trim()).map(one => (given.length > 1 ? `${one.id} — ${one.text.trim()}` : one.text.trim())).join('; '), 200)
  const at = await now($)
  await update($, agents, all => {
    const one = all[action.agent]
    return one?.asks !== undefined ? { ...all, [action.agent]: { ...one, answer: { text: summary, at } } } : all
  })
  await ackOf($, action, true, filled.how === 'input' ? 'Ответ в поле ввода — отправь его' : 'Поле ввода недоступно — ответ в буфере обмена, вставь и отправь его')
}

async function stopFromOffice($: EngineInterface, action: OfficeAction, agent: OfficeAgent): Promise<void> {
  const name = nameOf(agent)
  if (!canStop(agent)) {
    await ackOf($, action, false, `${name} не остановить: агент уже закончил или ушёл`)
    return
  }
  const why = clip(action.text, 60)
  ownStop = { id: action.agent, why: why ? `from the office: ${why}` : 'from the office' }
  let reason = ''
  try {
    const ran = await $.tool.call({ tool: 'TaskStop', task_id: action.agent })
    reason = ran.deny !== undefined ? String(ran.deny) : ran.isError === true ? 'TaskStop returned an error' : ''
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error)
  } finally {
    ownStop = undefined
  }
  if (reason === '') {
    const stopped = await stopAt($, action.agent, why ? `from the office: ${why}` : 'from the office', await now($))
    await stopped?.done()
    await ackOf($, action, true, `Остановил ${name}`)
    return
  }
  const filled = await fill($, stopText(name, action.agent, action.text))
  await ackOf($, action, filled.how !== 'none', `Не смог остановить сам (${clip(reason, 100)}). ${filled.text}`)
}

const SAID_WORD: Readonly<Record<OfficeSaidState, string>> = {
  queued: 'Отправлено — ждёт, пока координатор освободится',
  sent: 'Отправлено в Claude',
  delivered: 'Доставлено агенту',
  answered: 'Ответил координатор',
  refused: 'Не отправлено',
}

function isBusy(boss: OfficeCoordinator): boolean {
  return boss.status === 'working' || boss.status === 'thinking' || boss.status === 'asking'
}

async function changeSaid($: EngineInterface, request: string, change: (one: OfficeSaid) => OfficeSaid): Promise<void> {
  await update($, said, list => list.map(one => (one.request === request ? change(one) : one)))
  publish($)
}

async function submitSaid($: EngineInterface, request: string, full: string): Promise<void> {
  try {
    const entered = await $.prompt.submit({ text: full, asUser: true })
    if (entered.drop !== undefined) await changeSaid($, request, one => ({ ...one, state: 'refused', why: clip(String(entered.drop), 120) }))
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    await changeSaid($, request, one => (one.state === 'queued' ? { ...one, state: 'refused', why: clip(why, 120) } : one)).catch(() => undefined)
  }
}

async function say($: EngineInterface, action: OfficeAction, agent: OfficeAgent | undefined): Promise<void> {
  const known = (await read($, said)).find(one => one.request === action.request)
  if (known !== undefined) {
    await ackOf($, action, known.state !== 'refused', `Это сообщение уже было: ${SAID_WORD[known.state]}`)
    return
  }
  const text = cleanMessage(action.text)
  if (!text) {
    await ackOf($, action, false, 'Пустое сообщение: напиши текст, до 2000 знаков')
    return
  }
  const boss = await read($, coordinator)
  const name = agent !== undefined ? nameOf(agent) : bossLabel(boss)
  const full = messageFor(name, agent !== undefined ? action.agent : undefined, text)
  const at = await now($)
  const entry: OfficeSaid = { request: action.request, to: action.agent, text: clip(text, 300), key: hashOf(full), at, state: 'queued' }
  await update($, said, list => [...list, entry].slice(-SAID_KEPT))
  await addEvents($, [{ at, who: `${await userLabelFor($)} → ${name}`, color: USER_COLOR, text: clip(text, 60), tone: 'info' }])
  publish($)
  void submitSaid($, action.request, full)
  await ackOf($, action, true, isBusy(boss) ? SAID_WORD.queued : SAID_WORD.sent)
}

async function sawTurn($: EngineInterface, text: string, turnId: string): Promise<void> {
  const key = hashOf(text.trim())
  const list = await read($, said)
  const first = list.find(one => one.state === 'queued' && one.key === key)
  if (first === undefined) return
  await changeSaid($, first.request, one => ({ ...one, state: 'sent', turnId }))
}

async function sawAnswer($: EngineInterface, turnId: string): Promise<void> {
  const list = await read($, said)
  if (!list.some(one => one.to === 'coordinator' && one.turnId === turnId && one.state === 'sent')) return
  await update($, said, all => all.map(one => (one.to === 'coordinator' && one.turnId === turnId && one.state === 'sent' ? { ...one, state: 'answered' } : one)))
  publish($)
}

async function sawDelivery($: EngineInterface, to: string, at: number): Promise<void> {
  const id = findAgent(await read($, agents), to)
  if (id === undefined) return
  const first = (await read($, said)).find(one => one.to === id && one.at <= at && (one.state === 'sent' || one.state === 'queued'))
  if (first !== undefined) await changeSaid($, first.request, one => ({ ...one, state: 'delivered' }))
}

const SESSION_REFRESH_MS = 5 * 60_000

let sessionTimer: Timer | undefined

async function whereWeWork($: EngineInterface): Promise<{ branch: string; folder: string }> {
  const root = await $.session.root().catch(() => '')
  if (!root) return { branch: '', folder: '' }
  const branch = await $.process
    .run(['git', '-C', root, 'branch', '--show-current'])
    .then(result => (result.exitCode === 0 ? branchOf(result.stdout) : ''))
    .catch(() => '')
  return { branch, folder: folderOf(root) }
}

async function findLink($: EngineInterface): Promise<OfficeLink> {
  let found: OfficeLink
  try {
    const result = await $.mcp.call('ccd_session_mgmt', 'get_session', { session_id: 'self' })
    const text = result.content.map(block => block.text ?? block.uri ?? '').join('\n')
    const url = result.isError ? undefined : sessionLinkOf(`${text}\n${JSON.stringify(result.structuredContent ?? '')}`)
    const title = result.isError ? '' : sessionTitleOf(text, result.structuredContent)
    found =
      url !== undefined
        ? { status: 'ok', url, detail: '', ...(title ? { title } : {}) }
        : { status: 'none', url: '', detail: result.isError ? `ccd_session_mgmt отказал: ${clip(text, 120)}` : 'в ответе ccd_session_mgmt нет ссылки claude://', ...(title ? { title } : {}) }
  } catch (error) {
    found = { status: 'none', url: '', detail: `ccd_session_mgmt недоступен: ${clip(error instanceof Error ? error.message : String(error), 120)}` }
  }
  const place = await whereWeWork($)
  const at = await now($)
  const known: OfficeLink = { ...found, ...(place.branch ? { branch: place.branch } : {}), ...(place.folder ? { folder: place.folder } : {}), at }
  await update($, link, () => known)
  publish($)
  return known
}

function watchSession($: EngineInterface): void {
  sessionTimer?.cancel()
  sessionTimer = $.clock.every(SESSION_REFRESH_MS, () => void findLink($).catch(() => undefined))
}

async function openSession($: EngineInterface): Promise<{ ok: boolean; text: string }> {
  const known = await read($, link)
  if (known.status !== 'ok') return { ok: false, text: `Ссылки на сессию нет: ${known.detail || 'ещё не найдена'}` }
  const isOpened = await $.process
    .run(['open', known.url])
    .then(result => result.exitCode === 0)
    .catch(() => false)
  return isOpened ? { ok: true, text: 'Открыл сессию в Claude' } : { ok: false, text: `Не смог открыть сам — ссылка: ${known.url}` }
}

async function openSessionFor($: EngineInterface, action: OfficeAction): Promise<void> {
  const opened = await openSession($)
  await ackOf($, action, opened.ok, opened.text)
}

async function act($: EngineInterface, action: OfficeAction): Promise<void> {
  const boss = await read($, coordinator)
  const agent = (await read($, agents))[action.agent]
  const isBoss = action.agent === 'coordinator'
  if (!isBoss && (agent === undefined || agent.status === 'gone')) {
    await ackOf($, action, false, 'Этого агента уже нет в офисе')
    return
  }
  if (action.action === 'session') {
    await openSessionFor($, action)
    return
  }
  if (action.action === 'say') {
    await say($, action, isBoss ? undefined : agent)
    return
  }
  if (action.action === 'converse') {
    const text = cleanMessage(action.text)
    const draft = text
      ? messageFor(isBoss || agent === undefined ? bossLabel(boss) : nameOf(agent), isBoss ? undefined : action.agent, text)
      : isBoss || agent === undefined
        ? converseText(bossLabel(boss))
        : converseText(nameOf(agent), action.agent)
    const filled = await fill($, draft)
    await ackOf($, action, filled.how !== 'none', filled.text)
    return
  }
  if (isBoss && action.action === 'answer') {
    await answerBoss($, action)
    return
  }
  if (isBoss || agent === undefined) {
    await ackOf($, action, false, 'Координатора не останавливают из офиса')
    return
  }
  if (action.action === 'answer') await answer($, action, agent)
  else await stopFromOffice($, action, agent)
}

async function takeInbox($: EngineInterface): Promise<void> {
  if (isTaking) return
  isTaking = true
  try {
    const paths = await hostPaths($)
    const inbox = `${paths.dir}/inbox.json`
    if (!(await $.fs.exists(inbox).catch(() => false))) return
    const taken = `${paths.dir}/inbox.taken.json`
    const isMoved = await $.process
      .run(['/bin/mv', '-f', inbox, taken])
      .then(result => result.exitCode === 0)
      .catch(() => false)
    if (!isMoved) return
    const text = await $.fs.read(taken).catch(() => '')
    for (const action of readInbox(typeof text === 'string' ? text : '')) {
      if (handled.includes(action.request)) continue
      handled.push(action.request)
      if (handled.length > HANDLED_KEPT) handled.shift()
      await act($, action)
    }
    await $.fs.write(taken, '[]').catch(() => undefined)
    publish($)
  } finally {
    isTaking = false
  }
}

async function messageAt($: EngineInterface, to: string, at: number): Promise<{ done: () => Promise<void>; undo: () => Promise<void> } | undefined> {
  const all = await read($, agents)
  const id = findAgent(all, to)
  const before = id !== undefined ? all[id] : undefined
  if (id === undefined || before === undefined) return undefined
  const boss = await read($, coordinator)
  const seats = await read($, reserved)
  let fresh: OfficeEvent[] = []
  let nextSeats = seats
  await update($, agents, current => {
    const change = messageAgent(current, id, at, seats, boss)
    fresh = change.events
    nextSeats = change.reserved
    return change.agents
  })
  await update($, reserved, () => nextSeats)
  await schedule($)
  return {
    done: () => addEvents($, fresh),
    undo: async () => {
      await update($, agents, current => (current[id]?.lastToolAt === at ? { ...current, [id]: before } : current))
      await update($, reserved, () => seats)
      await schedule($)
    },
  }
}

async function stopAt($: EngineInterface, id: string, why: string, at: number): Promise<{ done: () => Promise<void>; undo: () => Promise<void> } | undefined> {
  const before = (await read($, agents))[id]
  if (before === undefined || before.status === 'gone' || before.status === 'stopped') return undefined
  let fresh: OfficeEvent[] = []
  await update($, agents, current => {
    const change = stopNow(current, id, why, at)
    fresh = change.events
    return change.agents
  })
  await schedule($)
  return {
    done: () => addEvents($, fresh),
    undo: async () => {
      await update($, agents, current => (current[id]?.status === 'stopped' && current[id]?.statusAt === at ? { ...current, [id]: before } : current))
      await schedule($)
    },
  }
}

async function addEvents($: EngineInterface, fresh: readonly OfficeEvent[]): Promise<void> {
  if (fresh.length === 0) return
  await update($, events, list => [...list, ...fresh].slice(-EVENTS_KEPT))
}

async function setCoordinator($: EngineInterface, change: (boss: OfficeCoordinator) => OfficeCoordinator): Promise<void> {
  const current = await read($, coordinator)
  const next = change(current)
  if (JSON.stringify(current) === JSON.stringify(next)) return
  await update($, coordinator, value => change(value))
}

function asksOf(questions: unknown): OfficeAsk[] {
  if (!Array.isArray(questions)) return []
  return questions.slice(0, 4).flatMap((one, index) => {
    if (one === null || typeof one !== 'object') return []
    const item = one as { question?: unknown; options?: unknown }
    const question = typeof item.question === 'string' ? clip(item.question, 200) : ''
    const options = Array.isArray(item.options)
      ? item.options.slice(0, 6).flatMap(option => {
          const label = option !== null && typeof option === 'object' ? (option as { label?: unknown }).label : option
          return typeof label === 'string' ? [clip(label, 80)] : []
        })
      : []
    const recommended = options.find(label => RECOMMENDED.test(label))
    const multi = (one as { multiSelect?: unknown }).multiSelect === true
    return question ? [{ id: `q${index + 1}`, question, options, ...(recommended !== undefined ? { recommended } : {}), ...(multi ? { multi } : {}) }] : []
  })
}

const RECOMMENDED = /\((recommended|рекоменд[а-яё]*)\)/i

function withoutLive(boss: OfficeCoordinator): OfficeCoordinator {
  if (boss.live === undefined) return boss
  const next = { ...boss }
  delete next.live
  return next
}

function withoutAnswered(boss: OfficeCoordinator): OfficeCoordinator {
  if (boss.answered === undefined) return boss
  const next = { ...boss }
  delete next.answered
  return next
}

function withoutAsk(boss: OfficeCoordinator): OfficeCoordinator {
  const next = withoutAnswered(withoutLive(boss))
  if (next.asks === undefined) return next
  const out = { ...next }
  delete out.asks
  return out
}

type BossRun = OfficeCoordinator['runs'][number]

function bossStarts(boss: OfficeCoordinator, run: BossRun, activity: { text: string; act: OfficeCoordinator['act'] }, isLeadSkill: boolean): OfficeCoordinator {
  return changeTurn(
    {
      ...bossToDesk(boss, run.at),
      status: 'working',
      activity: activity.text,
      act: activity.act,
      lastAt: run.at,
      statusAt: boss.status === 'working' ? boss.statusAt : run.at,
      toolCount: boss.toolCount + 1,
      isLead: boss.isLead || isLeadSkill,
      runs: [...boss.runs, run].slice(-RUNS_KEPT),
    },
    turn => ({ ...turn, tools: [...turn.tools, run].slice(-TURN_TOOLS_KEPT) }),
  )
}

function bossEnds(boss: OfficeCoordinator, at: number, endedAt: number, failed: boolean, activity: string): OfficeCoordinator {
  const settled: OfficeCoordinator = { ...boss, status: 'working', activity, lastAt: Math.max(boss.lastAt, endedAt), runs: settleRun(boss.runs, at, failed) }
  return changeTurn(settled, turn => ({ ...turn, tools: settleRun(turn.tools, at, failed) }))
}

type Wake = (picked: Picked[] | undefined) => void

const waiters = new Map<string, Wake>()

function labelAt(options: unknown, index: number): string {
  const option: unknown = Array.isArray(options) ? options[index] : undefined
  const label = option !== null && typeof option === 'object' ? (option as { label?: unknown }).label : option
  return typeof label === 'string' ? label : ''
}

function answersFrom(questions: unknown, picked: readonly Picked[]): Record<string, string> {
  const list: unknown[] = Array.isArray(questions) ? questions : []
  const out: Record<string, string> = {}
  picked.forEach((pick, index) => {
    const item = list[index] as { question?: unknown; options?: unknown } | undefined
    const question = typeof item?.question === 'string' ? item.question : ''
    out[question] = 'other' in pick ? pick.other : pick.picks.map(at => labelAt(item?.options, at)).join(', ')
  })
  return out
}

function claudeAnswerOf(ran: ToolCallResult): string {
  const result = ran.result as { answers?: unknown; response?: unknown } | undefined
  const answers = result?.answers
  const values = answers !== null && typeof answers === 'object' ? Object.values(answers as Record<string, unknown>).filter(value => typeof value === 'string') : []
  const text = values.length > 0 ? values.join('; ') : typeof result?.response === 'string' ? result.response : ''
  return clip(text.replace(/\s+/g, ' ').trim(), 200)
}

async function bossAsks($: EngineInterface, e: ToolCallInput, askId: string, at: number): Promise<void> {
  const args = e as unknown as Readonly<Record<string, unknown>>
  const activity = describeTool('AskUserQuestion', args)
  const run = { at, text: activity.text, state: 'running' as const, tool: 'AskUserQuestion' }
  const asked = asksOf(args['questions'])
  await setCoordinator($, boss => ({ ...withoutAnswered(bossStarts(boss, run, activity, false)), status: 'asking', asks: asked, live: { id: askId, at } }))
  const boss = await read($, coordinator)
  await addEvents($, [bossEvent(boss, at, `asks you: ${activity.text}`, 'warn')])
  await schedule($)
}

async function bossAnswered($: EngineInterface, askId: string, at: number, failed: boolean, reply?: Omit<OfficeBossReply, 'at'>): Promise<void> {
  const endedAt = await now($)
  await setCoordinator($, boss => {
    const ended = bossEnds(boss, at, endedAt, failed, 'Получил ответ')
    if (boss.live !== undefined && boss.live.id !== askId) return ended
    const cleared = withoutAsk(ended)
    return reply !== undefined ? { ...cleared, answered: { ...reply, at: endedAt } } : cleared
  })
  if (reply?.from === 'office') {
    const boss = await read($, coordinator)
    await addEvents($, [bossEvent(boss, endedAt, `ответ из офиса: ${reply.text}`, 'ok')])
  }
  await schedule($)
}

async function askInOffice($: EngineInterface, e: ToolCallInput, next: Next<'tool.call'>): Promise<ToolCallResult> {
  const core = next(e)
  void core.catch(() => undefined)
  const askId = askIdOf(String(e.tool_use_id))
  let wake: Wake = () => undefined
  const fromPage = new Promise<Picked[] | undefined>(resolve => (wake = resolve))
  waiters.set(askId, wake)
  const onAbort = () => wake(undefined)
  next.signal.addEventListener('abort', onAbort, { once: true })
  const forget = () => {
    if (waiters.get(askId) === wake) waiters.delete(askId)
    next.signal.removeEventListener('abort', onAbort)
  }
  let at = 0
  try {
    at = await now($)
    await bossAsks($, e, askId, at)
  } catch {
    forget()
    await setCoordinator($, boss => (boss.live?.id === askId ? withoutAsk(boss) : boss)).catch(() => undefined)
    return core
  }
  const first = await Promise.race([core.then(ran => ({ ran }), () => ({ ran: undefined })), fromPage.then(picked => ({ picked }))])
  forget()
  if ('picked' in first && first.picked !== undefined) {
    const answers = answersFrom((e as unknown as Readonly<Record<string, unknown>>)['questions'], first.picked)
    const text = clip(Object.values(answers).join('; '), 200)
    await bossAnswered($, askId, at, false, { from: 'office', text }).catch(() => undefined)
    return { result: { questions: (e as unknown as { questions: unknown }).questions, answers } } as unknown as ToolCallResult
  }
  try {
    if ('picked' in first) await bossAnswered($, askId, at, true)
    else {
      const ran = first.ran
      const failed = ran === undefined || ran.deny !== undefined || ran.isError === true
      await bossAnswered($, askId, at, failed, failed || ran === undefined ? undefined : { from: 'claude', text: claudeAnswerOf(ran) })
    }
  } catch {
    return core
  }
  return core
}

async function answerBoss($: EngineInterface, action: OfficeAction): Promise<void> {
  const boss = await read($, coordinator)
  const live = boss.live
  const wake = live !== undefined ? waiters.get(live.id) : undefined
  if (live === undefined || wake === undefined || action.ask !== live.id || live.sent !== undefined) {
    if (live !== undefined && wake === undefined) await setCoordinator($, current => (current.live?.id === live.id ? withoutLive(current) : current))
    await ackOf($, action, false, ASK_CLOSED)
    return
  }
  const checked = checkAnswers(boss.asks ?? [], action.answers)
  if ('why' in checked) {
    await ackOf($, action, false, checked.why)
    return
  }
  const at = await now($)
  await setCoordinator($, current => (current.live?.id === live.id ? { ...current, live: { ...live, sent: { text: checked.text, at } } } : current))
  wake(checked.picked)
  await ackOf($, action, true, 'Ответ отправлен в Claude')
}

function changeTurn(boss: OfficeCoordinator, change: (turn: OfficeTurn) => OfficeTurn): OfficeCoordinator {
  const last = boss.turnLog[boss.turnLog.length - 1]
  if (last === undefined || last.state !== 'running') return boss
  return { ...boss, turnLog: [...boss.turnLog.slice(0, -1), change(last)] }
}

async function ensureStarted($: EngineInterface): Promise<number> {
  const started = await read($, startedAt)
  if (started > 0) return started
  const at = await now($)
  await update($, startedAt, value => (value > 0 ? value : at))
  return at
}

async function tick($: EngineInterface): Promise<void> {
  if (isTicking) return
  isTicking = true
  try {
    const at = await now($)
    const before = await read($, agents)
    const boss = await read($, coordinator)
    const planned = stepAgents(before, at, boss)
    let bossMove = planned.boss
    if (planned.changed) {
      let fresh: OfficeEvent[] = []
      await update($, agents, all => {
        const stepped = stepAgents(all, at, boss)
        fresh = stepped.events
        bossMove = stepped.boss
        return stepped.agents
      })
      await addEvents($, fresh)
    }
    const all = await read($, agents)
    await setCoordinator($, current => stepBoss(current, all, at, bossMove))
    const started = await read($, startedAt)
    const minute = started > 0 ? Math.floor((at - started) / 60_000) : 0
    if ((await read($, beat)) !== minute) await update($, beat, () => minute)
  } finally {
    isTicking = false
  }
  await schedule($)
}

async function schedule($: EngineInterface): Promise<void> {
  publish($)
  const mode = tickMode(await read($, agents), await read($, coordinator))
  const period = mode === 'fast' ? TICK_MS : mode === 'slow' ? BEAT_MS : 0
  if (period === timerPeriod) return
  timer?.cancel()
  timer = undefined
  timerPeriod = period
  if (period > 0) timer = $.clock.every(period, () => void tick($))
}

async function docksPanes($: EngineInterface): Promise<boolean> {
  try {
    const surfaces = await $.session.surfaces()
    if (surfaces.some(surface => surface !== 'terminal')) return true
  } catch {
    return isTerminalFullscreen === true
  }
  return isTerminalFullscreen === true
}

async function openPane($: EngineInterface): Promise<void> {
  await ensureStarted($)
  await $.ui.open({ id: PANE, title: TITLE })
  const at = await now($)
  const all = await read($, agents)
  await setCoordinator($, boss => enterBoss(boss, all, at))
  await schedule($)
}

async function openUnasked($: EngineInterface): Promise<void> {
  if (await read($, autoOpened)) return
  await update($, autoOpened, () => true)
  if (await docksPanes($)) await openPane($)
  else $.ui.toast('Офис: набери /office, чтобы увидеть офис')
}

function poseOf(agent: OfficeAgent): Pose {
  if (agent.path.length > 0) return 'walk'
  if (agent.goal === 'door') return 'idle'
  if (agent.goal === 'board') return 'think'
  if (agent.goal === 'coffee') return 'coffee'
  if (agent.goal === 'lounge') return 'sofa'
  const byStatus: Readonly<Record<OfficeStatus, Pose>> = {
    working: 'type',
    thinking: 'think',
    decision: 'raise',
    blocked: 'raise',
    failed: 'fail',
    done: agent.restUntil > 0 ? 'idle' : 'done',
    stopped: 'idle',
    gone: 'idle',
  }
  return byStatus[agent.status]
}

let systemUrl = ''

async function showOffice($: EngineInterface): Promise<Showing> {
  await ensureServer($)
  const host = await read($, server)
  if (host.status !== 'running' || child === undefined) return { how: 'down', detail: host.detail }
  const url = host.url
  if (systemUrl === url) return { how: 'already', url }
  let isOpened = false
  for (const opener of ['open', 'xdg-open']) {
    isOpened = await $.process
      .run([opener, url])
      .then(result => result.exitCode === 0)
      .catch(() => false)
    if (isOpened) break
  }
  if (!isOpened) return { how: 'manual', url, lang: await langFor($) }
  systemUrl = url
  return { how: 'system', url }
}

async function openOffice($: EngineInterface): Promise<void> {
  $.ui.toast(sayShowing(await showOffice($)))
}

async function openSessionToast($: EngineInterface): Promise<void> {
  $.ui.toast(`Офис: ${(await openSession($)).text}`)
}

async function copyLink($: EngineInterface, surface: 'terminal' | 'desktop' | 'mobile' | 'vscode'): Promise<void> {
  const host = await read($, server)
  const copied = await $.ui.copy({ text: host.url, surface }).catch(() => ({ isCopied: false }))
  $.ui.toast(copied.isCopied ? 'Офис: ссылка скопирована' : `Офис: ${host.url}`)
}

export const register: Register = (on, options) => {
  const autoOpen = autoOpenOf(options['autoOpen'])

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    try {
      await $.command.register({ name: 'office', description: 'Открыть «Офис» — пиксельный офис с агентами сессии — в браузере и показать его панель' })
    } catch {
      $.ui.toast('Офис: команда /office не зарегистрировалась')
    }
    await ensureStarted($)
    try {
      const model = modelBadge(await $.session.model())
      await setCoordinator($, boss => ({ ...boss, model: boss.model || model }))
    } catch {
      await ensureStarted($)
    }
    timerPeriod = 0
    await setCoordinator($, boss => withoutLive(boss))
    if (opensAt(autoOpen, 'session-start') && e.isInteractive) await openUnasked($)
    if (e.isInteractive) void ensureServer($)
    if (e.isInteractive) {
      void findLink($).catch(() => undefined)
      watchSession($)
    }
    await schedule($)
    return started
  })

  on('session.end', async ($, e, next) => {
    const at = await now($)
    if (e.reason === 'clear') {
      await update($, agents, all => leaveAll(all, at))
      await setCoordinator($, boss => withoutAsk({ ...boss, isLead: false, status: 'idle', activity: '', lastAt: at, statusAt: at }))
      await schedule($)
      return next(e)
    }
    await update($, agents, () => ({}))
    await update($, events, () => [])
    await update($, reserved, () => ({}))
    await update($, acks, () => [])
    await update($, said, () => [])
    await update($, coordinator, boss => ({ ...IDLE_COORDINATOR, model: boss.model }))
    await update($, startedAt, () => at)
    await stopServer($)
    return next(e)
  })

  on('command.run', { command: 'office' }, async ($, e) => {
    if (e.presentation !== undefined) isTerminalFullscreen = e.presentation.isFullscreen
    const panes = await $.ui.panes().catch(() => [])
    const pane = panes.find(one => one.id === PANE)
    if (pane === undefined || !pane.isPlaced || !pane.isShown) await openPane($)
    void findLink($).catch(() => undefined)
    return { text: sayShowing(await showOffice($)) }
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (spawned.deny !== undefined || spawned.agentId === undefined) return spawned
    const id = spawned.agentId
    const asked = askedEffort.get(e.tool_use_id)
    askedEffort.delete(e.tool_use_id)
    const effort = asked || (await defaultEffort($, e.subagentType))
    const at = await now($)
    await ensureStarted($)
    await setCoordinator($, boss => ({ ...boss, isLead: true }))
    const boss = await read($, coordinator)
    const seats = await read($, reserved)
    let fresh: OfficeEvent[] = []
    let nextSeats = seats
    await update($, agents, all => {
      const change = spawnAgent(
        all,
        seats,
        id,
        {
          type: e.subagentType,
          description: e.description,
          model: spawned.model || e.model || e.parentModel,
          ...(effort ? { effort } : {}),
          background: e.background,
          brief: e.prompt,
          ...(e.name !== undefined ? { name: e.name } : {}),
          ...(e.parentAgentId !== undefined ? { parent: e.parentAgentId } : {}),
        },
        at,
        boss,
      )
      fresh = change.events
      nextSeats = change.reserved
      return change.agents
    })
    await update($, reserved, () => nextSeats)
    await addEvents($, fresh)
    if (opensAt(autoOpen, 'first-agent')) await openUnasked($)
    await schedule($)
    return spawned
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool === 'AskUserQuestion' && e.agentId === undefined) return askInOffice($, e, next)
    if (e.tool === 'Agent') {
      const effort = effortOf((e as unknown as Readonly<Record<string, unknown>>)['effort'])
      if (effort && e.tool_use_id) askedEffort.set(e.tool_use_id, effort)
    }
    const tool = String(e.tool)
    const args = e as unknown as Readonly<Record<string, unknown>>
    const activity = describeTool(tool, args)
    const at = await now($)
    if (e.agentId !== undefined) {
      const agentId = e.agentId
      const known = (await read($, agents))[agentId] !== undefined
      if (!known) return next(e)
      const boss = await read($, coordinator)
      const seats = await read($, reserved)
      let fresh: OfficeEvent[] = []
      let nextSeats = seats
      await update($, agents, all => {
        const change = startTool(all, agentId, activity, tool, at, seats, boss)
        fresh = change.events
        nextSeats = change.reserved
        return change.agents
      })
      await update($, reserved, () => nextSeats)
      await addEvents($, fresh)
      await schedule($)
      const ran = await next(e)
      const failed = ran.deny !== undefined || ran.isError === true
      const endedAt = await now($)
      const denied = ran.deny !== undefined ? [`${toolName(tool)}: ${clip(String(ran.deny), 120)}`] : []
      await update($, agents, all => {
        const ended = endTool(all, agentId, at, failed, endedAt)
        const one = ended[agentId]
        return one !== undefined && denied.length > 0 ? { ...ended, [agentId]: noteOf(one, 'denied', denied, endedAt) } : ended
      })
      return ran
    }
    const target = String(args['task_id'] ?? args['shell_id'] ?? '')
    const isOwnStop = tool === 'TaskStop' && ownStop !== undefined && target === ownStop.id
    const isLeadSkill = tool === 'Skill' && LEAD_SKILL.test(String(args['skill'] ?? ''))
    const run = { at, text: activity.text, state: 'running' as const, tool }
    if (!isOwnStop) {
      await setCoordinator($, boss => bossStarts(boss, run, activity, isLeadSkill))
      await schedule($)
    }
    const to = String(args['to'] ?? args['recipient'] ?? args['agent_id'] ?? '')
    const early =
      tool === 'SendMessage' ? await messageAt($, to, at) : tool === 'TaskStop' && target !== '' ? await stopAt($, target, isOwnStop ? (ownStop?.why ?? 'from the office') : 'stopped by the coordinator', at) : undefined
    const ran = await next(e)
    const failed = ran.deny !== undefined || ran.isError === true
    if (early !== undefined) await (failed ? early.undo() : early.done())
    if (tool === 'SendMessage' && !failed && to !== '') await sawDelivery($, to, at)
    if (isOwnStop) return ran
    const endedAt = await now($)
    await setCoordinator($, boss => bossEnds(boss, at, endedAt, failed, boss.activity))
    return ran
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const agentId = e.agentId
    const effort = effortOf(e.effort)
    if (agentId === undefined) {
      if (effort) await setCoordinator($, boss => (boss.effort === effort ? boss : { ...boss, effort }))
      return result
    }
    const usage = result.usage as unknown as Partial<Record<string, unknown>> | null
    const hasUsage = usage !== null && usage !== undefined
    if (!hasUsage && !effort) return result
    await update($, agents, all => {
      const agent = all[agentId]
      if (agent === undefined || agent.status === 'gone') return all
      const isRunning = !(agent.endedAt > 0 && agent.status !== 'working' && agent.status !== 'thinking')
      const live = hasUsage && isRunning ? { live: addTokens(agent.live ?? EMPTY_TOKENS, usage) } : {}
      if (Object.keys(live).length === 0 && (!effort || agent.effort === effort)) return all
      return { ...all, [agentId]: { ...agent, ...live, ...(effort ? { effort } : {}) } }
    })
    publish($)
    return result
  })

  on('turn.start', async ($, e, next) => {
    if (e.text.trim() !== '') lastPrompt = e.text.slice(0, 400)
    const at = await now($)
    await ensureStarted($)
    const turn: OfficeTurn = { at, text: objectiveOf(e.text) || 'continuation', endedAt: 0, state: 'running', tools: [], tokens: EMPTY_TOKENS, cost: 0 }
    await setCoordinator($, boss => ({
      ...withoutAnswered(bossToDesk(boss, at)),
      status: 'working',
      activity: 'Читает твоё сообщение',
      act: 'read',
      lastAt: at,
      statusAt: at,
      turns: boss.turns + 1,
      turnLog: [...boss.turnLog.filter(one => one.state !== 'running'), turn].slice(-TURNS_KEPT),
    }))
    await sawTurn($, e.text, e.turnId)
    await schedule($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const at = await now($)
    const usage = e.usage as unknown as Partial<Record<string, unknown>> | undefined
    if (e.agentId === undefined) {
      const failed = e.isAborted || e.reason === 'error' || e.reason === 'refusal'
      const asks = !failed && endsWithQuestion(e.answer)
      await setCoordinator($, boss => {
        const badge = (typeof usage?.['model'] === 'string' ? modelBadge(usage['model']) : '') || boss.model
        const added = costOf(addTokens(EMPTY_TOKENS, usage), badge)
        return changeTurn(
          {
            ...seatBoss(boss),
            status: failed ? 'idle' : asks ? 'asking' : 'done',
            activity: e.isAborted ? 'Прервано' : failed ? 'Остановился на ошибке' : asks ? clip(questionOf(e.answer), 60) : 'Ждёт тебя',
            model: boss.model || badge,
            tokens: addTokens(boss.tokens, usage),
            cost: boss.cost + added,
            lastAt: at,
            statusAt: at,
            flagged: boss.flagged + (failed && !e.isAborted ? 1 : 0),
          },
          turn => ({ ...turn, endedAt: at, state: failed ? 'error' : 'ok', tokens: addTokens(turn.tokens, usage), cost: turn.cost + added }),
        )
      })
      await sawAnswer($, e.turnId)
      await schedule($)
      return next(e)
    }
    const agentId = e.agentId
    if ((await read($, agents))[agentId] === undefined) return next(e)
    const parsed = parseResult(e.answer)
    let fresh: OfficeEvent[] = []
    await update($, agents, all => {
      const change = completeAgent(all, agentId, { parsed, reason: e.reason, isAborted: e.isAborted, ...(usage !== undefined ? { usage } : {}) }, at)
      fresh = change.events
      return change.agents
    })
    await addEvents($, fresh)
    await schedule($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt', surface: 'terminal' }, ($, e, next) => {
    if (e.viewport?.isFullscreen !== undefined) isTerminalFullscreen = e.viewport.isFullscreen
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const all = await read($, agents)
    const boss = await read($, coordinator)
    const log = await read($, events)
    const started = await read($, startedAt)
    await read($, beat)
    const host = await read($, server)
    const session = await read($, link)
    const at = await now($)
    const shown = visibleAgents(all)
    const begin = started > 0 ? started : at
    const spent = sessionCost(all, boss)

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      const width = Math.max(24, e.props.bodyColumns)
      const working = shown.filter(([, agent]) => agent.status === 'working' || agent.status === 'thinking').length
      const waiting = shown.filter(([, agent]) => agent.status === 'decision' || agent.status === 'blocked').length + (boss.status === 'asking' ? 1 : 0)
      const head = `agents ${Object.keys(all).length} · working ${working} · waiting ${waiting} · ${formatDuration(at - begin)} · ≈${formatCost(spent)}`
      const bossPose: Pose =
        boss.path.length > 0
          ? 'walk'
          : boss.goal === 'coffee'
            ? 'coffee'
            : boss.status === 'asking'
              ? 'ask'
              : boss.status === 'working'
                ? 'type'
                : boss.status === 'thinking'
                  ? 'think'
                  : boss.status === 'done'
                    ? 'done'
                    : 'idle'
      const row = (key: string, pose: Pose, color: string, title: string, activity: string) => (
        <Box key={key} flexDirection="column">
          <Box flexDirection="row">
            <Text color={POSE_COLOR[pose] ?? color} bold>
              {ASCII[pose]}
            </Text>
            <Text color={color} wrap="truncate-end">{` ${clip(title, width - 7)}`}</Text>
          </Box>
          {activity.length > 0 && <Text dimColor wrap="truncate-end">{`       «${clip(activity, Math.max(8, width - 10))}»`}</Text>}
        </Box>
      )
      return (
        <Box flexDirection="column">
          <Text dimColor wrap="truncate-end">
            {clip(head, width)}
          </Text>
          {row(
            'row-coordinator',
            bossPose,
            '#E05A4F',
            `${bossLabel(boss)}${boss.model ? ` · ${boss.model}` : ''}${boss.effort ? ` ${boss.effort}` : ''} · ${STATUS_WORD[boss.status]} · ≈${formatCost(boss.cost)}`,
            boss.status === 'idle' ? '' : boss.activity,
          )}
          {shown.length === 0 && <Text dimColor>{`       Only ${bossLabel(boss)} is in the office.`}</Text>}
          {shown.map(([id, agent]) => {
            const end = agent.status === 'done' || agent.status === 'failed' ? agent.endedAt || at : at
            const word = agent.path.length > 0 && agent.status === 'working' ? STATUS_WORD.walking : STATUS_WORD[agent.status]
            const title = `${nameOf(agent)}${agent.model ? ` · ${agent.model}` : ''}${agent.effort ? ` ${agent.effort}` : ''} · ${word} · ${formatDuration(end - agent.startedAt)} · ${agent.toolCount} tools · ≈${formatCost(agent.cost)}`
            return row(`row-${id}`, poseOf(agent), roleOf(agent.type).accent, title, agent.status === 'working' || agent.status === 'thinking' ? agent.activity : agent.summary || agent.activity)
          })}
          {log.slice(-3).map((event, index) => (
            <Text key={`ev-${index}`} dimColor wrap="truncate-end">{`  · ${clip(`${event.who}: ${event.text}`, width - 4)}`}</Text>
          ))}
        </Box>
      )
    }

    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const failed = shown.filter(([, agent]) => agent.status === 'failed').length
    const working = shown.filter(([, agent]) => agent.status === 'working' || agent.status === 'thinking').length + (boss.status === 'working' || boss.status === 'thinking' ? 1 : 0)
    const waiting = shown.filter(([, agent]) => agent.status === 'decision' || agent.status === 'blocked').length + (boss.status === 'asking' ? 1 : 0)
    const status = host.status === 'running' && child === undefined ? 'off' : host.status
    const line: Readonly<Record<typeof status, string>> = {
      off: 'The office server is not running.',
      starting: 'Starting the office server…',
      running: host.detail,
      failed: host.detail || 'The office server failed to start.',
    }
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{`${bossLabel(boss)} and ${shown.length} ${shown.length === 1 ? 'agent' : 'agents'} · ≈${formatCost(spent)}`}</Text>
        <Text>{`${working} working · ${waiting} waiting · ${failed} failed`}</Text>
        <Text dimColor>{line[status]}</Text>
        {status === 'running' && <Markdown key="office-link" dimColor text={`[${host.url}](${host.url})`} onLinkPress={() => void openOffice($)} />}
        <Box flexDirection="row" gap={1}>
          <Button key="open-office" label={status === 'running' ? 'Open office' : 'Start office'} variant="primary" onPress={() => openOffice($)} />
          {status === 'running' && <Button key="copy-office" label="Copy link" onPress={() => copyLink($, e.surface)} />}
          {session.status === 'ok' && <Button key="open-session" label="Открыть сессию в Claude" onPress={() => openSessionToast($)} />}
        </Box>
        {session.status === 'none' && <Text dimColor>{`Сессия в Claude: ${session.detail}`}</Text>}
      </Box>
    )
  })
}
