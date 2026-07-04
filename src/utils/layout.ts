import type { Direction, Exit, LocationId } from '../types'

type AnyLocation = { exits: Record<Direction, Exit> }
export type Offset = { dx: number; dy: number }

const DIRECTION_DELTA: Record<Direction, Offset> = {
  north: { dx:  0, dy: -1 },
  south: { dx:  0, dy:  1 },
  east:  { dx:  1, dy:  0 },
  west:  { dx: -1, dy:  0 },
}

const OPPOSITE: Record<Direction, Direction> = {
  north: 'south',
  south: 'north',
  east:  'west',
  west:  'east',
}

export function computeLayout(
  center: LocationId,
  locations: Record<LocationId, AnyLocation>,
): Map<LocationId, Offset> {
  const placed = new Map<LocationId, Offset>()
  if (!locations[center]) return placed

  // Build reverse links for departure exits so BFS can traverse back through them.
  // A departure from A→B implies B is spatially adjacent to A (opposite direction),
  // but B has no exit back to A. We use this map to cross that gap during traversal.
  const departureBackLinks = new Map<LocationId, Array<{ sourceId: LocationId; dir: Direction }>>()
  for (const [locId, loc] of Object.entries(locations)) {
    for (const [dir, exit] of Object.entries(loc.exits) as [Direction, Exit][]) {
      if (exit?.kind === 'departure' && exit.id) {
        const links = departureBackLinks.get(exit.id) ?? []
        links.push({ sourceId: locId, dir: OPPOSITE[dir] })
        departureBackLinks.set(exit.id, links)
      }
    }
  }

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

    // Follow departure back-links so locations on the near side of a departure
    // remain reachable when the BFS center is on the far side.
    for (const { sourceId, dir } of departureBackLinks.get(id) ?? []) {
      if (placed.has(sourceId) || !locations[sourceId]) continue

      const delta = DIRECTION_DELTA[dir]
      const newOffset = { dx: offset.dx + delta.dx, dy: offset.dy + delta.dy }
      if (Math.abs(newOffset.dx) > 13 || Math.abs(newOffset.dy) > 13) continue

      placed.set(sourceId, newOffset)
      queue.push({ id: sourceId, offset: newOffset })
    }
  }

  return placed
}
