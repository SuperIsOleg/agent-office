export type OfficeStatus = 'working' | 'thinking' | 'decision' | 'blocked' | 'failed' | 'done' | 'stopped' | 'gone'

export type OfficeGoal = 'desk' | 'board' | 'coffee' | 'lounge' | 'door'

export type OfficeExit = 'done' | 'failed' | 'stopped' | 'timeout' | 'session'

export type OfficeTile = { x: number; y: number }

export type OfficeActKind = 'code' | 'bash' | 'read' | 'web' | 'sim' | 'skill' | 'talk' | 'plan' | 'other'

export type OfficeRunState = 'running' | 'ok' | 'error'

export type OfficeRun = { at: number; text: string; state: OfficeRunState; tool: string }

export type OfficeTokens = { input: number; output: number; cacheRead: number; cacheWrite: number }

export type OfficeAsk = { id: string; question: string; options: string[]; recommended?: string; why?: string; multi?: boolean }

export type OfficeNoteKind = 'failed' | 'not_verified' | 'noticed' | 'denied'

export type OfficeNote = { kind: OfficeNoteKind; text: string; at: number }

export type OfficeReply = { text: string; at: number }

export type OfficeLiveAsk = { id: string; at: number; sent?: OfficeReply }

export type OfficeBossReply = { from: 'office' | 'claude'; text: string; at: number }

export type OfficeAck = { request: string; ok: boolean; text: string; at: number }

export type OfficeSaidState = 'queued' | 'sent' | 'delivered' | 'answered' | 'refused'

export type OfficeSaid = { request: string; to: string; text: string; key: string; at: number; state: OfficeSaidState; why?: string; turnId?: string }

export type OfficeLinkStatus = 'unknown' | 'ok' | 'none'

export type OfficeLink = { status: OfficeLinkStatus; url: string; detail: string; title?: string; branch?: string; folder?: string; at?: number }

export type OfficeAgent = {
  type: string
  role: string
  name?: string
  parent?: string
  model: string
  effort?: string
  route?: string
  description: string
  brief: string
  status: OfficeStatus
  activity: string
  act: OfficeActKind
  summary: string
  seq: number
  startedAt: number
  lastToolAt: number
  statusAt: number
  endedAt: number
  toolCount: number
  runs: OfficeRun[]
  tokens: OfficeTokens
  cost: number
  desk: number
  pos: OfficeTile
  from: OfficeTile
  movedAt: number
  path: OfficeTile[]
  goal: OfficeGoal
  spot: number
  planUntil: number
  background: boolean
  ordinal: number
  exit?: OfficeExit
  restUntil: number
  waits?: number
  asks?: OfficeAsk[]
  live?: OfficeTokens
  answer?: OfficeReply
  answered?: OfficeReply
  notes?: OfficeNote[]
}

export type OfficeCoordinatorStatus = 'working' | 'thinking' | 'asking' | 'done' | 'idle'

export type OfficeTurn = {
  at: number
  text: string
  endedAt: number
  state: OfficeRunState
  tools: OfficeRun[]
  tokens: OfficeTokens
  cost: number
}

export type OfficeCoordinator = {
  status: OfficeCoordinatorStatus
  activity: string
  act: OfficeActKind
  model: string
  effort?: string
  toolCount: number
  runs: OfficeRun[]
  tokens: OfficeTokens
  cost: number
  lastAt: number
  statusAt: number
  turns: number
  flagged: number
  turnLog: OfficeTurn[]
  isLead: boolean
  hasEntered: boolean
  pos: OfficeTile
  from: OfficeTile
  path: OfficeTile[]
  movedAt: number
  goal: 'desk' | 'coffee'
  spot: number
  waits?: number
  asks?: OfficeAsk[]
  live?: OfficeLiveAsk
  answered?: OfficeBossReply
}

export type OfficeEventTone = 'info' | 'ok' | 'warn' | 'bad'

export type OfficeEvent = { at: number; who: string; color: string; text: string; tone: OfficeEventTone }

export type OfficeServerStatus = 'off' | 'starting' | 'running' | 'failed'

export type OfficeServer = { status: OfficeServerStatus; url: string; detail: string }

declare module 'claude-code' {
  interface PluginState {
    'agent-office': {
      agents: Record<string, OfficeAgent>
      coordinator: OfficeCoordinator
      events: OfficeEvent[]
      startedAt: number
      beat: number
      autoOpened: boolean
      reserved: Record<string, number>
      server: OfficeServer
      acks: OfficeAck[]
      said: OfficeSaid[]
      link: OfficeLink
    }
  }
}
