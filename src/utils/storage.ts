import type { PersistentAtlas } from '../types'

const STORAGE_KEY = 'vantage-atlas'
export const CURRENT_VERSION = 3

export function loadAtlas(): PersistentAtlas | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistentAtlas
    return migrate(parsed)
  } catch {
    return null
  }
}

export function saveAtlas(atlas: PersistentAtlas): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(atlas))
  } catch {
    // Storage quota exceeded or unavailable — silently ignore
  }
}

function migrate(atlas: PersistentAtlas): PersistentAtlas {
  if ((atlas.version ?? 0) < 2) {
    // Add currentLocationId and visitedLocations to existing sub-maps.
    for (const subMap of Object.values(atlas.subMaps ?? {})) {
      const sm = subMap as any
      if (!sm.currentLocationId) {
        const firstId = Object.keys(sm.locations ?? {})[0] ?? ''
        sm.currentLocationId = firstId
      }
      if (!sm.visitedLocations) {
        sm.visitedLocations = sm.currentLocationId ? [sm.currentLocationId] : []
      }
    }
  }
  if ((atlas.version ?? 0) < 3) {
    // Add actionTaken to existing sub-maps.
    for (const subMap of Object.values(atlas.subMaps ?? {})) {
      const sm = subMap as any
      if (!sm.actionTaken) sm.actionTaken = {}
    }
  }
  return { ...atlas, version: CURRENT_VERSION }
}
