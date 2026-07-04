import { defineStore } from 'pinia'
import type { Direction, Exit, GameSession, Location, LocationId, SubMap, SubMapType } from '../types'

const OPPOSITE: Record<Direction, Direction> = {
  north: 'south', south: 'north', east: 'west', west: 'east',
}

export const useAtlasStore = defineStore('atlas', {
  state: () => ({
    locations: {
      '031': {
        id: '031',
        exits: { north: null, south: { kind: 'location', id: '041' }, east: null, west: null },
        hasInterior: false, hasAerial: false, hasUnderground: false, notes: '',
      },
      '040': {
        id: '040',
        exits: { north: null, south: null, east: { kind: 'location', id: '041' }, west: { kind: 'blocked' } },
        hasInterior: false, hasAerial: false, hasUnderground: false, notes: '',
      },
      '041': {
        id: '041',
        exits: {
          north: { kind: 'location', id: '031' },
          south: null,
          east: { kind: 'location', id: '042' },
          west: { kind: 'location', id: '040' },
        },
        hasInterior: false, hasAerial: false, hasUnderground: false, notes: '',
      },
      '042': {
        id: '042',
        exits: {
          north: null,
          south: { kind: 'location', id: '052' },
          east: { kind: 'location', id: '043' },
          west: { kind: 'location', id: '041' },
        },
        hasInterior: true, hasAerial: false, hasUnderground: false, notes: '',
      },
      '043': {
        id: '043',
        exits: {
          north: null,
          south: null,
          east: { kind: 'departure', id: null },
          west: { kind: 'location', id: '042' },
        },
        hasInterior: false, hasAerial: false, hasUnderground: false, notes: '',
      },
      '052': {
        id: '052',
        exits: { north: { kind: 'location', id: '042' }, south: null, east: null, west: { kind: 'blocked' } },
        hasInterior: false, hasAerial: false, hasUnderground: false, notes: '',
      },
    } as Record<LocationId, Location>,

    subMaps: {} as Record<string, SubMap>,

    sessions: [
      {
        id: 'demo-session',
        name: 'Demo Session',
        startedAt: new Date().toISOString(),
        startingLocationId: '041',
        currentLocationId: '042',
        displayCenter: '042',
        floatingRoots: [],
        visitedLocations: ['041', '042', '052'],
        actionTaken: { '042': true },
      },
    ] as GameSession[],

    activeSessionId: 'demo-session' as string | null,
  }),

  getters: {
    activeSession: (state): GameSession | undefined =>
      state.sessions.find(s => s.id === state.activeSessionId),
  },

  actions: {
    addLocation(id: LocationId): Location {
      const loc: Location = {
        id,
        exits: { north: null, south: null, east: null, west: null },
        hasInterior: false,
        hasAerial: false,
        hasUnderground: false,
        notes: '',
      }
      this.locations[id] = loc
      return loc
    },

    setExit(locationId: LocationId, dir: Direction, exit: Exit) {
      const loc = this.locations[locationId]
      if (!loc) return

      let createdNew = false
      if (exit !== null && exit.kind === 'location') {
        if (!(exit.id in this.locations)) {
          this.addLocation(exit.id)
          createdNew = true
        }
      }

      loc.exits[dir] = exit

      if (createdNew && exit !== null && exit.kind === 'location') {
        this.locations[exit.id].exits[OPPOSITE[dir]] = { kind: 'location', id: locationId }
      }
    },

    setNotes(locationId: LocationId, notes: string) {
      const loc = this.locations[locationId]
      if (loc) loc.notes = notes
    },

    setSubMapFlag(locationId: LocationId, type: SubMapType, value: boolean) {
      const loc = this.locations[locationId]
      if (!loc) return
      if (type === 'interior') loc.hasInterior = value
      else if (type === 'aerial') loc.hasAerial = value
      else loc.hasUnderground = value
    },
  },
})
