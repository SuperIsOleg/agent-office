export const PUBLISH_MS = 60
export const PORT_WAIT_MS = 4_000

export type HostPaths = { dir: string; state: string; port: string }

export function safeSegment(text: string): string {
  return text.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'session'
}

export function hostPathsOf(data: string | undefined, tmp: string | undefined, sessionId: string): HostPaths {
  const base = (data ?? `${(tmp ?? '/tmp').replace(/\/$/, '')}/agent-office`).replace(/\/$/, '')
  const dir = `${base}/office/${safeSegment(sessionId)}`
  return { dir, state: `${dir}/state.json`, port: `${dir}/server.json` }
}

export function nextVersion(previous: number, now: number): number {
  return Math.max(previous + 1, Math.floor(now))
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function officeUrl(port: number, token: string): string {
  return `http://127.0.0.1:${port}/?token=${token}`
}

export function readPortFile(text: string, token: string): number | undefined {
  try {
    const parsed = JSON.parse(text) as { port?: unknown; token?: unknown }
    return typeof parsed.port === 'number' && parsed.token === token ? parsed.port : undefined
  } catch {
    return undefined
  }
}

export function serverCommands(root: string, node: string, paths: HostPaths, token: string): string[][] {
  const common = ['--dir', paths.dir, '--web', `${root}/web`, '--token', token]
  return [
    [node, `${root}/server/office-server.mjs`, ...common],
    ['python3', `${root}/server/office_server.py`, ...common],
  ]
}

function versionParts(name: string): number[] {
  return (/^v?(\d+)\.(\d+)\.(\d+)/.exec(name)?.slice(1) ?? []).map(Number)
}

export function newestVersion(names: readonly string[]): string | undefined {
  const versions = names.filter(name => versionParts(name).length === 3)
  return versions.sort((a, b) => {
    const [x, y] = [versionParts(a), versionParts(b)]
    return (y[0] ?? 0) - (x[0] ?? 0) || (y[1] ?? 0) - (x[1] ?? 0) || (y[2] ?? 0) - (x[2] ?? 0)
  })[0]
}

export type NodeVersions = { nvm: readonly string[]; fnm: readonly string[]; fnmMac: readonly string[] }

export function nodeCandidates(home: string, versions: NodeVersions): string[] {
  const nvm = newestVersion(versions.nvm)
  const fnm = newestVersion(versions.fnm)
  const fnmMac = newestVersion(versions.fnmMac)
  const own = home === ''
    ? []
    : [
        `${home}/.volta/bin/node`,
        nvm && `${home}/.nvm/versions/node/${nvm}/bin/node`,
        fnm && `${home}/.local/share/fnm/node-versions/${fnm}/installation/bin/node`,
        fnmMac && `${home}/Library/Application Support/fnm/node-versions/${fnmMac}/installation/bin/node`,
        `${home}/.asdf/shims/node`,
        `${home}/.local/share/mise/shims/node`,
      ]
  return ['node', '/opt/homebrew/bin/node', '/usr/local/bin/node', ...own, '/usr/bin/node'].filter((one): one is string => typeof one === 'string' && one !== '')
}

export function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? ''
  return /^[\p{L}][\p{L}'-]{0,23}$/u.test(first) ? first : ''
}

export function passwdNameOf(line: string): string {
  return (line.split(':')[4] ?? '').split(',')[0] ?? ''
}

export function userLabelOf(firstName: string): string {
  return firstName || 'Вы'
}

const DEFINITION_PART = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

export type AgentRef = { plugin: string; name: string }

export function agentRefOf(subagentType: string): AgentRef | undefined {
  const parts = subagentType.split(':')
  const [plugin, name] = parts.length === 2 ? parts : ['', parts[0] ?? '']
  if (parts.length > 2 || name === undefined || !DEFINITION_PART.test(name)) return undefined
  if (plugin !== '' && (plugin === undefined || !DEFINITION_PART.test(plugin))) return undefined
  return { plugin: plugin ?? '', name }
}

export function pluginDirsOf(value: string | undefined, home: string): string[] {
  return (value ?? '')
    .split(':')
    .map(one => one.trim())
    .filter(one => one !== '')
    .map(one => (one === '~' || one.startsWith('~/') ? `${home}${one.slice(1)}` : one))
    .filter(one => one.startsWith('/'))
    .map(one => one.replace(/\/+$/, ''))
}

export function manifestNameOf(text: string): string {
  try {
    const name = (JSON.parse(text) as { name?: unknown }).name
    return typeof name === 'string' ? name : ''
  } catch {
    return ''
  }
}

export function installPathsOf(text: string, plugin: string): string[] {
  try {
    const plugins = (JSON.parse(text) as { plugins?: unknown }).plugins
    if (plugins === null || typeof plugins !== 'object') return []
    return Object.entries(plugins as Record<string, unknown>)
      .filter(([key]) => key.split('@')[0] === plugin)
      .flatMap(([, entries]) => (Array.isArray(entries) ? entries : []))
      .map(entry => (entry !== null && typeof entry === 'object' ? (entry as { installPath?: unknown }).installPath : undefined))
      .filter((path): path is string => typeof path === 'string' && path.startsWith('/'))
  } catch {
    return []
  }
}

export type Lang = 'ru' | 'en' | 'both'

const CYRILLIC = /[\u0400-\u04FF]/
const LATIN = /[A-Za-z]/

export function langOf(setting: unknown, prompt: string, locale: string): Lang {
  const chosen = typeof setting === 'string' ? setting.trim().toLowerCase() : ''
  if (chosen !== '') return /^(ru|рус|russian)/.test(chosen) ? 'ru' : 'en'
  if (CYRILLIC.test(prompt)) return 'ru'
  if (LATIN.test(prompt)) return 'en'
  const tag = locale.trim().toLowerCase()
  if (tag.startsWith('ru')) return 'ru'
  if (/^[a-z]{2}/.test(tag) && tag !== 'c' && !tag.startsWith('c.') && tag !== 'posix') return 'en'
  return 'both'
}

export function inLang(lang: Lang, ru: string, en: string): string {
  return lang === 'ru' ? ru : lang === 'en' ? en : `${ru}\n${en}`
}

export type ServerProblem =
  | { kind: 'missing'; tooOld: readonly string[] }
  | { kind: 'port'; reason: string }
  | { kind: 'crashed'; reason: string }
  | { kind: 'unwritable'; dir: string }
  | { kind: 'no-port' }

export const NODE_MIN = 18
export const PYTHON_MIN: readonly [number, number] = [3, 8]

export function nodeVersionOf(output: string): number | undefined {
  const major = /^v(\d+)\.\d+\.\d+/.exec(output.trim())?.[1]
  return major === undefined ? undefined : Number(major)
}

export function pythonVersionOf(output: string): readonly [number, number] | undefined {
  const found = /Python (\d+)\.(\d+)/.exec(output)
  return found === null ? undefined : [Number(found[1]), Number(found[2])]
}

export function isPythonRecent(version: readonly [number, number]): boolean {
  return version[0] > PYTHON_MIN[0] || (version[0] === PYTHON_MIN[0] && version[1] >= PYTHON_MIN[1])
}

const PORT_ERROR = /EADDRINUSE|EACCES|EPERM|EADDRNOTAVAIL|Address already in use|Permission denied|Operation not permitted|Cannot assign requested address/i

export function isPortError(stderr: string): boolean {
  return PORT_ERROR.test(stderr)
}

export function errorLineOf(stderr: string): string {
  const lines = stderr.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '')
  const pick = lines.find(line => PORT_ERROR.test(line)) ?? lines.find(line => /error/i.test(line)) ?? lines.at(-1) ?? ''
  return pick.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 160)
}

export function problemText(problem: ServerProblem, lang: Lang): string {
  switch (problem.kind) {
    case 'missing':
      if (problem.tooOld.length > 0) {
        const old = problem.tooOld.join(', ')
        return inLang(
          lang,
          `Офису нужен Node.js ${NODE_MIN}+ или Python ${PYTHON_MIN.join('.')}+, а найден только ${old} — это слишком старая версия. Обнови Node.js с nodejs.org (или \`brew upgrade node\`) и набери /office снова.`,
          `The office needs Node.js ${NODE_MIN}+ or Python ${PYTHON_MIN.join('.')}+, but only ${old} was found, which is too old. Update Node.js from nodejs.org (or \`brew upgrade node\`), then run /office again.`,
        )
      }
      return inLang(
        lang,
        `Офису нужен Node.js ${NODE_MIN}+ или Python ${PYTHON_MIN.join('.')}+, а их нет — установи Node.js с nodejs.org (или \`brew install node\`) и набери /office снова.`,
        `The office needs Node.js ${NODE_MIN}+ or Python ${PYTHON_MIN.join('.')}+, and neither was found. Install Node.js from nodejs.org (or \`brew install node\`), then run /office again.`,
      )
    case 'port':
      return inLang(
        lang,
        `Сервер офиса не смог открыть локальный порт на 127.0.0.1 (${problem.reason}). Проверь, что фаервол, песочница или политика не запрещают локальные порты, и набери /office снова.`,
        `The office server could not open a local port on 127.0.0.1 (${problem.reason}). Check that no firewall, sandbox or policy blocks local ports, then run /office again.`,
      )
    case 'crashed':
      return inLang(
        lang,
        `Сервер офиса не запустился${problem.reason ? ` (${problem.reason})` : ''}. Проверь, что Node.js ${NODE_MIN}+ (nodejs.org) или Python ${PYTHON_MIN.join('.')}+ установлен и работает, и набери /office снова; если не помогло — перезапусти сессию Claude Code.`,
        `The office server did not start${problem.reason ? ` (${problem.reason})` : ''}. Check that Node.js ${NODE_MIN}+ (nodejs.org) or Python ${PYTHON_MIN.join('.')}+ is installed and runs, then run /office again; if that does not help, restart the Claude Code session.`,
      )
    case 'unwritable':
      return inLang(
        lang,
        `Папка данных офиса недоступна для записи: ${problem.dir}. Освободи место на диске или дай права на запись (или укажи другую папку в CLAUDE_PLUGIN_DATA) и набери /office снова.`,
        `The office data folder is not writable: ${problem.dir}. Free some disk space or grant write access (or point CLAUDE_PLUGIN_DATA at another folder), then run /office again.`,
      )
    case 'no-port':
      return inLang(
        lang,
        'Сервер офиса запустился, но не сообщил свой порт. Набери /office снова; если не помогло — перезапусти сессию Claude Code.',
        'The office server started but did not report its port. Run /office again; if that does not help, restart the Claude Code session.',
      )
  }
}

export type Showing = { how: 'system' | 'already' | 'manual'; url: string; lang?: Lang } | { how: 'down'; detail: string }

export function sayShowing(showing: Showing): string {
  if (showing.how === 'down') return showing.detail
  if (showing.how === 'manual') {
    return inLang(
      showing.lang ?? 'ru',
      `Не смог открыть браузер сам — открой ссылку в любом браузере на этом компьютере: ${showing.url}`,
      `Could not open the browser — open this link in any browser on this computer: ${showing.url}`,
    )
  }
  const lead: Readonly<Record<typeof showing.how, string>> = {
    system: 'Офис открыт в браузере системы',
    already: 'Офис уже открыт в браузере системы, если вкладку закрыли, открой ссылку',
  }
  return `${lead[showing.how]}: ${showing.url}`
}

export type OfficeAnswer = { id: string; text: string; other?: true }

export type OfficeAction = { request: string; action: 'converse' | 'stop' | 'answer' | 'say' | 'session'; agent: string; text: string; answers: OfficeAnswer[]; at: number; ask?: string }

const ACTION_KINDS: ReadonlySet<string> = new Set(['converse', 'stop', 'answer', 'say', 'session'])
const AGENT_ID = /^[A-Za-z0-9._:-]{1,64}$/
const REQUEST_ID = /^[A-Za-z0-9-]{1,40}$/
const ANSWER_ID = /^[A-Za-z0-9_-]{1,20}$/
const ASK_ID = /^[A-Za-z0-9_-]{1,40}$/
export const TEXT_MAX = 300
export const MESSAGE_MAX = 2000
export const ANSWERS_MAX = 5

function answersOf(value: unknown): OfficeAnswer[] | undefined {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > ANSWERS_MAX) return undefined
  const out: OfficeAnswer[] = []
  for (const one of value) {
    if (one === null || typeof one !== 'object') return undefined
    const { id, text, other } = one as { id?: unknown; text?: unknown; other?: unknown }
    if (typeof id !== 'string' || !ANSWER_ID.test(id) || typeof text !== 'string' || text.length > TEXT_MAX) return undefined
    if (other !== undefined && typeof other !== 'boolean') return undefined
    out.push(other === true ? { id, text, other: true } : { id, text })
  }
  return out
}

export function actionOf(value: unknown): OfficeAction | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const { request, action, agent, text = '', answers, at = 0, ask } = value as Record<string, unknown>
  if (typeof request !== 'string' || !REQUEST_ID.test(request)) return undefined
  if (typeof action !== 'string' || !ACTION_KINDS.has(action)) return undefined
  if (typeof agent !== 'string' || !AGENT_ID.test(agent)) return undefined
  if (typeof text !== 'string' || text.length > MESSAGE_MAX || typeof at !== 'number') return undefined
  if (ask !== undefined && (typeof ask !== 'string' || !ASK_ID.test(ask))) return undefined
  const picked = answersOf(answers)
  if (picked === undefined) return undefined
  return { request, action: action as OfficeAction['action'], agent, text, answers: picked, at, ...(typeof ask === 'string' ? { ask } : {}) }
}

export function hashOf(text: string): string {
  let hash = 0x811c9dc5
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function askIdOf(toolUseId: string): string {
  return `ask-${hashOf(toolUseId)}`
}

export function cleanMessage(text: string): string {
  const kept = text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return Array.from(kept).length > MESSAGE_MAX ? '' : kept
}

export function messageFor(name: string, agentId: string | undefined, text: string): string {
  return agentId === undefined ? text : `Сообщение для ${name} (${agentId}): ${text}`
}

const LINK = /^claude:\/\/claude\.ai\/[A-Za-z0-9._~/-]{1,200}$/

const TICKET = /([A-Z][A-Z0-9]{1,9}-\d{1,6})/

export function ticketOf(branch: string, title: string, folder: string): string {
  return /^(?:feature|bugfix|tech)\/([A-Z][A-Z0-9]{1,9}-\d{1,6})(?![\d])/.exec(branch)?.[1] ?? TICKET.exec(title)?.[1] ?? /(?:^|-)([A-Z][A-Z0-9]{1,9}-\d{1,6})$/.exec(folder)?.[1] ?? ''
}

export type SessionLabel = { key: string; main: string; sub: string }

export function sessionLabel(title: string, branch: string, folder: string): SessionLabel {
  const key = ticketOf(branch, title, folder)
  const main = title ? (key && !title.includes(key) ? `${key} · ${title}` : title) : key || folder
  const sub = [branch, folder].filter(part => part !== '' && part !== main).join(' · ')
  return { key, main, sub }
}

export function sessionTitleOf(text: string, structured: unknown): string {
  const fromObject = (value: unknown): string => {
    if (value === null || typeof value !== 'object') return ''
    const title = (value as { title?: unknown }).title
    return typeof title === 'string' ? title : ''
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = undefined
  }
  return flat((fromObject(structured) || fromObject(parsed)).replace(/[\u202a-\u202e\u2066-\u2069\u200e\u200f]/g, ''), 120)
}

export function branchOf(output: string): string {
  const branch = output.trim()
  return /^[A-Za-z0-9._/-]{1,100}$/.test(branch) ? branch : ''
}

export function folderOf(path: string): string {
  const name = path.replace(/\/+$/, '').split('/').pop() ?? ''
  return /^[A-Za-z0-9._ -]{1,80}$/.test(name) ? name : ''
}

export function sessionLinkOf(text: string): string | undefined {
  const found = /claude:\/\/claude\.ai\/[^\s"'<>)\]]+/.exec(text)?.[0]
  return found !== undefined && LINK.test(found) ? found : undefined
}

export const ASK_CLOSED = 'Вопрос уже закрыт — ответь в окне Claude, если он ещё открыт'

export type AskSpec = { id: string; options: readonly string[]; multi?: boolean }

export type Picked = { picks: number[] } | { other: string }

export type Checked = { picked: Picked[]; text: string } | { why: string }

export function checkAnswers(asks: readonly AskSpec[], answers: readonly OfficeAnswer[]): Checked {
  if (asks.length === 0 || answers.length !== asks.length) return { why: 'Ответь на каждый вопрос' }
  const picked: Picked[] = []
  const said: string[] = []
  for (const ask of asks) {
    const given = answers.filter(one => one.id === ask.id)
    const [answer] = given
    if (answer === undefined || given.length > 1) return { why: 'Ответ не к этому вопросу' }
    const text = flat(answer.text, TEXT_MAX)
    if (text.length === 0) return { why: 'Пустой ответ: выбери вариант или напиши свой' }
    if (answer.other === true) {
      picked.push({ other: text })
      said.push(text)
      continue
    }
    const labels = ask.multi === true ? text.split(/\s*,\s*/) : [text]
    const picks = labels.map(label => ask.options.indexOf(label))
    if (picks.some(index => index < 0) || new Set(picks).size !== picks.length) return { why: 'Такого варианта нет в вопросе' }
    picked.push({ picks })
    said.push(labels.join(', '))
  }
  return { picked, text: flat(said.join('; '), 200) }
}

export function readInbox(text: string): OfficeAction[] {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap(one => {
      const action = actionOf(one)
      return action !== undefined ? [action] : []
    })
  } catch {
    return []
  }
}

function flat(text: string, max: number): string {
  const one = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one
}

export function converseText(name: string, id?: string): string {
  return `Сообщение для ${name}${id ? ` (${id})` : ''}: `
}

export function stopText(name: string, id: string, reason: string): string {
  const why = flat(reason, 120)
  return `Останови агента ${name} (${id})${why ? `: ${why}` : ''}`
}

export type AskLine = { id: string; question: string }

export function answerText(name: string, agentId: string, asks: readonly AskLine[], answers: readonly OfficeAnswer[]): string | undefined {
  const given = answers.flatMap(answer => {
    const ask = asks.find(one => one.id === answer.id)
    const text = flat(answer.text, TEXT_MAX).replace(/[.。]+$/, '')
    return ask !== undefined && text.length > 0 ? [{ ask, text }] : []
  })
  const tail = `Продолжи этого же агента (${agentId}) через SendMessage, не запускай нового.`
  const [first] = given
  if (first === undefined) return undefined
  if (given.length === 1) return `Ответ для ${name} (${first.ask.id} «${flat(first.ask.question, 120)}»): ${first.text}. ${tail}`
  return `Ответы для ${name}: ${given.map(one => `${one.ask.id} — ${one.text}`).join('; ')}. ${tail}`
}
