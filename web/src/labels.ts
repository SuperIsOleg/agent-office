import { bubbleOf } from '../../hooks/snapshot'
import type { SnapBubble } from '../../hooks/snapshot'
import { isOutside } from '../../hooks/world'
import { headOf } from './pose'
import type { Shown } from './people'

export type Rect = { x: number; y: number; w: number; h: number }

const BUBBLE: Readonly<Record<string, readonly [string, string, string]>> = {
  say: ['#f7f8fa', '#c9cdd6', '#23262f'],
  ask: ['#ffe48a', '#9c7a00', '#5a4500'],
  fail: ['#ff8a80', '#9b2a24', '#5c0f0b'],
  done: ['#a6f0cf', '#2b8a62', '#0f4a33'],
  stop: ['#e4e6eb', '#6b7080', '#3a3d47'],
}

function overlaps(a: Rect, list: readonly Rect[]): boolean {
  return list.some(b => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
}

function rounded(context: CanvasRenderingContext2D, rect: Rect, radius: number): void {
  context.beginPath()
  context.roundRect(rect.x, rect.y, rect.w, rect.h, radius)
}

function bubbleText(shown: Shown, now: number): SnapBubble | undefined {
  const bubble = bubbleOf(shown.snap, shown.isWalking)
  if (bubble?.text === 'Думает…') return { text: `Думает${'.'.repeat(1 + (Math.floor(now / 450) % 3))}`, kind: 'say' }
  return bubble
}

export function drawLabels(context: CanvasRenderingContext2D, people: Map<string, Shown>, scale: number, now: number, dt: number, selected?: string): Rect[] {
  const taken: Rect[] = []
  const unit = scale
  const ordered = [...people.values()].sort((a, b) => b.y + b.x - (a.y + a.x))
  context.save()
  context.textBaseline = 'middle'
  for (const shown of ordered) {
    if (isOutside({ x: Math.floor(shown.x), y: Math.floor(shown.y) })) continue
    const [hx, hy] = headOf(shown, now)
    const font = `bold ${Math.round(5.6 * unit)}px Verdana, Tahoma, sans-serif`
    context.font = font
    const name = shown.snap.name
    const count = shown.snap.completed > 0 ? `✓${shown.snap.completed}` : ''
    const nameW = context.measureText(name).width
    const countW = count ? context.measureText(count).width + 2 * unit : 0
    const tagW = nameW + countW + 18 * unit
    const tagH = 8 * unit
    let tag: Rect = { x: hx * scale - tagW / 2, y: (hy - 11) * scale, w: tagW, h: tagH }
    for (let lift = 0; lift < 3 && overlaps(tag, taken); lift += 1) tag = { ...tag, y: tag.y - tagH - 2 * unit }
    const eased = shown.label ?? { x: tag.x, y: tag.y }
    const rate = Math.min(1, dt / 90)
    eased.x += (tag.x - eased.x) * rate
    eased.y += (tag.y - eased.y) * rate
    shown.label = eased
    const at: Rect = { ...tag, x: Math.round(eased.x), y: Math.round(eased.y) }
    taken.push(at)
    context.globalAlpha = shown.fade
    context.fillStyle = 'rgba(42,45,54,.85)'
    rounded(context, at, 4 * unit)
    context.fill()
    if (shown.id === selected) {
      context.strokeStyle = '#ffd36b'
      context.lineWidth = Math.max(1, unit)
      context.stroke()
    }
    context.fillStyle = shown.snap.dot
    context.beginPath()
    context.arc(at.x + 4.5 * unit, at.y + tagH / 2, 1.8 * unit, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#ffffff'
    context.fillText(name, at.x + 8 * unit, at.y + tagH / 2 + 0.3 * unit)
    if (count) {
      context.fillStyle = '#5fe08f'
      context.fillText(count, at.x + 9 * unit + nameW, at.y + tagH / 2 + 0.3 * unit)
    }
    context.strokeStyle = '#c9cdd6'
    context.lineWidth = 0.7 * unit
    const ix = at.x + tagW - 8 * unit
    context.strokeRect(ix, at.y + 2 * unit, 5 * unit, 3.2 * unit)
    const bubble = bubbleText(shown, now)
    if (bubble === undefined) continue
    const [fill, stroke, ink] = BUBBLE[bubble.kind] ?? BUBBLE.say ?? ['#fff', '#ccc', '#222']
    const big = Array.from(bubble.text).length <= 1
    context.font = `${bubble.kind === 'say' ? '' : 'bold '}${Math.round((big ? 9 : bubble.kind === 'say' ? 5.8 : 6.5) * unit)}px Verdana, Tahoma, sans-serif`
    const textW = Math.max(5 * unit, context.measureText(bubble.text).width)
    const bubbleH = (big ? 13 : 10) * unit
    let box: Rect = { x: hx * scale - (textW + 10 * unit) / 2, y: at.y - 4 * unit - bubbleH, w: textW + 10 * unit, h: bubbleH }
    for (let lift = 0; lift < 2 && overlaps(box, taken); lift += 1) box = { ...box, y: box.y - 6 * unit }
    taken.push(box)
    const pulse = bubble.kind === 'ask' || bubble.kind === 'fail' ? Math.round(Math.sin(now / 160) * unit) : 0
    box = { ...box, y: Math.round(box.y + pulse), x: Math.round(box.x) }
    context.fillStyle = fill
    context.strokeStyle = stroke
    context.lineWidth = 0.8 * unit
    rounded(context, box, (big ? 4 : 3.5) * unit)
    context.fill()
    context.stroke()
    const tail = Math.round(hx * scale)
    context.beginPath()
    context.moveTo(tail - 2.5 * unit, box.y + box.h - 0.5)
    context.lineTo(tail + 2.5 * unit, box.y + box.h - 0.5)
    context.lineTo(tail, box.y + box.h + 3 * unit)
    context.closePath()
    context.fill()
    context.stroke()
    context.fillRect(tail - 2 * unit, box.y + box.h - 1.4 * unit, 4 * unit, 1.4 * unit)
    context.fillStyle = ink
    context.textAlign = 'center'
    context.fillText(bubble.text, box.x + box.w / 2, box.y + box.h / 2 + 0.4 * unit)
    context.textAlign = 'start'
  }
  context.restore()
  return taken
}
