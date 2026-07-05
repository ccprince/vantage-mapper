import { defineStore } from 'pinia'
import type { LayerType, LocationId } from '../types'
import { useAtlasStore } from './atlas'

export const useUiStore = defineStore('ui', {
  state: () => ({
    selectedLocationId: null as LocationId | null,
    zoomLevel: 'full' as 'full' | 'near',
    activeLayer: 'surface' as LayerType,
    atlasBrowseCenters: {
      surface: null,
      aerial: null,
      underground: null,
    } as Record<LayerType, LocationId | null>,
  }),

  getters: {
    displayCenter(): LocationId | null {
      const atlasStore = useAtlasStore()
      return atlasStore.activeSession?.displayCenters[this.activeLayer] ?? null
    },
  },
})
