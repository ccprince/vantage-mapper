import { defineStore } from 'pinia'
import type { Direction, Exit, GameSession, LayerLocation, Location, LocationId, PersistentAtlas, SubMap, SubMapLocation, SubMapType } from '../types'
import { loadAtlas, saveAtlas } from '../utils/storage'

const OPPOSITE: Record<Direction, Direction> = {
  north: 'south', south: 'north', east: 'west', west: 'east',
}

export const useAtlasStore = defineStore('atlas', {
  state: () => {
    const saved = loadAtlas()
    return {
      locations: (saved?.locations ?? {}) as Record<LocationId, Location>,
      aerialLocations: (saved?.aerialLocations ?? {}) as Record<LocationId, LayerLocation>,
      undergroundLocations: (saved?.undergroundLocations ?? {}) as Record<LocationId, LayerLocation>,
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
        interiorEntryId: null,
        aerialEntryId: null,
        undergroundEntryId: null,
        notes: '',
      }
      this.locations[id] = loc
      return loc
    },

    addLayerLocation(layer: 'aerial' | 'underground', id: LocationId): LayerLocation {
      const loc: LayerLocation = {
        id,
        exits: { north: null, south: null, east: null, west: null },
        notes: '',
      }
      if (layer === 'aerial') this.aerialLocations[id] = loc
      else this.undergroundLocations[id] = loc
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

      if (exit !== null && exit.kind === 'location') {
        const reverse = OPPOSITE[dir]
        if (createdNew || this.locations[exit.id].exits[reverse] === null) {
          this.locations[exit.id].exits[reverse] = { kind: 'location', id: locationId }
        }
      }
    },

    setLayerExit(layer: 'aerial' | 'underground', locationId: LocationId, dir: Direction, exit: Exit) {
      const locs = layer === 'aerial' ? this.aerialLocations : this.undergroundLocations
      const loc = locs[locationId]
      if (!loc) return

      let createdNew = false
      if (exit !== null && exit.kind === 'location') {
        if (!(exit.id in locs)) {
          this.addLayerLocation(layer, exit.id)
          createdNew = true
        }
      }

      loc.exits[dir] = exit

      if (exit !== null && exit.kind === 'location') {
        const reverse = OPPOSITE[dir]
        if (createdNew || locs[exit.id].exits[reverse] === null) {
          locs[exit.id].exits[reverse] = { kind: 'location', id: locationId }
        }
      }
    },

    setNotes(locationId: LocationId, notes: string) {
      const loc = this.locations[locationId]
      if (loc) loc.notes = notes
    },

    setLayerNotes(layer: 'aerial' | 'underground', locationId: LocationId, notes: string) {
      const locs = layer === 'aerial' ? this.aerialLocations : this.undergroundLocations
      const loc = locs[locationId]
      if (loc) loc.notes = notes
    },

    setInteriorEntry(locationId: LocationId, entryId: LocationId | null) {
      const loc = this.locations[locationId]
      if (!loc) return
      loc.interiorEntryId = entryId
      if (entryId) {
        const subMapId = `${locationId}-interior`
        if (!(subMapId in this.subMaps)) this.createSubMap(locationId, 'interior', entryId)
      }
    },

    setLayerEntry(locationId: LocationId, layer: 'aerial' | 'underground', entryId: LocationId | null) {
      const loc = this.locations[locationId]
      if (!loc) return
      if (layer === 'aerial') loc.aerialEntryId = entryId
      else loc.undergroundEntryId = entryId
      if (entryId) {
        const locs = layer === 'aerial' ? this.aerialLocations : this.undergroundLocations
        if (!(entryId in locs)) this.addLayerLocation(layer, entryId)
      }
    },

    createSubMap(parentId: LocationId, type: SubMapType, startingLocationId: LocationId): SubMap {
      const id = `${parentId}-${type}`
      const startLoc: SubMapLocation = {
        id: startingLocationId,
        exits: { north: null, south: null, east: null, west: null },
        notes: '',
      }
      const subMap: SubMap = {
        id, type, parentId,
        locations: { [startingLocationId]: startLoc },
      }
      this.subMaps[id] = subMap
      return subMap
    },

    addSubMapLocation(subMapId: string, locationId: LocationId): SubMapLocation {
      const subMap = this.subMaps[subMapId]
      if (!subMap) throw new Error(`SubMap not found: ${subMapId}`)
      const loc: SubMapLocation = {
        id: locationId,
        exits: { north: null, south: null, east: null, west: null },
        notes: '',
      }
      subMap.locations[locationId] = loc
      return loc
    },

    setSubMapExit(subMapId: string, locationId: LocationId, dir: Direction, exit: Exit) {
      const subMap = this.subMaps[subMapId]
      if (!subMap) return
      const loc = subMap.locations[locationId]
      if (!loc) return

      let createdNew = false
      if (exit !== null && exit.kind === 'location') {
        if (!(exit.id in subMap.locations)) {
          this.addSubMapLocation(subMapId, exit.id)
          createdNew = true
        }
      }

      loc.exits[dir] = exit

      if (exit !== null && exit.kind === 'location') {
        const reverse = OPPOSITE[dir]
        if (createdNew || subMap.locations[exit.id].exits[reverse] === null) {
          subMap.locations[exit.id].exits[reverse] = { kind: 'location', id: locationId }
        }
      }
    },

    setSubMapNotes(subMapId: string, locationId: LocationId, notes: string) {
      const subMap = this.subMaps[subMapId]
      if (!subMap) return
      const loc = subMap.locations[locationId]
      if (loc) loc.notes = notes
    },

    restoreFromBackup(atlas: PersistentAtlas) {
      this.locations = atlas.locations ?? {}
      this.aerialLocations = atlas.aerialLocations ?? {}
      this.undergroundLocations = atlas.undergroundLocations ?? {}
      this.subMaps = atlas.subMaps ?? {}
      this.sessions = atlas.sessions ?? []
      this.activeSessionId = atlas.activeSessionId ?? null
      saveAtlas(atlas)
    },
  },
})
