export type LocationId = string

export type Direction = 'north' | 'south' | 'east' | 'west'

export type LayerType = 'surface' | 'aerial' | 'underground'

export type Exit =
  | { kind: 'location'; id: LocationId }
  | { kind: 'departure'; id: LocationId | null }
  | { kind: 'blocked' }
  | null

// Interior sub-maps only; aerial and underground are full independent layers
export type SubMapType = 'interior'

export interface Location {
  id: LocationId
  exits: Record<Direction, Exit>
  interiorEntryId: LocationId | null
  aerialEntryId: LocationId | null
  undergroundEntryId: LocationId | null
  notes: string
}

// Used for aerial/underground layer locations and interior sub-map locations
export interface LayerLocation {
  id: LocationId
  exits: Record<Direction, Exit>
  notes: string
}

export type SubMapLocation = LayerLocation

export interface SubMap {
  id: string
  type: SubMapType
  parentId: LocationId
  locations: Record<LocationId, SubMapLocation>
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
  aerialLocations: Record<LocationId, LayerLocation>
  undergroundLocations: Record<LocationId, LayerLocation>
  subMaps: Record<string, SubMap>
  sessions: GameSession[]
  activeSessionId: string | null
}
