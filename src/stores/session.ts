import { defineStore } from 'pinia'
import type { LocationId } from '../types'
import { useAtlasStore } from './atlas'

export const useSessionStore = defineStore('session', {
  actions: {
    toggleActionTaken(locationId: LocationId) {
      const atlasStore = useAtlasStore()
      const session = atlasStore.activeSession
      if (session) session.actionTaken[locationId] = !session.actionTaken[locationId]
    },

    startSession(name: string, startingLocationId: LocationId) {
      const atlasStore = useAtlasStore()

      const isNew = !(startingLocationId in atlasStore.locations)
      if (isNew) {
        atlasStore.addLocation(startingLocationId)
      }

      const now = new Date().toISOString()
      const session = {
        id: now,
        name,
        startedAt: now,
        startingLocationId,
        currentLocationId: startingLocationId,
        displayCenter: startingLocationId,
        floatingRoots: isNew ? [startingLocationId] : [],
        visitedLocations: [startingLocationId],
        actionTaken: {} as Record<LocationId, boolean>,
      }

      atlasStore.sessions.push(session)
      atlasStore.activeSessionId = session.id
    },
  },
})
