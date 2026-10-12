import type { OfficeActKind, OfficeStatus, OfficeTokens } from '../types'

export type Family = 'suit' | 'hoodie' | 'smart' | 'creative' | 'street' | 'accountant' | 'work'

export type Outfit = { family: Family; main: string; accent: string; second: string; pants: string; shoes: string }

export type Wear = 'glasses' | 'headphones' | 'hardhat' | 'none'

export type Prop = 'briefcase' | 'blueprint' | 'phone' | 'tablet' | 'envelope' | 'none'

export type Icon = 'wrench' | 'doc' | 'bug' | 'magnifier' | 'chart' | 'branch' | 'envelope' | 'none'

export type Looks = { skin: number; hair: number; hairColor: number; beard?: true }

export type Role = {
  looks?: Looks
  title: string
  label: string
  accent: string
  outfit: Outfit
  wear: Wear
  prop: Prop
  icon: Icon
  isTeam: boolean
}

const TEAM_ROLES: Readonly<Record<string, Omit<Role, 'isTeam'>>> = {
  'ios-engineer': {
    looks: { skin: 1, hair: 3, hairColor: 1 },
    title: 'iOS engineer',
    label: 'iOS-инженер',
    accent: '#5d8fe0',
    outfit: { family: 'hoodie', main: '#2a2d35', accent: '#c9ced8', second: '#ffffff', pants: '#2f3646', shoes: '#e9ebee' },
    wear: 'headphones',
    prop: 'none',
    icon: 'wrench',
  },
  architect: {
    looks: { skin: 0, hair: 1, hairColor: 0 },
    title: 'Architect',
    label: 'Архитектор',
    accent: '#a07be0',
    outfit: { family: 'smart', main: '#33363f', accent: '#4d515d', second: '#ffffff', pants: '#3a3d47', shoes: '#3b2a1e' },
    wear: 'none',
    prop: 'blueprint',
    icon: 'doc',
  },
  'qa-tester': {
    looks: { skin: 2, hair: 4, hairColor: 0 },
    title: 'QA tester',
    label: 'Тестировщик',
    accent: '#5ccf8c',
    outfit: { family: 'street', main: '#1c1d22', accent: '#4a4d57', second: '#2a2c33', pants: '#24272e', shoes: '#ececec' },
    wear: 'none',
    prop: 'phone',
    icon: 'bug',
  },
  reviewer: {
    looks: { skin: 0, hair: 0, hairColor: 0, beard: true },
    title: 'Reviewer',
    label: 'Ревьюер',
    accent: '#f08c4a',
    outfit: { family: 'suit', main: '#2b2e36', accent: '#7a2a30', second: '#e9ebee', pants: '#24262d', shoes: '#15131a' },
    wear: 'glasses',
    prop: 'none',
    icon: 'magnifier',
  },
  analytics: {
    looks: { skin: 4, hair: 2, hairColor: 3 },
    title: 'Analytics',
    label: 'Аналитик',
    accent: '#ef6fa8',
    outfit: { family: 'creative', main: '#202127', accent: '#3a3c45', second: '#ffffff', pants: '#2b2c33', shoes: '#2a2730' },
    wear: 'none',
    prop: 'tablet',
    icon: 'chart',
  },
  'wt-keeper': {
    looks: { skin: 3, hair: 0, hairColor: 0 },
    title: 'Worktree keeper',
    label: 'Worktree',
    accent: '#e0b84a',
    outfit: { family: 'work', main: '#2f3440', accent: '#f39722', second: '#f1f1f1', pants: '#3a3a36', shoes: '#3b2a1a' },
    wear: 'hardhat',
    prop: 'none',
    icon: 'branch',
  },
  publisher: {
    looks: { skin: 5, hair: 5, hairColor: 2 },
    title: 'Publisher',
    label: 'Публикатор',
    accent: '#4fd0d6',
    outfit: { family: 'smart', main: '#9cc9ea', accent: '#7fb0d6', second: '#ffffff', pants: '#2a2f3c', shoes: '#3b2a1e' },
    wear: 'none',
    prop: 'envelope',
    icon: 'envelope',
  },
}

export const HELPER_ROLE: Role = {
  title: 'Helper',
  label: 'Помощник',
  accent: '#9aa6bb',
  outfit: { family: 'smart', main: '#6b8f4e', accent: '#d8e6c8', second: '#ffffff', pants: '#3b3f4a', shoes: '#2a2730' },
  wear: 'none',
  prop: 'none',
  icon: 'magnifier',
  isTeam: false,
}

const BUILT_IN_ROLES: Readonly<Record<string, Pick<Role, 'title' | 'label' | 'icon'> & Partial<Pick<Role, 'prop' | 'wear'>>>> = {
  Explore: { title: 'Explorer', label: 'Поиск по коду', icon: 'magnifier' },
  Plan: { title: 'Planner', label: 'Планировщик', icon: 'doc', prop: 'blueprint' },
  'general-purpose': { title: 'Helper', label: 'Помощник', icon: 'doc' },
  'claude-code-guide': { title: 'Claude Code guide', label: 'Справка по Claude Code', icon: 'doc', wear: 'glasses' },
  'statusline-setup': { title: 'Status line setup', label: 'Настройка строки статуса', icon: 'wrench' },
}

export const COORDINATOR_ROLE: Role = {
  looks: { skin: 0, hair: 0, hairColor: 1 },
  title: 'Coordinator',
  label: 'Координатор',
  accent: '#e05a4f',
  outfit: { family: 'suit', main: '#1e2027', accent: '#c8323a', second: '#ffffff', pants: '#1a1c22', shoes: '#111014' },
  wear: 'none',
  prop: 'briefcase',
  icon: 'none',
  isTeam: true,
}

const HELPER_OUTFITS: readonly Outfit[] = [
  { family: 'suit', main: '#2b2d33', accent: '#3f6fb5', second: '#f4efe4', pants: '#22242a', shoes: '#15131a' },
  { family: 'hoodie', main: '#1f2024', accent: '#b9bec8', second: '#ffffff', pants: '#2f3a52', shoes: '#e9ebee' },
  { family: 'smart', main: '#283246', accent: '#3a4660', second: '#ffffff', pants: '#2b2f3a', shoes: '#2a2730' },
  { family: 'creative', main: '#1f3b3d', accent: '#2e5557', second: '#ffffff', pants: '#2b2d3a', shoes: '#2a2730' },
  { family: 'street', main: '#18191d', accent: '#3d3f47', second: '#26272c', pants: '#3a4150', shoes: '#ececec' },
  { family: 'accountant', main: '#e9e6dc', accent: '#3a3d46', second: '#7a2a30', pants: '#2e3138', shoes: '#15131a' },
  { family: 'suit', main: '#3a3d45', accent: '#2a2c33', second: '#e9ebee', pants: '#2a2c32', shoes: '#15131a' },
  { family: 'hoodie', main: '#3b3e46', accent: '#d0d4dc', second: '#ffffff', pants: '#22262e', shoes: '#ececec' },
]

export function outfitOf(role: Role, id: string, hash: number): Outfit {
  if (role.isTeam || id === 'coordinator') return role.outfit
  return HELPER_OUTFITS[hash % HELPER_OUTFITS.length] ?? role.outfit
}

export function roleOf(subagentType: string): Role {
  const cut = subagentType.lastIndexOf(':')
  const plugin = cut >= 0 ? subagentType.slice(0, cut) : ''
  const name = cut >= 0 ? subagentType.slice(cut + 1) : subagentType
  const known = plugin === 'ios-team' ? TEAM_ROLES[name] : undefined
  if (known) return { ...known, isTeam: true }
  const builtIn = plugin === '' ? BUILT_IN_ROLES[name] : undefined
  return builtIn ? { ...HELPER_ROLE, ...builtIn } : HELPER_ROLE
}

export function kebab(text: string): string {
  return text
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

export function typeSlug(subagentType: string): string {
  const cut = subagentType.lastIndexOf(':')
  const name = cut >= 0 ? subagentType.slice(cut + 1) : subagentType
  return clip(kebab(name), 22) || 'helper'
}

export function agentSlug(subagentType: string, name?: string): string {
  const own = name?.trim()
  if (own && (subagentType === 'teammate' || subagentType === 'fork' || subagentType === '')) return clip(kebab(own), 22) || 'helper'
  return typeSlug(subagentType)
}

export function personName(subagentType: string, name: string | undefined, ordinal: number): string {
  return `${agentSlug(subagentType, name)}${ordinal > 1 ? `-${ordinal}` : ''}`
}

export function bossName(isLead: boolean): string {
  return isLead ? 'coordinator' : 'claude'
}

export function modelBadge(model: string | undefined): string {
  const lower = (model ?? '').toLowerCase()
  if (lower.includes('haiku')) return 'Haiku'
  if (lower.includes('sonnet')) return 'Sonnet'
  if (lower.includes('opus')) return 'Opus'
  if (lower.includes('fable')) return 'Fable'
  return model ? clip(model, 10) : ''
}


const PRICES: Readonly<Record<string, readonly [number, number]>> = {
  Haiku: [1, 5],
  Sonnet: [2, 10],
  Opus: [4, 20],
  Fable: [10, 50],
}

export function costOf(tokens: OfficeTokens, badge: string): number {
  const [input, output] = PRICES[badge] ?? PRICES['Sonnet'] ?? [2, 10]
  const dollars =
    tokens.input * input +
    tokens.cacheWrite * input * 1.25 +
    tokens.cacheRead * input * 0.1 +
    tokens.output * output
  return dollars / 1_000_000
}

export const EMPTY_TOKENS: OfficeTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

export function addTokens(a: OfficeTokens, usage: Partial<Record<string, unknown>> | undefined): OfficeTokens {
  if (usage === undefined) return a
  const num = (key: string): number => {
    const value = usage[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }
  return {
    input: a.input + num('input_tokens'),
    output: a.output + num('output_tokens'),
    cacheRead: a.cacheRead + num('cache_read_input_tokens'),
    cacheWrite: a.cacheWrite + num('cache_creation_input_tokens'),
  }
}

export type AnyStatus = OfficeStatus | 'asking' | 'idle'

export const STATUS_WORD: Readonly<Record<AnyStatus | 'walking', string>> = {
  working: 'working',
  thinking: 'thinking',
  decision: 'waiting for a decision',
  blocked: 'blocked',
  failed: 'failed',
  done: 'done',
  stopped: 'stopped',
  gone: 'left',
  asking: 'waiting for you',
  idle: 'idle',
  walking: 'walking',
}

export type Chip = 'Idle' | 'Working' | 'Waiting' | 'Failed'

export function chipOf(status: AnyStatus): Chip {
  if (status === 'working' || status === 'thinking') return 'Working'
  if (status === 'decision' || status === 'blocked' || status === 'asking') return 'Waiting'
  if (status === 'failed') return 'Failed'
  return 'Idle'
}

export const CHIP_DOT: Readonly<Record<Chip, string>> = { Idle: '#9aa1ad', Working: '#34c76f', Waiting: '#f5b82e', Failed: '#ec4f4f' }

export function dotOf(status: AnyStatus): string {
  return CHIP_DOT[chipOf(status)]
}

const EFFORT_WORD: Readonly<Record<string, string>> = { low: 'быстро', medium: 'обычно', high: 'глубоко', xhigh: 'очень глубоко', max: 'максимум' }

export function effortOf(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return String(Math.round(value))
  if (typeof value !== 'string') return ''
  const level = value.trim().toLowerCase()
  return EFFORT_WORD[level] !== undefined ? level : ''
}

export function effortLabel(effort: string | undefined): string {
  if (effort === undefined || effort === '') return ''
  const word = EFFORT_WORD[effort]
  return word !== undefined ? `${effort} (${word})` : `${effort} tokens`
}

export function effortFromDefinition(text: string): string {
  const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''
  const line = /^effort:\s*["']?([A-Za-z0-9]+)["']?\s*$/m.exec(head)?.[1]
  return effortOf(line === undefined ? undefined : /^\d+$/.test(line) ? Number(line) : line)
}

export const ROUTE_MAX = 120

export function routeOf(prompt: string): string {
  const line = prompt
    .split(/\r?\n/)
    .slice(0, 5)
    .find(one => /^\s*route:/i.test(one))
  if (line === undefined) return ''
  const rest = line.replace(/^\s*route:\s*/i, '')
  const cut = /\s+[—–-]\s+/.exec(rest)
  return clip(cut !== null ? rest.slice(cut.index + cut[0].length) : rest, ROUTE_MAX)
}

export function clip(text: string, max: number): string {
  const flat = text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  return chars.length <= max ? flat : chars.slice(0, Math.max(1, max - 1)).join('').trimEnd() + '…'
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const SECRET = /secret|\.xcconfig\b|\.p8\b|\.p12\b|\.mobileprovision\b|(^|[/\s])\.env\b|token|password|passwd|api[_-]?key|credential/i

function hidden(text: string): boolean {
  return SECRET.test(text)
}

function baseName(path: unknown): string {
  if (typeof path !== 'string' || path.length === 0) return ''
  if (hidden(path)) return '…'
  const parts = path.split('/').filter(part => part.length > 0)
  return parts[parts.length - 1] ?? path
}

function folderName(path: unknown): string {
  if (typeof path !== 'string' || path.length === 0) return ''
  if (hidden(path)) return '…'
  const parts = path
    .replace(/\/+$/, '')
    .split('/')
    .filter(part => part.length > 0 && part !== '.')
  const last = parts[parts.length - 1] ?? ''
  return /\.[A-Za-z0-9]{1,8}$/.test(last) ? (parts[parts.length - 2] ?? '') : last
}

function quoted(pattern: string): string {
  if (pattern.length === 0) return ''
  if (hidden(pattern)) return '«…»'
  const flat = pattern.replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  return `"${chars.length > 30 ? `${chars.slice(0, 29).join('')}…` : flat}"`
}

function wordsOf(segment: string): string[] {
  const out: string[] = []
  for (const match of segment.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g)) out.push(match[1] ?? match[2] ?? match[3] ?? '')
  return out.filter(word => !/^[A-Z_][A-Z0-9_]*=/.test(word))
}

const NOISE = /^(cd|echo|printf|true|export|set|sleep|wc|head|tail|sort|uniq|tee)\b/

function meaningful(command: string): string[] {
  const segments = command
    .split(/&&|;|\|\||\|/)
    .map(part => part.trim())
    .filter(part => part.length > 0)
  const picked = segments.find(part => !NOISE.test(part)) ?? segments.find(part => /^(head|tail)\s+\S/.test(part)) ?? segments[0] ?? command
  return wordsOf(picked)
}

function describeShell(command: string): Activity {
  const list = meaningful(command)
  const program = (list[0] ?? '').split('/').pop() ?? ''
  const rest = list.slice(1).filter(word => !word.startsWith('-'))
  const sub = list[1] ?? ''
  const last = rest[rest.length - 1]
  const say = (text: string, act: OfficeActKind = 'bash'): Activity => ({ text, act })
  if (/^(grep|rg|ag|ack|egrep|fgrep)$/.test(program)) {
    const pattern = rest[0] ?? ''
    const where = rest.length > 1 ? folderName(last) : ''
    return say(`Ищет ${quoted(pattern)}${where ? ` в ${where}` : ''}`.trim(), 'read')
  }
  if (/^(cat|head|tail|less|more|bat|nl)$/.test(program) || (program === 'sed' && list.includes('-n'))) {
    const file = baseName(last)
    return say(file ? `Читает ${file}` : 'Читает файл', 'read')
  }
  if (program === 'sed' || program === 'perl' || program === 'awk') return say(baseName(last) ? `Правит ${baseName(last)}` : 'Правит текст', 'code')
  if (/^(ls|find|tree|fd|du|stat)$/.test(program)) {
    const where = folderName(rest[0] ?? '')
    return say(where ? `Смотрит файлы в ${where}` : 'Смотрит файлы', 'read')
  }
  if (program === 'xcodebuild' || /gate\.sh$/.test(list[0] ?? '') || (program === 'swift' && sub === 'test') || (/^(make|npm|yarn|pnpm|npx)$/.test(program) && /test/.test(command))) return say('Собирает и гоняет тесты')
  if (program === 'swift' && sub === 'build') return say('Собирает проект')
  if (program === 'swiftlint' || /swiftlint\.sh$/.test(list[0] ?? '')) return say('Проверяет стиль кода')
  if (program === 'tuist') return say('Генерирует проект Xcode')
  if (program === 'git') {
    if (sub === 'commit') return say('Коммитит')
    if (sub === 'push') return say('Пушит ветку')
    if (sub === 'worktree') return say('Готовит worktree')
    if (/^(checkout|switch|branch)$/.test(sub)) return say('Переключает ветку')
    if (/^(merge|rebase|pull|fetch)$/.test(sub)) return say('Подтягивает изменения из git')
    return say('Смотрит изменения в git', 'read')
  }
  if (program === 'gh') {
    const number = list.find(word => /^#?\d+$/.test(word))?.replace('#', '')
    if (sub === 'pr' && /^(view|diff|checks)$/.test(list[2] ?? '')) return say(number ? `Читает PR #${number}` : 'Читает PR', 'read')
    if (sub === 'pr' && list[2] === 'create') return say('Открывает PR', 'talk')
    if (sub === 'run') return say('Смотрит CI', 'read')
    return say('Работает с GitHub')
  }
  if (program === 'simctl' || (program === 'xcrun' && sub === 'simctl') || /(ios|sim)\.sh$/.test(list[0] ?? '')) return say('Ставит приложение на симулятор/телефон', 'sim')
  if (/^(curl|wget)$/.test(program)) return say('Ищет в интернете', 'web')
  if (/^(python3?|node|ruby|bash|sh|zsh)$/.test(program)) {
    const script = baseName(rest[0])
    return say(script ? `Запускает ${script}` : `Выполняет команду ${program}`)
  }
  if (/^(mkdir|cp|mv|rm|touch|ln|chmod)$/.test(program)) return say('Раскладывает файлы')
  if (program.length === 0) return say('Выполняет команду')
  return say(`Выполняет команду ${hidden(program) ? '…' : program}`)
}

function str(args: Readonly<Record<string, unknown>>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value : ''
}

export type Activity = { text: string; act: OfficeActKind }

export const ACTIVITY_MAX = 60
export const BUBBLE_MAX = 28

export function describeTool(tool: string, args: Readonly<Record<string, unknown>>): Activity {
  const say = (text: string, act: OfficeActKind): Activity => ({ text: clip(text, ACTIVITY_MAX), act })
  const file = (key: string) => baseName(args[key]) || 'файл'
  if (tool === 'Bash') {
    const shell = describeShell(str(args, 'command'))
    return say(shell.text, shell.act)
  }
  if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') return say(`Правит ${baseName(args['file_path'] ?? args['notebook_path']) || 'файл'}`, 'code')
  if (tool === 'Write') return say(`Создаёт ${file('file_path')}`, 'code')
  if (tool === 'Read') return say(`Читает ${file('file_path')}`, 'read')
  if (tool === 'Grep') {
    const where = folderName(args['path'])
    return say(`Ищет ${quoted(str(args, 'pattern'))}${where ? ` в ${where}` : ''}`, 'read')
  }
  if (tool === 'Glob') {
    const where = folderName(args['path']) || folderName(str(args, 'pattern').split('*')[0])
    return say(where ? `Смотрит файлы в ${where}` : 'Смотрит файлы', 'read')
  }
  if (tool === 'Skill') return say(`Открывает правила: ${str(args, 'skill').split(':').pop() || 'skill'}`, 'skill')
  if (tool === 'Agent' || tool === 'Task') {
    const type = str(args, 'subagent_type')
    return say(`Поручает задачу: ${type ? typeSlug(type) : 'помощнику'}`, 'talk')
  }
  if (tool === 'SendMessage') return say(`Пишет агенту ${str(args, 'to')}`.trim(), 'talk')
  if (tool === 'AskUserQuestion') return say('Задаёт тебе вопрос', 'talk')
  if (tool === 'WebFetch' || tool === 'WebSearch') return say('Ищет в интернете', 'web')
  if (tool === 'TodoWrite' || tool === 'TaskCreate' || tool === 'TaskUpdate') return say('Обновляет план', 'plan')
  if (tool === 'TaskStop') return say('Останавливает агента', 'talk')
  if (tool.startsWith('Task')) return say('Смотрит задачи', 'plan')
  if (tool === 'ToolSearch') return say('Ищет инструменты', 'other')
  if (tool === 'EnterWorktree' || tool === 'ExitWorktree') return say('Переходит в worktree', 'bash')
  if (tool.startsWith('mcp__')) {
    const parts = tool.split('__')
    const server = parts[1] ?? ''
    const name = parts.slice(2).join('__')
    if (server.includes('iOS_Simulator') || server.includes('simulator')) {
      const action = str(args, 'action')
      if (action === 'screenshot') return say('Снимает экран симулятора', 'sim')
      if (action === 'launch' || action === 'attach') return say('Ставит приложение на симулятор/телефон', 'sim')
      return say('Нажимает в симуляторе', 'sim')
    }
    if (server.includes('Browser') || server.includes('chrome')) return say('Ищет в интернете', 'web')
    if (server === 'xcode') return say(/Build|Test/.test(name) ? 'Собирает и гоняет тесты' : 'Работает в Xcode', 'code')
    const key = /\b([A-Z][A-Z0-9]+-\d+)\b/.exec(JSON.stringify(args))?.[1]
    if (/Jira/i.test(name)) return say(key ? `Читает задачу ${key}` : 'Работает с Jira', 'read')
    if (/Confluence/i.test(name)) return say(/create|update/i.test(name) ? 'Пишет страницу Confluence' : 'Читает страницу Confluence', 'read')
    if (/testops/i.test(name) || /testops/i.test(server)) return say('Работает с TestOps', 'read')
    if (/figma/i.test(server)) return say('Смотрит макет в Figma', 'read')
    return say(`Работает с ${name || server}`, 'other')
  }
  return say(`Выполняет ${tool}`, 'other')
}

export function toolName(tool: string): string {
  if (!tool.startsWith('mcp__')) return tool
  const parts = tool.split('__')
  return parts[parts.length - 1] || tool
}

export type Decision = { id: string; question: string; options: string[]; recommended?: string; why?: string }

export type ParsedResult = {
  status?: OfficeStatus
  summary?: string
  question?: string
  decisions?: Decision[]
  notVerified?: string[]
  noticed?: string[]
}

const RESULT_STATUS: Readonly<Record<string, OfficeStatus>> = {
  ok: 'done',
  done: 'done',
  failed: 'failed',
  blocked: 'blocked',
  needs_decision: 'decision',
}

export const DECISIONS_KEPT = 5
export const OPTIONS_KEPT = 6
export const NOTES_KEPT = 5

type Flow = string | Flow[] | { [key: string]: Flow }

class FlowReader {
  index = 0

  constructor(readonly text: string) {}

  private skip(): void {
    while (this.index < this.text.length && /\s/.test(this.text[this.index] ?? '')) this.index += 1
  }

  value(): Flow {
    this.skip()
    const char = this.text[this.index]
    if (char === '{') return this.map()
    if (char === '[') return this.list()
    if (char === '"' || char === "'") return this.quoted(char)
    return this.bare()
  }

  private quoted(quote: string): string {
    this.index += 1
    let out = ''
    while (this.index < this.text.length) {
      const char = this.text[this.index] ?? ''
      if (quote === '"' && char === '\\') {
        out += this.text[this.index + 1] ?? ''
        this.index += 2
        continue
      }
      if (char === quote) {
        if (quote === "'" && this.text[this.index + 1] === "'") {
          out += "'"
          this.index += 2
          continue
        }
        this.index += 1
        return out
      }
      out += char
      this.index += 1
    }
    return out
  }

  private bare(): string {
    let out = ''
    while (this.index < this.text.length && !',}]'.includes(this.text[this.index] ?? '')) {
      out += this.text[this.index]
      this.index += 1
    }
    return out.trim()
  }

  private list(): Flow[] {
    this.index += 1
    const out: Flow[] = []
    for (;;) {
      this.skip()
      const char = this.text[this.index]
      if (char === undefined) return out
      if (char === ']') {
        this.index += 1
        return out
      }
      if (char === ',') {
        this.index += 1
        continue
      }
      const before = this.index
      out.push(this.value())
      if (this.index === before) this.index += 1
    }
  }

  private map(): { [key: string]: Flow } {
    this.index += 1
    const out: { [key: string]: Flow } = {}
    for (;;) {
      this.skip()
      const char = this.text[this.index]
      if (char === undefined) return out
      if (char === '}') {
        this.index += 1
        return out
      }
      if (char === ',') {
        this.index += 1
        continue
      }
      let key = ''
      while (this.index < this.text.length && !':,}'.includes(this.text[this.index] ?? '')) {
        key += this.text[this.index]
        this.index += 1
      }
      if (this.text[this.index] !== ':') continue
      this.index += 1
      out[key.trim().replace(/^["']|["']$/g, '')] = this.value()
    }
  }
}

function flowOf(text: string): Flow {
  return new FlowReader(text.trim()).value()
}

function textOf(value: Flow | undefined, max: number): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return clip(value, max)
  if (Array.isArray(value)) return clip(value.map(one => textOf(one, max)).join(', '), max)
  return ''
}

function listOf(value: Flow | undefined): string[] {
  if (value === undefined) return []
  if (Array.isArray(value)) return value.map(one => textOf(one, 160)).filter(one => one.length > 0)
  const text = textOf(value, 400)
  return text.length > 0 ? text.split(/\s*[,;]\s*/).filter(one => one.length > 0) : []
}

function sectionOf(lines: readonly string[], key: string): { inline: string; items: string[][] } | undefined {
  const start = lines.findIndex(line => new RegExp(`^\\s*${key}:`).test(line))
  if (start < 0) return undefined
  const head = lines[start] ?? ''
  const indent = head.length - head.trimStart().length
  const inline = head.slice(head.indexOf(':') + 1).trim()
  const items: string[][] = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim().length === 0) continue
    const depth = line.length - line.trimStart().length
    const isItem = line.trimStart().startsWith('-')
    if (depth <= indent && !isItem) break
    if (depth < indent) break
    if (isItem) items.push([line.trimStart().slice(1).trim()])
    else items[items.length - 1]?.push(line.trim())
  }
  return { inline, items }
}

function itemMap(parts: readonly string[]): { [key: string]: Flow } {
  const [first = '', ...rest] = parts
  if (first.startsWith('{')) {
    const parsed = flowOf([first, ...rest].join(' '))
    return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  }
  const out: { [key: string]: Flow } = {}
  for (const part of [first, ...rest]) {
    const at = part.indexOf(':')
    if (at <= 0) continue
    out[part.slice(0, at).trim()] = flowOf(part.slice(at + 1))
  }
  return out
}

function decisionOf(map: { [key: string]: Flow }, index: number): Decision | undefined {
  const question = textOf(map['question_ru'] ?? map['question'], 200)
  if (question.length === 0) return undefined
  const marked = /\s*\((?:recommended|рекомендую|рекомендуется)\)\s*/i
  let recommended = textOf(map['recommended'], 80).replace(marked, '')
  const options = listOf(map['options'])
    .slice(0, OPTIONS_KEPT)
    .map(option => {
      if (marked.test(option)) {
        const label = clip(option.replace(marked, ' ').trim(), 80)
        if (recommended.length === 0) recommended = label
        return label
      }
      return clip(option, 80)
    })
  const id = textOf(map['id'], 20).replace(/[^A-Za-z0-9_-]/g, '') || `d${index + 1}`
  const why = textOf(map['why'], 200)
  return { id, question, options, ...(recommended ? { recommended } : {}), ...(why ? { why } : {}) }
}

function decisionsOf(lines: readonly string[]): Decision[] {
  const section = sectionOf(lines, 'needs_decision')
  if (section === undefined) return []
  const maps: { [key: string]: Flow }[] = []
  if (section.inline.startsWith('[')) {
    const parsed = flowOf(section.inline)
    if (Array.isArray(parsed)) for (const one of parsed) if (typeof one === 'object' && !Array.isArray(one)) maps.push(one)
  }
  for (const item of section.items) maps.push(itemMap(item))
  return maps.flatMap((map, index) => {
    const decision = decisionOf(map, index)
    return decision !== undefined ? [decision] : []
  }).slice(0, DECISIONS_KEPT)
}

function notesOf(lines: readonly string[], key: string): string[] {
  const section = sectionOf(lines, key)
  if (section === undefined) return []
  const inline = section.inline.length > 0 && section.inline !== '[]' ? listOf(flowOf(section.inline)) : []
  const items = section.items.map(item => textOf(flowOf(item.join(' ')), 160)).filter(one => one.length > 0)
  return [...inline, ...items].slice(0, NOTES_KEPT)
}

export function parseResult(answer: string): ParsedResult {
  const blocks = [...answer.matchAll(/```result[^\n]*\n([\s\S]*?)(?:```|$)/g)]
  const body = blocks.length > 0 ? blocks[blocks.length - 1]?.[1] ?? '' : ''
  if (body.length === 0) return {}
  const lines = body.split('\n')
  const statusWord = /^\s*status:\s*([a-z_]+)/m.exec(body)?.[1] ?? ''
  const summary = /^\s*summary:\s*(.+)$/m.exec(body)?.[1]?.trim()
  const decisions = decisionsOf(lines)
  const quoted = /question_ru:\s*"((?:[^"\\]|\\.)*)"/.exec(body)?.[1] ?? /question_ru:\s*'([^']*)'/.exec(body)?.[1]
  const bare = decisions[0]?.question ?? quoted ?? /question_ru:\s*([^,}\n]+)/.exec(body)?.[1]?.trim()
  const parsed: ParsedResult = {}
  const status = RESULT_STATUS[statusWord]
  if (status) parsed.status = status
  if (summary) parsed.summary = clip(summary.replace(/^["']|["']$/g, ''), 200)
  if (bare) parsed.question = clip(bare, 200)
  if (decisions.length > 0) parsed.decisions = decisions
  const notVerified = notesOf(lines, 'not_verified')
  const noticed = notesOf(lines, 'noticed')
  if (notVerified.length > 0) parsed.notVerified = notVerified
  if (noticed.length > 0) parsed.noticed = noticed
  return parsed
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}


export function formatCost(dollars: number): string {
  if (dollars > 0 && dollars < 0.01) return '<$0.01'
  return `$${dollars.toFixed(2)}`
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}M`
  if (count >= 1_000) return `${Math.round(count / 1_000)}k`
  return String(count)
}
