import { formatCost, formatTokens } from '../../hooks/roles'
import type { Snapshot } from '../../hooks/snapshot'

const TONE: Readonly<Record<string, string>> = { info: '#c9cfdc', ok: '#7fe0c0', warn: '#ffd36b', bad: '#ff8a80' }

function clock(at: number): string {
  const date = new Date(at)
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(part => String(part).padStart(2, '0')).join(':')
}

function cell(label: string, value: string, color = ''): string {
  return `<div class="cell"><span>${label}</span><b${color ? ` style="color:${color}"` : ''}>${value}</b></div>`
}

function escape(text: string): string {
  return text.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char)
}

function counter(label: string, value: number, color: string, open: string): string {
  const tint = value > 0 ? ` style="color:${color}"` : ''
  return `<button type="button" class="cell link" data-open="${open}" title="Open the next card"><span>${label}</span><b${tint}>${value}</b></button>`
}

export function barHtml(hud: Snapshot['hud']): string {
  return (
    `<div class="tab">Spent <b>≈${formatCost(hud.spent)}</b></div>` +
    cell('Token spend', hud.tokens > 0 ? formatTokens(hud.tokens) : '—') +
    cell('Runs today', String(hud.runs)) +
    counter('Approvals', hud.approvals, '#ffc93c', 'approvals') +
    counter('Flagged', hud.flagged, '#ff5a5a', 'flagged')
  )
}

export function logHtml(events: Snapshot['events']): string {
  const rows = [...events]
    .reverse()
    .map(event => `<li><time>${clock(event.at)}</time><i style="background:${event.color}"></i><b>${escape(event.who)}</b> — <span style="color:${TONE[event.tone] ?? TONE.info}">${escape(event.text)}</span></li>`)
    .join('')
  return rows || '<li class="quiet">Quiet for now: people come in when the session calls them.</li>'
}

export type Counter = 'approvals' | 'flagged'

export function tabTitle(session: Snapshot['session']): string {
  return session?.key ? `Офис · ${session.key}` : 'Офис'
}

export function openList(snapshot: Snapshot, counter: Counter): string[] {
  if (counter === 'approvals') {
    const waiting = snapshot.people.filter(one => one.status === 'decision' || one.status === 'blocked').map(one => one.id)
    return snapshot.boss.status === 'asking' ? [...waiting, snapshot.boss.id] : waiting
  }
  return snapshot.people.filter(one => one.status === 'failed').map(one => one.id)
}

export function nextOpen(list: readonly string[], current: string | undefined): string | undefined {
  if (list.length === 0) return undefined
  const at = current === undefined ? -1 : list.indexOf(current)
  return list[(at + 1) % list.length]
}
