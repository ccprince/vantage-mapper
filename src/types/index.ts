export type LocationId = string

export type Direction = 'north' | 'south' | 'east' | 'west'

export type Exit =
  | { kind: 'location'; id: LocationId }
  | { kind: 'departure'; id: LocationId | null }
  | { kind: 'blocked' }
  | null

export type SubMapType = 'interior' | 'aerial' | 'underground'

export interface Location {
  id: LocationId
  exits: Record<Direction, Exit>
  hasInterior: boolean
  hasAerial: boolean
  hasUnderground: boolean
  notes: string
}

export interface SubMapLocation {
  id: LocationId
  exits: Record<Direction, Exit>
  notes: string
}

export interface SubMap {
  id: string
  type: SubMapType
  parentId: LocationId
  locations: Record<LocationId, SubMapLocation>
  currentLocationId: LocationId
  visitedLocations: LocationId[]
}

export interface GameSession {
  id: string
  name: string
  startedAt: string
  startingLocationId: LocationId
  currentLocationId: LocationId
  displayCenter: LocationId
  floatingRoots: LocationId[]
  visitedLocations: LocationId[]
  actionTaken: Record<LocationId, boolean>
}

export interface PersistentAtlas {
  version: number
  locations: Record<LocationId, Location>
  subMaps: Record<string, SubMap>
  sessions: GameSession[]
  activeSessionId: string | null
}
