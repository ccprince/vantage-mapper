import { defineStore } from 'pinia'
import type { LocationId } from '../types'
import { useAtlasStore } from './atlas'

export const useUiStore = defineStore('ui', {
  state: () => ({
    selectedLocationId: null as LocationId | null,
    zoomLevel: 'full' as 'full' | 'near',
  }),

  getters: {
    displayCenter(): LocationId | null {
      const atlasStore = useAtlasStore()
      return atlasStore.activeSession?.displayCenter ?? null
    },
  },
})
