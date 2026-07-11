export type LocationId = string

export type Direction = 'north' | 'south' | 'east' | 'west'

export type LayerType = 'surface' | 'aerial' | 'underground' | 'interior' | 'city'

export type Exit =
  | { kind: 'location'; id: LocationId | null }
  | { kind: 'departure'; id: LocationId | null }
  | { kind: 'blocked' }
  | null

export interface Location {
  id: LocationId
  layer: LayerType
  exits: Record<Direction, Exit>
  // Action-based (non-compass) links to other layers, e.g. a dig or an entrance.
  // Keyed by destination layer; never contains this location's own layer. A
  // layer's presence in this map (with a non-null id) is itself the record of
  // the connection — there's no separate "known but unresolved" state.
  connections: Partial<Record<LayerType, LocationId>>
  notes: string
}

export interface GameSession {
  id: string
  name: string
  startedAt: string
  startingLocationId: LocationId
  currentLocationId: LocationId
  displayCenters: Record<LayerType, LocationId | null>
  floatingRoots: Record<LayerType, LocationId[]>
  visitedLocations: LocationId[]
  actionTaken: Record<LocationId, boolean>
}

export interface PersistentAtlas {
  version: number
  locations: Record<LocationId, Location>
  sessions: GameSession[]
  activeSessionId: string | null
}
