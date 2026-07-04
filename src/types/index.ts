export type LocationId = string

export type Direction = 'north' | 'south' | 'east' | 'west'

export type Exit =
  | { kind: 'location'; id: LocationId }
  | { kind: 'departure'; id: LocationId | null }
  | { kind: 'blocked' }
  | null
