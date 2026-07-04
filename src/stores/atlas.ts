import { defineStore } from 'pinia'
import type { Direction, Exit, GameSession, Location, LocationId, SubMap, SubMapType } from '../types'
import { loadAtlas } from '../utils/storage'

const OPPOSITE: Record<Direction, Direction> = {
  north: 'south', south: 'north', east: 'west', west: 'east',
}

export const useAtlasStore = defineStore('atlas', {
  state: () => {
    const saved = loadAtlas()
    return {
      locations: (saved?.locations ?? {}) as Record<LocationId, Location>,
      subMaps: (saved?.subMaps ?? {}) as Record<string, SubMap>,
      sessions: (saved?.sessions ?? []) as GameSession[],
      activeSessionId: (saved?.activeSessionId ?? null) as string | null,
    }
  },

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
