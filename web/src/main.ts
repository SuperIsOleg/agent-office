import { ROOM_H, ROOM_W, dayPart } from '../../hooks/art'
import { isNewer, isReadable } from '../../hooks/snapshot'
import type { Snapshot } from '../../hooks/snapshot'
import { AgentCard, personIn, sectionFor } from './card'
import type { CardAction } from './card'
import { startDemo } from './demo'
import { drawFrame, isOpaqueAt } from './draw'
import { renderHud } from './hud'
import { nextOpen, openList, tabTitle } from './hud-text'
import type { Counter } from './hud-text'
import { drawLabels } from './labels'
import { stepPeople, syncPeople } from './people'
import type { Shown } from './people'
import { hitsAt } from './pick'
import { isAtDoor } from './props'
import { roomPieces, roomRaster } from './room'

const params = new URLSearchParams(location.search)
const token = params.get('token') ?? ''
const isDemo = params.get('demo') === '1'
const isDebug = params.get('debug') === '1'
const shift = Math.max(0, Number(params.get('at') ?? 0) || 0)
const clock = () => Date.now() + shift
let frames = 0

const canvas = document.querySelector('canvas')
const context = canvas?.getContext('2d') ?? null
const hud = document.querySelector<HTMLElement>('.hud')
const status = document.querySelector<HTMLElement>('.status')
const cardRoot = document.querySelector<HTMLElement>('.card')
const label = document.querySelector<HTMLButtonElement>('.session-label')
const opened = params.get('card') ?? ''
let requests = 0

const people = new Map<string, Shown>()
const pieces = roomPieces()
const door = { openness: 0 }
let snapshot: Snapshot | undefined
let room: HTMLCanvasElement | undefined
let roomKey = ''
let scale = 1
let last = performance.now()

function fit(): void {
  if (canvas === null) return
  const ratio = window.devicePixelRatio || 1
  const room = document.querySelector<HTMLElement>('.room')
  const width = (room?.clientWidth ?? window.innerWidth) * ratio
  const height = Math.max(240, window.innerHeight - (hud?.offsetHeight ?? 0) - 24) * ratio
  scale = Math.max(1, Math.floor(Math.min(width / ROOM_W, height / ROOM_H) * 2) / 2)
  canvas.width = Math.round(ROOM_W * scale)
  canvas.height = Math.round(ROOM_H * scale)
  canvas.style.width = `${canvas.width / ratio}px`
  canvas.style.height = `${canvas.height / ratio}px`
}

function apply(next: Snapshot): void {
  if (!isReadable(next)) {
    document.body.dataset['stale'] = '1'
    if (status !== null) status.textContent = 'The office was updated: reload this page, or run /office again.'
    return
  }
  delete document.body.dataset['stale']
  if (!isNewer(snapshot, next)) return
  snapshot = next
  syncPeople(people, [next.boss, ...next.people], performance.now())
  if (hud !== null) renderHud(hud, next)
  if (status !== null) status.textContent = isDemo ? 'demo session' : 'live'
  card?.update(next)
  sessionAcked(next)
  showSession(next)
  if (opened && card?.selected() === undefined && personIn(next, opened) !== undefined) openCard(opened)
}

function requestId(): string {
  requests += 1
  return `r${Date.now().toString(36)}-${requests}`
}

async function post(action: CardAction): Promise<string> {
  if (isDemo) {
    card?.showAck('Демо: в живом офисе это ушло бы в Claude', true)
    return ''
  }
  const request = requestId()
  const reply = await fetch(`action?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-office-token': token },
    body: JSON.stringify({ request, ...action }),
  })
  if (reply.status !== 202) throw new Error(`сервер ответил ${reply.status}`)
  return request
}

const card = cardRoot !== null ? new AgentCard(cardRoot, post, () => closeCard()) : undefined

function openCard(id: string): void {
  card?.open(id, snapshot, sectionFor(personIn(snapshot, id)))
}

function closeCard(): void {
  card?.close()
}

function artPoint(event: MouseEvent): [number, number] | undefined {
  if (canvas === null) return undefined
  const box = canvas.getBoundingClientRect()
  return [((event.clientX - box.left) / box.width) * ROOM_W, ((event.clientY - box.top) / box.height) * ROOM_H]
}

function pickAt(event: MouseEvent): string | undefined {
  const point = artPoint(event)
  if (point === undefined) return undefined
  const now = clock()
  const hits = hitsAt(people, now, point[0], point[1])
  for (const hit of hits) {
    const shown = people.get(hit.id)
    if (shown !== undefined && isOpaqueAt(shown, now, scale, point[0], point[1]) !== false) return hit.id
  }
  return undefined
}

function openNext(counter: Counter): void {
  if (snapshot === undefined) return
  const id = nextOpen(openList(snapshot, counter), card?.selected())
  if (id !== undefined) openCard(id)
}

canvas?.addEventListener('click', event => {
  const id = pickAt(event)
  if (id !== undefined) openCard(id)
  else closeCard()
})
canvas?.addEventListener('mousemove', event => {
  if (canvas !== null) canvas.style.cursor = pickAt(event) !== undefined ? 'pointer' : ''
})
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeCard()
})
hud?.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-open]') : null
  const counter = target?.dataset['open']
  if (counter === 'approvals' || counter === 'flagged') openNext(counter)
})

function showSession(next: Snapshot): void {
  document.title = tabTitle(next.session)
  if (label === null) return
  const session = next.session
  label.hidden = session === undefined
  if (session === undefined) return
  const main = label.querySelector('.main')
  const sub = label.querySelector('.sub')
  if (main !== null) main.textContent = session.main
  if (sub !== null) sub.textContent = session.sub
  label.disabled = session.link === undefined
  label.title = session.link !== undefined ? 'Открыть сессию в Claude' : `Сессию не открыть: ${session.why ?? 'нет ссылки'}`
}

label?.addEventListener('click', () => {
  if (snapshot?.session?.link !== undefined) openSession()
})

function openSession(): void {
  const link = snapshot?.session?.link ?? ''
  const fallback = () => {
    if (/^claude:\/\/claude\.ai\/[A-Za-z0-9._~/-]+$/.test(link)) location.href = link
  }
  if (isDemo) {
    card?.showAck('Демо: в живом офисе это открыло бы сессию в Claude', true)
    return
  }
  post({ action: 'session', agent: 'coordinator' })
    .then(request => (sessionAsk = { request, fallback }))
    .catch(fallback)
}

let sessionAsk: { request: string; fallback: () => void } | undefined

function sessionAcked(next: Snapshot): void {
  const ack = sessionAsk !== undefined ? next.acks.find(one => one.request === sessionAsk?.request) : undefined
  if (ack === undefined || sessionAsk === undefined) return
  const { fallback } = sessionAsk
  sessionAsk = undefined
  if (!ack.ok) fallback()
}

function loop(time: number): void {
  const dt = Math.min(1000, Math.max(0, time - last))
  last = time
  const now = clock()
  const key = `${dayPart(now)}|${scale}`
  if (key !== roomKey) {
    roomKey = key
    void roomRaster(now, scale).then(canvas => {
      if (roomKey === key) room = canvas
    })
  }
  stepPeople(people, dt, snapshot?.stepMs ?? 500)
  door.openness += ((isAtDoor(people) ? 1 : 0) - door.openness) * Math.min(1, dt / 120)
  if (context !== null) {
    const selected = card?.selected()
    drawFrame({ context, scale, now, people, pieces, door, ...(selected !== undefined ? { selected } : {}) }, room)
    drawLabels(context, people, scale, time, dt, selected)
  }
  frames += 1
  if (isDebug) document.body.dataset['debug'] = `frames ${frames} · ${[...people.values()].map(one => `${one.id}:${one.fade.toFixed(2)}:${one.isWalking ? 'w' : 'r'}:${one.queue.length}:${one.x.toFixed(1)},${one.y.toFixed(1)}`).join(' ')}`
  requestAnimationFrame(loop)
}

function connect(): void {
  if (isDemo) {
    const demo = startDemo(apply, Date.now())
    for (let t = 0; t <= shift; t += 500) {
      demo.tick(Date.now() + t)
      for (let k = 1; k <= 20; k += 1) stepPeople(people, 25, snapshot?.stepMs ?? 500)
    }
    door.openness = isAtDoor(people) ? 1 : 0
    setInterval(() => demo.tick(clock()), 500)
    return
  }
  const events = new EventSource(`events?token=${encodeURIComponent(token)}`)
  events.onmessage = message => {
    try {
      apply(JSON.parse(message.data) as Snapshot)
    } catch {
      return
    }
  }
  events.onerror = () => {
    if (status !== null) status.textContent = 'reconnecting…'
  }
}

fit()
window.addEventListener('resize', fit)
connect()
requestAnimationFrame(loop)
