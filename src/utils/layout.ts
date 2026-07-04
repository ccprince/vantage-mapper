import type { Direction, Exit, LocationId } from '../types'

type AnyLocation = { exits: Record<Direction, Exit> }
export type Offset = { dx: number; dy: number }

const DIRECTION_DELTA: Record<Direction, Offset> = {
  north: { dx:  0, dy: -1 },
  south: { dx:  0, dy:  1 },
  east:  { dx:  1, dy:  0 },
  west:  { dx: -1, dy:  0 },
}

export function computeLayout(
  center: LocationId,
  locations: Record<LocationId, AnyLocation>,
): Map<LocationId, Offset> {
  const placed = new Map<LocationId, Offset>()
  if (!locations[center]) return placed

  placed.set(center, { dx: 0, dy: 0 })
  const queue: Array<{ id: LocationId; offset: Offset }> = [
    { id: center, offset: { dx: 0, dy: 0 } },
  ]

  while (queue.length > 0) {
    const { id, offset } = queue.shift()!
    const loc = locations[id]
    if (!loc) continue

    for (const [dir, exit] of Object.entries(loc.exits) as [Direction, Exit][]) {
      if (!exit || exit.kind === 'blocked') continue
      const targetId = exit.id
      if (!targetId || placed.has(targetId) || !locations[targetId]) continue

      const delta = DIRECTION_DELTA[dir]
      const newOffset = { dx: offset.dx + delta.dx, dy: offset.dy + delta.dy }
      if (Math.abs(newOffset.dx) > 13 || Math.abs(newOffset.dy) > 13) continue

      placed.set(targetId, newOffset)
      queue.push({ id: targetId, offset: newOffset })
    }
  }

  return placed
}
