import { defineStore } from 'pinia'
import type { Direction, Exit, GameSession, Location, LocationId, SubMap, SubMapLocation, SubMapType } from '../types'
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

      if (exit !== null && exit.kind === 'location') {
        const reverse = OPPOSITE[dir]
        if (createdNew || this.locations[exit.id].exits[reverse] === null) {
          this.locations[exit.id].exits[reverse] = { kind: 'location', id: locationId }
        }
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
        currentLocationId: startingLocationId,
        visitedLocations: [startingLocationId],
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

    goToSubMapLocation(subMapId: string, locationId: LocationId) {
      const subMap = this.subMaps[subMapId]
      if (!subMap || !(locationId in subMap.locations)) return
      subMap.currentLocationId = locationId
      if (!subMap.visitedLocations.includes(locationId)) {
        subMap.visitedLocations.push(locationId)
      }
    },
  },
})
