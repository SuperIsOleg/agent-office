import type { Snapshot } from '../../hooks/snapshot'
import { barHtml, logHtml } from './hud-text'

export function renderHud(root: HTMLElement, snapshot: Snapshot): void {
  const bar = root.querySelector('.bar-row')
  const log = root.querySelector('.log')
  if (bar !== null) bar.innerHTML = barHtml(snapshot.hud)
  if (log !== null) log.innerHTML = logHtml(snapshot.events)
}
