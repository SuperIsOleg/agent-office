import { OX, OY, avatarPose, dayPart, deskBox, deskOverlay, doorSwingSvg, seatChairs, touches } from '../../hooks/art'
import type { Box2 } from '../../hooks/art'
import { P } from '../../hooks/iso'
import { WALL_ITEMS, wq } from '../../hooks/kit-wall'
import type { Side } from '../../hooks/kit-wall'
import { BOSS_DESK, DOOR, FLOOR, GRID_W, WALLS } from '../../hooks/layout'
import type { SnapScreen } from '../../hooks/snapshot'
import { poseHeight } from '../../hooks/sprites'
import { DESKS } from '../../hooks/world'
import type { Shown } from './people'
import { AVATAR_BOX, depthOf, poseFrame, screenOf } from './pose'
import { propsOf } from './props'
import { pieceOrigin, pieceRaster } from './room'
import type { Piece } from './room'
import { raster, svgDoc } from './raster'

export type Frame = { context: CanvasRenderingContext2D; scale: number; now: number; people: Map<string, Shown>; pieces: readonly Piece[]; door: { openness: number }; selected?: string }

type Item = { depth: number; draw: () => void; box?: Box2 }

const CHAIRS = seatChairs()
const WINDOW_GRID: Readonly<Record<string, readonly [number, number]>> = { 'window-2': [2, 1], window: [2, 2], 'window-plant': [2, 1], 'window-wide': [3, 1] }

function personItem(frame: Frame, shown: Shown): Item {
  const { context, scale, now } = frame
  const look = poseFrame(shown, now)
  const facing = shown.facing
  const [ax, ay] = screenOf(shown.x, shown.y, shown.z)
  const [fx, fy] = screenOf(shown.x, shown.y, 0)
  const height = poseHeight(look.pose, facing)
  const local = P(shown.x, shown.y, shown.z)
  const box = { x: local[0] - 14, y: local[1] - height - 2, w: 28, h: height + 6 }
  const key = `av|${shown.id}|${look.pose}|${facing}|${look.legs ?? ''}|${look.arms ?? ''}`
  const sprite = raster(`${key}|${scale}`, () => ({
    svg: svgDoc(AVATAR_BOX.x, AVATAR_BOX.y, AVATAR_BOX.w, AVATAR_BOX.h, avatarPose(shown.look, look.pose, facing, 0, look.legs, look.arms)),
    width: AVATAR_BOX.w * scale,
    height: AVATAR_BOX.h * scale,
  }))
  const depth = depthOf(shown)
  return {
    depth,
    box,
    draw: () => {
      context.save()
      context.globalAlpha = shown.fade
      if (look.pose !== 'sofa') {
        context.fillStyle = 'rgba(27,31,42,.18)'
        context.beginPath()
        context.ellipse(fx * scale, fy * scale, 9 * scale, 3.5 * scale, 0, 0, Math.PI * 2)
        context.fill()
      }
      if (frame.selected === shown.id) {
        const pulse = 0.65 + 0.35 * Math.sin(now / 220)
        context.strokeStyle = `rgba(255,211,107,${pulse})`
        context.lineWidth = Math.max(1.5, scale * 1.2)
        context.beginPath()
        context.ellipse(fx * scale, fy * scale, 12 * scale, 5 * scale, 0, 0, Math.PI * 2)
        context.stroke()
      }
      if (sprite !== undefined) {
        const x = Math.round((ax + look.dx) * scale)
        const y = Math.round((ay + look.dy) * scale)
        context.translate(x, y)
        if (shown.mirror) context.scale(-1, 1)
        context.drawImage(sprite, AVATAR_BOX.x * scale, AVATAR_BOX.y * scale)
      }
      context.restore()
    },
  }
}

function coverItem(frame: Frame, piece: Piece, under: readonly Box2[]): Item {
  return {
    depth: piece.depth,
    box: piece.box,
    draw: () => {
      const { context, scale } = frame
      context.save()
      context.beginPath()
      for (const box of under) context.rect(Math.floor((OX + box.x) * scale), Math.floor((OY + box.y) * scale), Math.ceil(box.w * scale) + 1, Math.ceil(box.h * scale) + 1)
      context.clip()
      drawPiece(frame, `piece|${piece.index}`, piece.box, piece.svg)
      context.restore()
    },
  }
}

function glowQuad(desk: { desk: { x: number; y: number }; screen: string }): [number, number][] {
  const { x, y } = desk.desk
  if (desk.screen === 'none') return [screenOf(x + 0.1, y + 0.775, 35.5), screenOf(x + 0.9, y + 0.775, 35.5), screenOf(x + 0.9, y + 0.775, 38.5), screenOf(x + 0.1, y + 0.775, 38.5)]
  const top = desk.screen === 'imac' ? 40 : 37
  return [screenOf(x + 0.04, y + 0.26, top), screenOf(x + 0.96, y + 0.26, top), screenOf(x + 0.96, y + 0.26, 18), screenOf(x + 0.04, y + 0.26, 18)]
}

function screenItems(frame: Frame, screens: readonly SnapScreen[]): Item[] {
  return screens.flatMap(screen => {
    const desk = screen.desk < 0 ? BOSS_DESK : DESKS[screen.desk]
    if (desk === undefined) return []
    const overlay = deskOverlay(desk, screen.kind, screen.thinking, screen.blueprint)
    const box = deskBox(desk)
    const items: Item[] = []
    if (overlay !== undefined) items.push({ depth: overlay.depth, box, draw: () => drawPiece(frame, `screen|${screen.desk}|${screen.kind}|${screen.thinking}|${screen.blueprint}`, box, overlay.svg) })
    if (screen.working) {
      const { x, y } = desk.desk
      const quad = glowQuad(desk)
      const phase = screen.desk + 2
      const wave = 0.5 + 0.5 * Math.sin(frame.now / 360 + phase * 1.7) + (Math.sin(frame.now / 53 + phase) > 0.97 ? 0.4 : 0)
      const strength = desk.screen === 'none' ? 0.18 + 0.3 * Math.min(1, wave) : 0.06 + 0.16 * Math.min(1, wave)
      const rim = desk.screen === 'none' ? [screenOf(x + 0.06, y + 0.81, 20), screenOf(x + 0.06, y + 0.81, 35), screenOf(x + 0.94, y + 0.81, 35), screenOf(x + 0.94, y + 0.81, 20)] : []
      items.push({
        depth: x + y + 0.21,
        box,
        draw: () => {
          const { context, scale } = frame
          const path = (points: readonly [number, number][]) => {
            context.beginPath()
            points.forEach(([px, py], i) => (i === 0 ? context.moveTo(px * scale, py * scale) : context.lineTo(px * scale, py * scale)))
          }
          context.save()
          context.fillStyle = `rgba(159,227,255,${strength})`
          path(quad)
          context.closePath()
          context.fill()
          if (rim.length > 0) {
            context.strokeStyle = `rgba(190,238,255,${0.45 + 0.4 * Math.min(1, wave)})`
            context.lineWidth = Math.max(1, Math.round(scale))
            path(rim)
            context.stroke()
          }
          context.restore()
        },
      })
    }
    return items
  })
}

function chairItems(frame: Frame, taken: ReadonlySet<string>): Item[] {
  return CHAIRS.map(chair => {
    const isOut = taken.has(chair.key)
    const box = chair.box(isOut)
    return { depth: chair.depth, box, draw: () => drawPiece(frame, `chair|${chair.key}|${isOut}`, box, chair.svg(isOut)) }
  })
}

function drawPiece(frame: Frame, key: string, box: Box2, svg: string): void {
  const canvas = pieceRaster(key, box, svg, frame.scale)
  if (canvas === undefined) return
  const [x, y] = pieceOrigin(box)
  frame.context.drawImage(canvas, Math.round(x * frame.scale), Math.round(y * frame.scale))
}

function doorItem(frame: Frame): Item | undefined {
  const level = Math.round(frame.door.openness * 4)
  if (level === 0) return undefined
  const [hx, hy] = P(GRID_W, DOOR.y)
  const box = { x: hx - 24, y: hy - 70, w: 40, h: 90 }
  return {
    depth: GRID_W - 1 + DOOR.y + 0.95,
    box,
    draw: () => drawPiece(frame, `door|${level}`, box, `<g transform="translate(${hx},${hy})">${doorSwingSvg(level / 4)}</g>`),
  }
}

function wallMatrix(side: Side, depth: number, ax: number, ay: number, scale: number): DOMMatrix {
  const [ex, ey] = wq(side, 0, 0, depth)
  return new DOMMatrix([scale, scale * (side === 'r' ? 0.5 : -0.5), 0, scale, (OX + ax + ex) * scale, (OY + ay + ey) * scale])
}

function drawClocks(frame: Frame): void {
  const { context, scale, now } = frame
  const date = new Date(now)
  const seconds = date.getSeconds() + date.getMilliseconds() / 1000
  const minutes = date.getMinutes() + seconds / 60
  const hours = (date.getHours() % 12) + minutes / 60
  for (const item of WALLS) {
    if (item.sprite !== 'clock') continue
    const side: Side = item.plane === 'y' ? 'r' : 'l'
    const [ax, ay] = P(item.x, item.y, item.z)
    context.save()
    context.setTransform(wallMatrix(side, 3, ax, ay, scale))
    const hand = (turns: number, length: number, width: number, color: string) => {
      const angle = turns * Math.PI * 2
      context.strokeStyle = color
      context.lineWidth = width
      context.beginPath()
      context.moveTo(10, 10)
      context.lineTo(10 + Math.sin(angle) * length, 10 - Math.cos(angle) * length)
      context.stroke()
    }
    hand(hours / 12, 4.4, 1.4, '#1b1e26')
    hand(minutes / 60, 6.4, 1, '#1b1e26')
    hand(seconds / 60, 6.8, 0.5, '#d4343d')
    context.fillStyle = '#1b1e26'
    context.fillRect(9.2, 9.2, 1.6, 1.6)
    context.restore()
  }
}

function drawWindows(frame: Frame): void {
  const { context, scale, now } = frame
  const part = dayPart(now)
  for (const item of WALLS) {
    const grid = WINDOW_GRID[item.sprite]
    const spec = WALL_ITEMS[item.sprite]
    if (grid === undefined || spec === undefined) continue
    const [columns, rows] = grid
    const { width: w, height: h } = spec
    const side: Side = item.plane === 'y' ? 'r' : 'l'
    const [ax, ay] = P(item.x, item.y, item.z)
    context.save()
    context.setTransform(wallMatrix(side, -1, ax, ay, scale))
    context.beginPath()
    const paneW = w / columns
    const paneH = h / rows
    for (let c = 0; c < columns; c += 1) for (let r = 0; r < rows; r += 1) context.rect(c * paneW + (c > 0 ? 1 : 0), r * paneH + (r > 0 ? 1 : 0), paneW - (c > 0 ? 1 : 0) - (c < columns - 1 ? 1 : 0), paneH - (r > 0 ? 1 : 0) - (r < rows - 1 ? 1 : 0))
    context.clip()
    if (part === 'night') {
      for (let i = 0; i < 4; i += 1) {
        const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(now / 900 + i * 2.1 + item.x))
        context.fillStyle = `rgba(255,255,255,${twinkle})`
        context.fillRect((i * 9.3 + item.y * 3) % w, (i * 5.7) % (h * 0.6), 1, 1)
      }
    } else {
      context.fillStyle = part === 'dusk' ? 'rgba(255,236,214,.9)' : 'rgba(255,255,255,.92)'
      const drift = (period: number, offset: number) => ((((now + offset) / 1000 / period) % 1) + 1) % 1
      for (const [period, offset, y] of [
        [34, 5000 + item.x * 977, 8],
        [52, 30000 + item.y * 613, h - 10],
      ] as const) {
        const x = drift(period, offset) * (w + 16) - 12
        context.fillRect(x, y, 8, 2)
        context.fillRect(x + 2, y - 2, 4, 2)
      }
    }
    context.restore()
  }
}

function drawBubbles(frame: Frame): void {
  const { context, scale, now } = frame
  for (const item of FLOOR) {
    if (item.sprite !== 'cooler') continue
    for (let i = 0; i < 3; i += 1) {
      const t = (((now / 2600 + i / 3) % 1) + 1) % 1
      const [x, y] = screenOf(item.x + 0.5 + (i - 1) * 0.06, item.y + 0.58, 32 + t * 14)
      context.fillStyle = `rgba(232,247,255,${1 - t})`
      context.fillRect(Math.round(x * scale), Math.round(y * scale), Math.ceil(1.4 * scale), Math.ceil(1.4 * scale))
    }
  }
}

function drawSteam(frame: Frame): void {
  const { context, scale, now } = frame
  for (const shown of frame.people.values()) {
    const pose = shown.snap.rest.pose
    if (shown.isWalking || (pose !== 'cup' && pose !== 'bossCup')) continue
    const [ax, ay] = screenOf(shown.x, shown.y, shown.z)
    const side = shown.mirror ? -1 : 1
    for (let i = 0; i < 3; i += 1) {
      const t = (((now / 1600 + i / 3 + shown.look.seed / 97) % 1) + 1) % 1
      context.fillStyle = `rgba(255,255,255,${0.55 * (1 - t) * shown.fade})`
      const x = ax + side * 6 + Math.sin(t * 6 + i) * 1.2
      const y = ay - 18 - t * 9
      context.fillRect(Math.round(x * scale), Math.round(y * scale), Math.ceil(scale), Math.ceil(scale))
    }
  }
}

export function drawFrame(frame: Frame, room: HTMLCanvasElement | undefined): Box2[] {
  const { context } = frame
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.imageSmoothingEnabled = false
  if (room !== undefined) context.drawImage(room, 0, 0)
  drawWindows(frame)
  drawClocks(frame)
  const props = propsOf(frame.people)
  const movers: Item[] = [...frame.people.values()].map(shown => personItem(frame, shown))
  movers.push(...screenItems(frame, props.screens), ...chairItems(frame, props.chairs))
  const door = doorItem(frame)
  if (door !== undefined) movers.push(door)
  const covers = frame.pieces.flatMap(piece => {
    const under = movers.flatMap(mover => (mover.box !== undefined && mover.depth < piece.depth && touches(mover.box, piece.box) ? [mover.box] : []))
    return under.length > 0 ? [coverItem(frame, piece, under)] : []
  })
  for (const item of [...movers, ...covers].sort((a, b) => a.depth - b.depth)) item.draw()
  drawBubbles(frame)
  drawSteam(frame)
  context.setTransform(1, 0, 0, 1, 0, 0)
  return movers.flatMap(item => (item.box !== undefined ? [item.box] : []))
}

export function isOpaqueAt(shown: Shown, now: number, scale: number, x: number, y: number): boolean | undefined {
  const look = poseFrame(shown, now)
  const key = `av|${shown.id}|${look.pose}|${shown.facing}|${look.legs ?? ''}|${look.arms ?? ''}|${scale}`
  const sprite = raster(key, () => ({
    svg: svgDoc(AVATAR_BOX.x, AVATAR_BOX.y, AVATAR_BOX.w, AVATAR_BOX.h, avatarPose(shown.look, look.pose, shown.facing, 0, look.legs, look.arms)),
    width: AVATAR_BOX.w * scale,
    height: AVATAR_BOX.h * scale,
  }))
  if (sprite === undefined) return undefined
  const [ax, ay] = screenOf(shown.x, shown.y, shown.z)
  const localX = (shown.mirror ? -1 : 1) * (x - (ax + look.dx))
  const localY = y - (ay + look.dy)
  const px = Math.floor((localX - AVATAR_BOX.x) * scale)
  const py = Math.floor((localY - AVATAR_BOX.y) * scale)
  if (px < 0 || py < 0 || px >= sprite.width || py >= sprite.height) return false
  try {
    const alpha = sprite.getContext('2d')?.getImageData(px, py, 1, 1).data[3] ?? 0
    return alpha > 40
  } catch {
    return undefined
  }
}
