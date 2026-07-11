import { defineStore } from 'pinia'
import type { Direction, Exit, GameSession, LayerType, Location, LocationId, PersistentAtlas } from '../types'
import { loadAtlas, saveAtlas } from '../utils/storage'

const OPPOSITE: Record<Direction, Direction> = {
  north: 'south', south: 'north', east: 'west', west: 'east',
}

export const useAtlasStore = defineStore('atlas', {
  state: () => {
    const loaded = loadAtlas()
    return {
      locations: (loaded?.atlas.locations ?? {}) as Record<LocationId, Location>,
      sessions: (loaded?.atlas.sessions ?? []) as GameSession[],
      activeSessionId: (loaded?.atlas.activeSessionId ?? null) as string | null,
      resetWarning: (loaded?.wasReset ?? false) as boolean,
    }
  },

  getters: {
    activeSession: (state): GameSession | undefined =>
      state.sessions.find(s => s.id === state.activeSessionId),
  },

  actions: {
    dismissResetWarning() {
      this.resetWarning = false
    },

    addLocation(id: LocationId, layer: LayerType): Location {
      const loc: Location = {
        id,
        layer,
        exits: { north: null, south: null, east: null, west: null },
        connections: {},
        notes: '',
      }
      this.locations[id] = loc
      return loc
    },

    setExit(locationId: LocationId, dir: Direction, exit: Exit) {
      const loc = this.locations[locationId]
      if (!loc) return

      let createdNew = false
      if (exit !== null && exit.kind === 'location' && exit.id) {
        if (!(exit.id in this.locations)) {
          this.addLocation(exit.id, loc.layer)
          createdNew = true
        }
      }

      loc.exits[dir] = exit

      if (exit !== null && exit.kind === 'location' && exit.id) {
        const reverse = OPPOSITE[dir]
        if (createdNew || this.locations[exit.id].exits[reverse] === null) {
          this.locations[exit.id].exits[reverse] = { kind: 'location', id: locationId }
        }
      }
    },

    setConnection(locationId: LocationId, targetLayer: LayerType, id: LocationId | null) {
      const loc = this.locations[locationId]
      if (!loc || targetLayer === loc.layer) return

      let createdNew = false
      if (id !== null && !(id in this.locations)) {
        this.addLocation(id, targetLayer)
        createdNew = true
      }

      if (id !== null) loc.connections[targetLayer] = id
      else delete loc.connections[targetLayer]

      if (id !== null) {
        const target = this.locations[id]
        if (createdNew || !target.connections[loc.layer]) {
          target.connections[loc.layer] = locationId
        }
      }
    },

    setNotes(locationId: LocationId, notes: string) {
      const loc = this.locations[locationId]
      if (loc) loc.notes = notes
    },

    restoreFromBackup(atlas: PersistentAtlas) {
      this.locations = atlas.locations ?? {}
      this.sessions = atlas.sessions ?? []
      this.activeSessionId = atlas.activeSessionId ?? null
      saveAtlas(atlas)
    },
  },
})
