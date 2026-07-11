import type { PersistentAtlas } from '../types'

const STORAGE_KEY = 'vantage-atlas'
export const CURRENT_VERSION = 6

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

export function parseBackup(raw: string): { atlas: PersistentAtlas; wasReset: boolean } | null {
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

export function loadAtlas(): { atlas: PersistentAtlas; wasReset: boolean } | null {
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

function emptyAtlas(): PersistentAtlas {
  return { version: CURRENT_VERSION, locations: {}, sessions: [], activeSessionId: null }
}

function migrate(atlas: PersistentAtlas): { atlas: PersistentAtlas; wasReset: boolean } {
  const a = atlas as any

  // Schema versions before 6 used a per-layer collection model (locations /
  // aerialLocations / undergroundLocations / subMaps) that was replaced by a
  // single unified `locations` collection with a `layer` tag per location.
  // There is no supported path to carry that data forward, so old saves are
  // discarded rather than transformed.
  if ((a.version ?? 0) < 6) {
    return { atlas: emptyAtlas(), wasReset: true }
  }

  return { atlas: { ...a, version: CURRENT_VERSION }, wasReset: false }
}
