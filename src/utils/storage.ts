import type { LayerType, PersistentAtlas } from '../types'

const STORAGE_KEY = 'vantage-atlas'
export const CURRENT_VERSION = 5

export function downloadAtlas(atlas: PersistentAtlas): void {
  const date = new Date().toISOString().slice(0, 10)
  const blob = new Blob([JSON.stringify(atlas, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `vantage-atlas-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function parseBackup(raw: string): PersistentAtlas | null {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    if (typeof parsed.version !== 'number') return null
    if (typeof parsed.locations !== 'object') return null
    return migrate(parsed as PersistentAtlas)
  } catch {
    return null
  }
}

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
  const a = atlas as any

  if ((a.version ?? 0) < 2) {
    for (const subMap of Object.values(a.subMaps ?? {})) {
      const sm = subMap as any
      if (!sm.currentLocationId) {
        sm.currentLocationId = Object.keys(sm.locations ?? {})[0] ?? ''
      }
      if (!sm.visitedLocations) {
        sm.visitedLocations = sm.currentLocationId ? [sm.currentLocationId] : []
      }
    }
  }

  if ((a.version ?? 0) < 3) {
    for (const subMap of Object.values(a.subMaps ?? {})) {
      const sm = subMap as any
      if (!sm.actionTaken) sm.actionTaken = {}
    }
  }

  if ((a.version ?? 0) < 4) {
    // Replace hasAerial/hasUnderground with aerialEntryId/undergroundEntryId on surface locations
    for (const loc of Object.values(a.locations ?? {})) {
      const l = loc as any
      delete l.hasAerial
      delete l.hasUnderground
      if (!('aerialEntryId' in l)) l.aerialEntryId = null
      if (!('undergroundEntryId' in l)) l.undergroundEntryId = null
    }

    // Remove aerial and underground sub-maps; keep only interior
    const subMaps = a.subMaps ?? {}
    for (const key of Object.keys(subMaps)) {
      const sm = subMaps[key] as any
      if (sm.type === 'aerial' || sm.type === 'underground') {
        delete subMaps[key]
      }
    }

    // Strip session-state fields from remaining (interior) sub-maps
    for (const subMap of Object.values(subMaps)) {
      const sm = subMap as any
      delete sm.currentLocationId
      delete sm.visitedLocations
      delete sm.actionTaken
    }

    // Initialize new top-level layer collections
    if (!a.aerialLocations) a.aerialLocations = {}
    if (!a.undergroundLocations) a.undergroundLocations = {}

    // Migrate each session: displayCenter → displayCenters, floatingRoots array → per-layer object
    const LAYERS: LayerType[] = ['surface', 'aerial', 'underground']
    for (const session of (a.sessions ?? []) as any[]) {
      if (!session.displayCenters) {
        session.displayCenters = {
          surface: session.displayCenter ?? null,
          aerial: null,
          underground: null,
        }
        delete session.displayCenter
      }
      if (!session.floatingRoots || Array.isArray(session.floatingRoots)) {
        session.floatingRoots = {
          surface: Array.isArray(session.floatingRoots) ? session.floatingRoots : [],
          aerial: [],
          underground: [],
        }
      }
      // Ensure all three layer keys exist
      for (const layer of LAYERS) {
        if (!(layer in session.displayCenters)) session.displayCenters[layer] = null
        if (!(layer in session.floatingRoots)) session.floatingRoots[layer] = []
      }
    }
  }

  if ((a.version ?? 0) < 5) {
    // Replace hasInterior with interiorEntryId on surface locations
    for (const loc of Object.values(a.locations ?? {})) {
      const l = loc as any
      if (!('interiorEntryId' in l)) {
        const subMapId = `${l.id}-interior`
        const subMap = (a.subMaps ?? {})[subMapId] as any
        const firstId = subMap ? Object.keys(subMap.locations ?? {})[0] ?? null : null
        l.interiorEntryId = l.hasInterior ? firstId : null
      }
      delete l.hasInterior
    }
  }

  return { ...a, version: CURRENT_VERSION }
}
