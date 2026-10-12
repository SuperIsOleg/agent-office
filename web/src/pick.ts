import type { Shown } from './people'
import { bodyOf, depthOf } from './pose'

export type Hit = { id: string; depth: number }

export function hitsAt(people: ReadonlyMap<string, Shown>, now: number, x: number, y: number): Hit[] {
  const found: Hit[] = []
  for (const shown of people.values()) {
    if (shown.removedAt !== undefined || shown.fade < 0.5) continue
    const box = bodyOf(shown, now)
    if (x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h) found.push({ id: shown.id, depth: depthOf(shown) })
  }
  return found.sort((a, b) => b.depth - a.depth)
}
