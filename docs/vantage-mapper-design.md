# Vantage Companion App — Design Document

## Overview

A browser-based tablet companion for the board game *Vantage*, enabling players to record and accumulate map knowledge across multiple play sessions. The app maintains two layers of state: a persistent **atlas** (everything discovered across all games) and a transient **session log** (what has been visited in the current game). Together these let a player navigate with accumulated knowledge while still tracking new progress.

---

## Goals

- Render the atlas as a navigable map centered on the player's current location, with known locations radiating outward by direction
- Persist map data (location IDs, connections, notes) across games as a graph of directional relationships
- Track per-session state: which locations were visited *this game*, and whether a location action was taken
- Support sub-maps: interior, aerial, and underground locations linked from main-map locations
- Work well on a tablet in landscape orientation, with touch-first interactions

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript | Type safety across a complex, nested data model |
| UI framework | Vue 3 (Composition API) | Reactive state maps naturally to incremental map discovery |
| State management | Pinia | First-class Vue integration; straightforward store composition |
| Persistence | `localStorage` (JSON) | No backend needed; data volume is small |
| Styling | CSS Modules + custom properties | Scoped styles without a framework dependency |
| Build | Vite | Fast HMR; native TypeScript support |

---

## Data Model

### Core types

```typescript
// A direction from a location
type Direction = 'north' | 'south' | 'east' | 'west';

// What a direction leads to
type Exit =
  | { kind: 'location'; id: LocationId }            // a known, traversable exit
  | { kind: 'departure'; id: LocationId | null }    // asterisk — destination unknown until the departure is taken
  | { kind: 'blocked' }                             // cannot be traversed
  | null;                                           // not yet discovered

// A three-digit location identifier, e.g. "042"
type LocationId = string;

// A location in the main atlas. No coordinates are stored — position is
// derived at render time by traversing exit relationships from a center node.
interface Location {
  id: LocationId;
  exits: Record<Direction, Exit>;
  hasInterior: boolean;
  hasAerial: boolean;
  hasUnderground: boolean;
  notes: string;
  discoveredInGame: GameId | null;   // first session in which this location was recorded
}

// A sub-map (interior, aerial, or underground) anchored to a main-map location.
// Sub-maps use the same Location structure but do not link to further sub-maps.
type SubMapType = 'interior' | 'aerial' | 'underground';

interface SubMap {
  id: string;                          // e.g. "042-interior"
  parentId: LocationId;
  type: SubMapType;
  locations: Record<LocationId, SubMapLocation>;
}

// A location within a sub-map. Same exit graph structure as a main Location,
// but carries no sub-map link flags (sub-maps do not nest).
interface SubMapLocation {
  id: LocationId;
  exits: Record<Direction, Exit>;
  notes: string;
  discoveredInGame: GameId | null;
}

// An identifier for a play session
type GameId = string;   // e.g. ISO timestamp of session start

// Per-session state for one location
interface SessionLocationState {
  locationId: LocationId | string;   // grid or sub-location id
  visited: boolean;
  actionTaken: boolean;
}

// A full play session
interface GameSession {
  id: GameId;
  startedAt: string;              // ISO 8601
  label?: string;                 // optional player-supplied name
  currentLocationId: LocationId | null;   // the location the player is standing on; centers the map
  sessionGraphRootId: LocationId | null;  // first location entered this session (anchor before atlas merge)
  locationStates: Record<string, SessionLocationState>;
}
```

### Persistence shape

All data lives under a single `localStorage` key (`vantage-atlas`) as a serialized JSON object:

```typescript
interface PersistentAtlas {
  version: number;
  locations: Record<LocationId, Location>;
  subMaps: Record<string, SubMap>;        // keyed by SubMap.id, e.g. "042-interior"
  sessions: GameSession[];
  activeSessionId: GameId | null;
}
```

A migration utility checks `version` on load and applies forward-only transforms if the schema changes.

---

## Application State (Pinia stores)

### `atlasStore`

Owns all persistent data. Responsible for:

- Loading/saving to `localStorage`
- CRUD on locations and sub-maps
- Querying: which location lies in a given direction from a given location; sub-maps for a parent
- Deriving display state: which locations are known, which have been visited this session

### `sessionStore`

Owns the active `GameSession`. Responsible for:

- Starting, ending, and selecting sessions
- Tracking `currentLocationId` — updated whenever the player moves to a new location
- Recording a visit (sets `visited: true`)
- Recording a location action (sets `actionTaken: true`)
- Managing session graph state: tracking whether the session's explored locations have been merged into the atlas (see Session Graph and Atlas Merge below)
- Querying: was location X visited this session? Was the action taken?

### `uiStore`

Ephemeral UI state only. Responsible for:

- Currently selected location (for the detail panel)
- Active view (main map, sub-map, location detail panel)
- The **display center** — normally `currentLocationId`, but overridable via "jump to location"
- Whether the detail panel is open

---

## Views and Components

### Main layout

The app runs as a single-page application with three persistent zones:

```
┌───────────────────────────────────────────────────┐
│  Header: session selector | new session | app name │
├──────────────────────────────┬────────────────────┤
│                              │                     │
│        Map Canvas            │   Detail Panel      │
│      (primary area)          │   (slide-in)        │
│                              │                     │
└──────────────────────────────┴────────────────────┘
```

The detail panel slides in from the right when a location is selected, and can be dismissed. On smaller tablets the panel overlays the map rather than sitting beside it.

---

### `<MapGrid>`

Renders a 25×25 display grid (12 cells in each direction from center) as a square grid of fixed-size tiles. The center cell always represents the **display center location** — the player's current location during an active session, or any chosen location when browsing between sessions.

**Layout algorithm:**

The renderer performs a breadth-first traversal of the atlas graph starting from the center location. Each traversed exit places the neighboring location one cell in the corresponding direction from its parent. Display coordinates `(dx, dy)` are offsets from center, clamped to the ±12 range. Locations that would fall outside the viewport are skipped.

If two graph paths lead to the same location with conflicting display coordinates, the first-encountered placement wins. This can happen due to the wrapping nature of the underlying game map, and is an acceptable approximation — the graph topology is always correct even if the visual layout has rare inconsistencies at long range.

Locations that are part of the current session's unmerged subgraph (see Session Graph and Atlas Merge) are laid out from the session's own root, independently of the atlas.

**Cell states (visual encoding):**

| State | Appearance |
|---|---|
| Empty (no known location) | Blank, muted grid line |
| Known (prior game only) | Filled, dim palette |
| Known + visited this session | Filled, full-brightness palette |
| Current location | Distinct highlight (player position marker) |
| Selected | Highlighted ring |

Each known cell displays:
- The location ID (3-digit number), small, top-left
- Exit indicators on each edge (line for a passage, `×` for blocked, `*` for an unresolved departure, `*`+arrow for a resolved departure)
- Icons for interior / aerial / underground links (if present)

**Touch interactions:**
- Tap a known cell to select it and open the detail panel
- Tap an empty cell adjacent to a known location to begin recording a new location there
- Tap the current location to open its detail panel
- Tap again (or tap elsewhere) to deselect

There is no manual panning. The map recenters automatically when the player moves (updates `currentLocationId`), or when the player uses "jump to location."

---

### `<SubMapView>`

Activated when a location with an interior, aerial, or underground link is open and the player taps one of those sub-map icons. Renders as a modal overlay containing a `<MapGrid>` instance bound to the sub-map's own location graph. The same centered-on-current-location rendering applies: if the player is inside the sub-map, their current sub-map location is centered; otherwise the sub-map's most recently visited location is used. Sub-map locations do not link to further sub-maps; their exits lead only to other sub-map locations or back to the main map. `<MapGrid>` is parameterised by a location collection and atlas context, and is reused identically for both the main map and all sub-maps.

---

### `<LocationDetail>`

A panel (right sidebar or overlay) showing everything about the selected location:

- **ID** and a "Set as current location" button (centers the map on this location and marks it as the player's position)
- **Exit editor:** for each direction, a control to record what was found (another location ID, departure, blocked, or unknown). A departure exit has two sub-states: **unresolved** (the asterisk is known but the destination is not yet recorded) and **resolved** (the player has taken the departure and recorded the destination ID). Saves immediately on change. For main-map locations, exits may also link to a sub-map (interior, aerial, or underground). For sub-map locations, exits lead only to other locations within the same sub-map or back to the main map.
- **Sub-map links** (main-map locations only)**:** buttons to navigate to interior, aerial, or underground views; toggles to mark whether each exists
- **Session state:**
  - "Visited this game" checkbox (auto-checked on selection, but can be toggled)
  - "Action taken" checkbox (once checked, disabled for the rest of the session)
- **Notes:** a free-text textarea, autosaved on blur

---

### `<SessionManager>`

Accessible from the header. Allows the player to:

- View all past sessions (by label or start date)
- Start a new session (clears session-local state, preserves atlas)
- Select a past session to review (read-only; no edits to session state)
- Label the current session

### `<JumpToLocation>`

A persistent search control (accessible from the header or map toolbar) that accepts a location ID and recenters the map display on that location without changing the player's actual current location. Available during active sessions and between sessions. Between sessions this is the primary way to navigate the atlas.

---

## Map Discovery Flow

1. Player taps an empty display cell adjacent to a known location.
2. App prompts: "Record new location here?" with a 3-digit ID input field.
3. Player enters the ID from the game tile.
4. If this ID already exists in the atlas, the exit on the source location is linked to it — this is how the current session's subgraph merges with the atlas (see below).
5. If the ID is new, a new `Location` is created, the exit from the source is recorded, and the new location is marked as visited this session.
6. The player can fill in the new location's other exits from the detail panel as they explore.

The player can also long-press an empty display cell to record a location as known but not yet entered (the exit is recorded, the location exists in the atlas, but it is not marked as visited this session).

---

## Session Graph and Atlas Merge

Each session begins with a blank slate: no current location, no session subgraph. When the player records their first location of the session, it becomes the **session graph root** — a floating island with no connection to the rest of the atlas.

As the player explores outward from that root, new locations are added to the session subgraph. All of these may already exist in the atlas (if previously visited in another game) or may be new discoveries — in either case, the exit relationships recorded this session are added to the atlas immediately.

**The merge moment** occurs when the player records an exit that points to a location already in the atlas, from a location that is currently in the unmerged session subgraph. At that point, the two graphs are connected: the session subgraph is no longer floating, and the map can now be rendered relative to the full atlas.

Until the merge, the map is rendered centered on the session graph root, showing only the locations discovered so far this session. After the merge, the full atlas becomes visible, and the display centers on the player's current location as normal.

It is also possible that the merge never happens in a given session — the player may explore an entirely new area without ever reconnecting to known territory. In this case, the session's locations are still added to the atlas as a disconnected component, and will become reachable once a future session connects them.

---

## Session Lifecycle

```
App opens
    │
    ├─ No sessions exist ──► Prompt: "Start your first game"
    │
    └─ Sessions exist
           │
           ├─ Active session ──► Resume in progress
           │
           └─ No active session ──► Show session list; user picks or starts new
```

Ending a session:
- Player taps "End game" in the `<SessionManager>`
- Session is archived; `activeSessionId` is set to `null`
- All atlas data (location IDs, exits, sub-locations, notes) persists
- Per-session state (visited flags, action flags) is frozen in the archived session record

---

## Visual Design Direction

The app draws from the aesthetic of aged expedition cartography — nautical charts, planetary survey maps, ink-on-vellum draftsmanship — filtered through a crisp, low-noise tablet UI. The map itself is the hero; all chrome around it stays quiet.

**Palette:**

| Role | Color |
|---|---|
| Background | `#1a1c22` (deep charcoal) |
| Map surface | `#23262f` |
| Unknown cell | `#2a2d38` |
| Known cell (prior game) | `#3a4a5c` |
| Known cell (this session) | `#5b8fa8` |
| Selected cell | `#a8c5d6` |
| Departure marker | `#c97a3a` (amber) |
| Text / UI | `#d4dde8` |
| Action taken accent | `#7ec88a` (muted green) |

**Typography:**
- Display / IDs: a monospaced face (`JetBrains Mono` or `IBM Plex Mono`) — the 3-digit numbers should read like instrument readouts
- Body / labels: `Inter` — neutral and legible at small sizes on a tablet

**Signature element:** exit lines on grid cells are rendered as thin, slightly-imperfect SVG paths with a very subtle ink texture — not pixel-perfect machine lines, but suggesting a hand-annotated map. This single textural touch distinguishes the map from a spreadsheet grid without adding visual clutter.

---

## Future Considerations (Out of Scope v1)

- **Cloud sync** across devices (would require a backend or a sync service)
- **Export** to PDF / image for sharing
- **Multi-player** shared atlas (collaborative discovery)
- **Search** by location ID across the atlas
- **Statistics** panel: total locations discovered, sessions played, map completion estimate

---

## Offline Support (PWA)

The app is packaged as a Progressive Web App so it can be installed on a tablet and used without a network connection at the game table.

Required additions to the Vite project:

- **`vite-plugin-pwa`** — generates the service worker and manifest automatically from config
- **`manifest.webmanifest`** — declares app name, icons, `display: standalone`, and `orientation: landscape`
- **Cache strategy** — all static assets (JS, CSS, fonts) use a `CacheFirst` strategy; no network requests are made at runtime, so no runtime caching rules are needed beyond the precache manifest

```typescript
// vite.config.ts (addition)
import { VitePWA } from 'vite-plugin-pwa';

VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'Vantage Atlas',
    short_name: 'Vantage',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#1a1c22',
    theme_color: '#1a1c22',
    icons: [/* 192×192 and 512×512 PNG */],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
  },
})
```

On first load the service worker precaches all assets. Subsequent loads — including fully offline — are served from cache. `localStorage` data is already local-only, so persistence requires no additional work.
