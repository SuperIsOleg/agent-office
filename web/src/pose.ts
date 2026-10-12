import { OX, OY } from '../../hooks/art'
import type { Box2 } from '../../hooks/art'
import { P } from '../../hooks/iso'
import { POSES, poseHeight } from '../../hooks/sprites'
import type { PoseId } from '../../hooks/sprites'
import type { Shown } from './people'

export const AVATAR_BOX = { x: -20, y: -66, w: 40, h: 72 }

const WALK_ARMS = ['swingA', 'down', 'swingB', 'down'] as const

export type Look = { pose: PoseId; legs?: string; arms?: string; dx: number; dy: number }

export function screenOf(x: number, y: number, z = 0): [number, number] {
  const [a, b] = P(x, y, z)
  return [OX + a, OY + b]
}

export function poseFrame(shown: Shown, now: number): Look {
  if (shown.isWalking && shown.stillFor > 120) return { pose: shown.snap.gait === 'slump' ? 'slump' : 'walk', legs: 'stand', arms: 'down', dx: 0, dy: 0 }
  if (shown.isWalking) {
    const pose: PoseId = shown.snap.gait === 'slump' ? 'slump' : 'walk'
    const frame = Math.floor(shown.stride * 4) % 4
    return { pose, legs: frame % 2 === 0 ? 'stride' : 'stand', arms: pose === 'slump' ? 'down' : WALK_ARMS[frame], dx: 0, dy: frame % 2 === 1 ? -1 : 0 }
  }
  const pose = shown.snap.rest.pose as PoseId
  const meta = POSES[pose]
  const side = meta[shown.facing]
  const seconds = (now + shown.look.seed * 37) / 1000
  const arms = side.arms.length > 1 && meta.frameDur > 0 ? side.arms[Math.floor(seconds / meta.frameDur) % side.arms.length] : side.arms[0]
  let dx = 0
  let dy = 0
  if (meta.motion === 'bob') dy = Math.sin((seconds * Math.PI * 2) / 2.4) > 0.3 ? -1 : 0
  if (meta.motion === 'jump') {
    const t = (seconds % 0.9) / 0.9
    dy = t < 0.3 ? -Math.round((t / 0.3) * 6) : t < 0.6 ? -Math.round(((0.6 - t) / 0.3) * 6) : 0
  }
  if (meta.motion === 'shake') dx = [0, 1, 0, -1][Math.floor(seconds * 8) % 4] ?? 0
  if (pose === 'cup' || pose === 'bossCup') dy += Math.sin(seconds * 1.6) > 0.92 ? -1 : 0
  return { pose, ...(arms !== undefined ? { arms } : {}), dx, dy }
}

export function depthOf(shown: Shown): number {
  return shown.isWalking ? shown.x + shown.y - 0.5 : shown.snap.rest.depth
}

export function anchorOf(shown: Shown, now: number): { x: number; y: number; look: Look } {
  const look = poseFrame(shown, now)
  const [ax, ay] = screenOf(shown.x, shown.y, shown.z)
  return { x: ax + look.dx, y: ay + look.dy, look }
}

export function headOf(shown: Shown, now: number): [number, number] {
  const { x, y, look } = anchorOf(shown, now)
  return [x, y - poseHeight(look.pose, shown.facing)]
}

export function bodyOf(shown: Shown, now: number): Box2 {
  const { x, y, look } = anchorOf(shown, now)
  const height = poseHeight(look.pose, shown.facing) + 4
  return { x: x - 13, y: y - height, w: 26, h: height + 2 }
}

export function figureRect(shown: Shown, now: number): Box2 {
  const { x, y } = anchorOf(shown, now)
  const [fx, fy] = screenOf(shown.x, shown.y, 0)
  const x0 = Math.min(x + AVATAR_BOX.x, fx - 12)
  const y0 = y + AVATAR_BOX.y
  const x1 = Math.max(x + AVATAR_BOX.x + AVATAR_BOX.w, fx + 12)
  const y1 = Math.max(y + AVATAR_BOX.y + AVATAR_BOX.h, fy + 6)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
