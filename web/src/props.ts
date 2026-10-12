import type { SnapScreen } from '../../hooks/snapshot'
import { DOOR, GRID_W } from '../../hooks/world'
import { isArrived } from './people'
import type { Shown } from './people'

export type Props = { chairs: ReadonlySet<string>; screens: readonly SnapScreen[] }

export function isSeated(shown: Shown): boolean {
  return shown.removedAt === undefined && isArrived(shown)
}

export function propsOf(people: ReadonlyMap<string, Shown>): Props {
  const chairs = new Set<string>()
  const screens: SnapScreen[] = []
  for (const shown of people.values()) {
    if (!isSeated(shown)) continue
    const rest = shown.snap.rest
    if (rest.seat !== undefined) chairs.add(rest.seat)
    if (rest.screen !== undefined) screens.push(rest.screen)
  }
  return { chairs, screens }
}

export function isAtDoor(people: ReadonlyMap<string, Shown>): boolean {
  for (const shown of people.values()) {
    if (shown.x >= GRID_W) return true
    if (Math.abs(shown.x - (GRID_W - 0.5)) < 1.7 && Math.abs(shown.y - (DOOR.y + 0.5)) < 1.2) return true
  }
  return false
}
