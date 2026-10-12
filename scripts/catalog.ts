import { HW, P, face, n, pt } from '../hooks/iso'
import { KIT, SIDES } from '../hooks/kit'
import type { Side } from '../hooks/kit-wall'
import { avatarSvg, defsFor, looksOf, screenTransform, setArtClock, skyVars, spriteTop } from '../hooks/art'
import type { Figure } from '../hooks/art'
import type { Desk } from '../hooks/layout'
import { COORDINATOR_ROLE, agentSlug, clip, escapeXml, outfitOf, roleOf } from '../hooks/roles'
import { POSES, hashOf } from '../hooks/sprites'
import type { PoseId } from '../hooks/sprites'

let renderNow = 0

function loop(dur: number, offsetMs = 0): string {
  const period = Math.max(1, Math.round(dur * 1000))
  const phase = (((renderNow + offsetMs) % period) + period) % period
  return `begin="-${(phase / 1000).toFixed(2)}s" repeatCount="indefinite"`
}

const MOTION: Readonly<Record<string, (seed: number) => string>> = {
  none: () => '',
  bob: seed => `<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="2.4s" ${loop(2.4, seed * 7)}/>`,
  jump: seed => `<animateTransform attributeName="transform" type="translate" values="0 0;0 -6;0 0;0 0" keyTimes="0;.3;.6;1" dur=".9s" ${loop(0.9, seed)}/>`,
  shake: seed => `<animateTransform attributeName="transform" type="translate" values="0 0;1 0;0 0;-1 0;0 0" dur=".5s" ${loop(0.5, seed)}/>`,
}

function characterSvg(figure: Figure, isBare = false): string {
  const meta = POSES[figure.pose]
  const motion = MOTION[meta.motion]?.(figure.seed) ?? ''
  const body = `<g>${motion}${avatarSvg(figure)}</g>`
  if (isBare) return body
  const [x, y] = figure.anchor
  return `<g class="who" data-agent="${escapeXml(figure.key)}" data-pose="${figure.pose}" transform="translate(${n(x)},${n(y)})"><use href="#shd"${figure.floorDy ? ` y="${figure.floorDy}"` : ''}/>${body}</g>`
}

function iconX(figure: Figure): number {
  const holdsRight = figure.facing === 'back' && (figure.pose === 'phone' || figure.pose === 'tablet')
  return holdsRight !== figure.mirror ? -19 : 9
}

function iconSvg(figure: Figure): string {
  if (figure.icon === 'none') return ''
  const top = spriteTop(figure)
  const x = iconX(figure)
  return `<g data-icon="${figure.icon}" transform="translate(${x},${top + 1})"><animateTransform attributeName="transform" type="translate" values="${x} ${top + 1};${x} ${top - 1};${x} ${top + 1}" dur="1.6s" ${loop(1.6, figure.seed * 3)}/><rect x="-1.5" y="-1.5" width="11" height="11" rx="3" fill="#fff" stroke="#3a3f57" stroke-width="1"/><use href="#i-${figure.icon}" transform="translate(0.5,0.5)"/></g>`
}

type CastRow = { key: string; type: string; work: PoseId }

const CAST: readonly CastRow[] = [
  { key: 'coordinator', type: 'coordinator', work: 'type' },
  { key: 'cast-eng', type: 'ios-team:ios-engineer', work: 'typeFast' },
  { key: 'cast-arch', type: 'ios-team:architect', work: 'read' },
  { key: 'cast-qa', type: 'ios-team:qa-tester', work: 'phone' },
  { key: 'cast-rev', type: 'ios-team:reviewer', work: 'read' },
  { key: 'cast-an', type: 'ios-team:analytics', work: 'tablet' },
  { key: 'cast-wt', type: 'ios-team:wt-keeper', work: 'type' },
  { key: 'cast-pub', type: 'ios-team:publisher', work: 'type' },
  { key: 'helper-a', type: 'Explore', work: 'read' },
  { key: 'helper-c', type: 'general-purpose', work: 'type' },
  { key: 'helper-d', type: 'workflow-subagent', work: 'type' },
  { key: 'helper-b', type: 'Explore', work: 'browse' },
]

export function castSvg(now: number): string {
  setArtClock(now)
  renderNow = now
  const cellW = 40
  const rowH = 54
  const blockW = 84 + cellW * 4
  const half = Math.ceil(CAST.length / 2)
  const width = blockW * 2 + 16
  const height = half * rowH + 30
  let body = ''
  CAST.forEach((row, index) => {
    const isBoss = row.type === 'coordinator'
    const role = isBoss ? COORDINATOR_ROLE : roleOf(row.type)
    const looks = looksOf(row.key, role)
    const outfit = isBoss ? COORDINATOR_ROLE.outfit : outfitOf(role, row.key, hashOf(`${row.key}:outfit`))
    const label = isBoss ? 'coordinator' : agentSlug(row.type)
    const x0 = 8 + Math.floor(index / half) * blockW
    const y0 = 26 + (index % half) * rowH
    const base: Figure = {
      key: row.key,
      role,
      outfit,
      label,
      model: '',
      status: 'working',
      pose: 'stand',
      facing: 'front',
      mirror: false,
      anchor: [0, 0],
      floorDy: 0,
      world: [0, 0],
      depth: 0,
      skin: looks.skin,
      hair: looks.hair,
      hairColor: looks.hairColor,
      beard: looks.beard,
      icon: 'none',
      title: '',
      completed: 0,
      goal: 'cast',
      tile: '0,0',
      seed: looks.seed,
    }
    const states: Figure[] = [
      { ...base, pose: 'stand' },
      { ...base, pose: 'walk', facing: 'back' },
      { ...base, pose: row.work, icon: role.icon },
      { ...base, pose: 'happy' },
    ]
    body += `<text x="${x0}" y="${y0 + 22}" style="font-size:8px;fill:#1f2230">${escapeXml(label)}</text>`
    body += `<text x="${x0}" y="${y0 + 32}" style="font-size:6px;fill:#6b7280;font-weight:normal">${escapeXml(outfit.family)}${role.wear !== 'none' ? ` · ${role.wear}` : ''}${role.prop !== 'none' ? ` · ${role.prop}` : ''}</text>`
    states.forEach((figure, column) => {
      const cx = x0 + 84 + column * cellW + cellW / 2
      const isSeated = POSES[figure.pose].seated
      const cy = y0 + rowH - 6 - (isSeated ? 6 : 0)
      const stool = isSeated ? `<rect x="-7" y="0" width="14" height="3" fill="#2d2f36"/><rect x="-1" y="3" width="2" height="5" fill="#9ca3ad"/>` : ''
      body += `<g transform="translate(${cx},${cy})"><use href="#shd" y="${isSeated ? 8 : 0}"/>${stool}${characterSvg(figure, true)}${iconSvg(figure)}</g>`
    })
  })
  const header = ['idle', 'walking', 'working', 'happy']
    .map((word, column) => [0, 1].map(block => `<text x="${8 + block * blockW + 84 + column * cellW + cellW / 2}" y="16" text-anchor="middle" style="font-size:6.5px;fill:#6b7280">${word}</text>`).join(''))
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * 3}" height="${height * 3}" shape-rendering="crispEdges">${defsFor(header + body)}<rect width="${width}" height="${height}" fill="#eef0f3"/>${header}${body}</svg>`
}

function wallSwatch(id: string, width: number, height: number, side: Side, scale: number): string {
  const span = Math.max(1.4, width / HW + 0.8)
  const top = Math.max(66, height + 22)
  const plane = side === 'r' ? face([P(-span / 2, 0, -2), P(span / 2, 0, -2), P(span / 2, 0, top), P(-span / 2, 0, top)], 'wa') : face([P(0, span / 2, -2), P(0, -span / 2, -2), P(0, -span / 2, top), P(0, span / 2, top)], 'wb')
  const [a, b] = side === 'r' ? P(-width / HW / 2, 0, top - 10) : P(0, width / HW / 2, top - 10)
  const sprite = KIT[id]
  const hands = sprite?.kind === 'wall' && sprite.item.hands !== undefined ? `<use href="#k-${id}-hands-${side}" x="${n(a)}" y="${n(b)}"/>` : ''
  return `<g transform="scale(${scale})">${plane}<use href="#k-${id}-${side}" x="${n(a)}" y="${n(b)}"/>${hands}</g>`
}

export function kitZoomSvg(now: number): string {
  renderNow = now
  setArtClock(now)
  const cellW = 300
  const cellH = 330
  const columns = 4
  const items = Object.entries(KIT).filter(([, sprite]) => sprite.kind === 'wall')
  const cells = items.flatMap(([id, sprite]) => (sprite.kind === 'wall' ? SIDES.map(side => ({ id, label: `${sprite.label} · ${side === 'r' ? 'right' : 'left'} wall`, svg: wallSwatch(id, sprite.width, sprite.height, side, 3) })) : []))
  const rows = Math.ceil(cells.length / columns)
  const width = columns * cellW + 16
  const height = rows * cellH + 34
  let body = `<text x="8" y="20" style="font-size:12px;fill:#1f2230">agent-office wall items · 3× · right and left wall</text>`
  cells.forEach((cell, index) => {
    const cx = 8 + (index % columns) * cellW + cellW / 2
    const cy = 30 + Math.floor(index / columns) * cellH
    body += `<rect x="${cx - cellW / 2 + 3}" y="${cy}" width="${cellW - 6}" height="${cellH - 8}" rx="6" fill="#f7f8fa" stroke="#e1e4ea"/>`
    body += `<g data-zoom="${escapeXml(cell.id)}-${index % 2 === 0 ? 'r' : 'l'}" transform="translate(${cx},${cy + 286})">${cell.svg}</g>`
    body += `<text x="${cx}" y="${cy + cellH - 18}" text-anchor="middle" style="font-size:9px;fill:#1f2230">${escapeXml(cell.label)}</text>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" shape-rendering="crispEdges" style="${skyVars(now)}">${defsFor(body)}<rect width="${width}" height="${height}" fill="#eef0f3"/>${body}</svg>`
}

export function kitSvg(now: number): string {
  renderNow = now
  setArtClock(now)
  const cellW = 84
  const cellH = 120
  const columns = 8
  const screens = ['off', 'code', 'term', 'web', 'chart', 'photo'] as const
  const tile = `<polygon points="${pt(0, 0, 0)} ${pt(1, 0, 0)} ${pt(1, 1, 0)} ${pt(0, 1, 0)}" style="fill:#dfe5ec;stroke:#c3cdd8"/>`
  const entries: { id: string; label: string; svg: string }[] = []
  for (const [id, sprite] of Object.entries(KIT)) {
    if (sprite.kind === 'wall') {
      for (const side of SIDES) entries.push({ id: `${id}-${side}`, label: `${sprite.label} · ${side === 'r' ? 'right' : 'left'} wall`, svg: wallSwatch(id, sprite.width, sprite.height, side, 1) })
      continue
    }
    const isWallPiece = sprite.kind === 'floor' && sprite.ground === true && sprite.bias < 0
    const span = sprite.kind === 'floor' ? Math.max(1, sprite.w, sprite.d) : 1
    const scale = isWallPiece ? 0.7 : 1 / span
    entries.push({ id, label: sprite.label, svg: `${tile}<g transform="scale(${Math.round(scale * 100) / 100})"><use href="#k-${id}"/></g>` })
  }
  for (const kind of screens) {
    const desk: Desk = { desk: { x: 0, y: 0 }, seat: { x: 0, y: 1 }, facing: 'back', screen: kind === 'photo' ? 'imac' : 'monitor' }
    const base = `<use href="#k-desk-back"/><use href="#k-${desk.screen === 'imac' ? 'imac' : 'monitor'}"/>`
    entries.push({ id: `screen-${kind}`, label: `screen: ${kind}`, svg: `${tile}${base}<use href="#sc-${kind}" transform="${screenTransform(desk)}"/>` })
  }
  const rows = Math.ceil(entries.length / columns)
  const width = columns * cellW + 16
  const height = rows * cellH + 30
  let cells = ''
  let sprites = ''
  let labels = ''
  entries.forEach((entry, index) => {
    const cx = 8 + (index % columns) * cellW + cellW / 2
    const cy = 26 + Math.floor(index / columns) * cellH
    cells += `<rect x="${cx - cellW / 2 + 2}" y="${cy}" width="${cellW - 4}" height="${cellH - 6}" rx="4" fill="#f7f8fa" stroke="#e1e4ea"/>`
    sprites += `<g data-kit="${escapeXml(entry.id)}" transform="translate(${cx},${cy + 82})">${entry.svg}</g>`
    labels += `<rect x="${cx - cellW / 2 + 4}" y="${cy + cellH - 28}" width="${cellW - 8}" height="20" rx="3" fill="#f7f8fa"/>`
    labels += `<text x="${cx}" y="${cy + cellH - 18}" text-anchor="middle" style="font-size:5.6px;fill:#1f2230">${escapeXml(clip(entry.label, 26))}</text>`
    labels += `<text x="${cx}" y="${cy + cellH - 10}" text-anchor="middle" style="font-size:4.8px;fill:#8a909c;font-weight:normal">${escapeXml(entry.id)}</text>`
  })
  const body = `<text x="8" y="16" style="font-size:9px;fill:#1f2230">agent-office kit · ${entries.length} sprites</text>${cells}${sprites}${labels}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * 2}" height="${height * 2}" shape-rendering="crispEdges" style="${skyVars(now)}">${defsFor(body)}<rect width="${width}" height="${height}" fill="#eef0f3"/>${body}</svg>`
}
