import type { PersistentAtlas } from '../types'

const STORAGE_KEY = 'vantage-atlas'
export const CURRENT_VERSION = 1

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
  // Future migrations go here as the version increments.
  // Each block should transform from version N to N+1.
  return { ...atlas, version: CURRENT_VERSION }
}
