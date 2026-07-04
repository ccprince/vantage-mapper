# Vantage Companion App

A browser-based tablet companion for the board game *Vantage*. Players use it to record map progress during a game and accumulate a persistent atlas of location knowledge across multiple games.

Full design documentation is in `docs/vantage-companion-design.md`. Read it before making significant architectural decisions.

---

## Tech Stack

- **Language:** TypeScript (strict mode)
- **UI framework:** Vue 3, Composition API and `<script setup>` throughout — no Options API
- **State management:** Pinia
- **Build tool:** Vite
- **Styling:** CSS Modules + CSS custom properties — no utility framework
- **PWA:** `vite-plugin-pwa` with Workbox for offline support

---

## Project Structure

```
src/
  stores/
    atlas.ts        # atlasStore — all persistent map data
    session.ts      # sessionStore — active game session
    ui.ts           # uiStore — ephemeral display state
  components/
    MapGrid.vue     # main map canvas, reused for sub-maps
    SubMapView.vue  # modal overlay wrapping MapGrid for a sub-map
    LocationDetail.vue
    SessionManager.vue
    JumpToLocation.vue
  types/
    index.ts        # all shared TypeScript types (Direction, Exit, Location, etc.)
  utils/
    layout.ts       # BFS graph traversal to compute display coordinates
    storage.ts      # localStorage serialization, versioning, and migration
docs/
  vantage-companion-design.md
```

---

## Core Concepts

### The atlas is a graph, not a grid

Locations have no stored coordinates. The atlas is a directed graph where edges are directional exits (`north`, `south`, `east`, `west`). Display positions are computed at render time by a BFS traversal from a center node, placing each neighbor one cell in the exit direction from its parent.

Never store or infer coordinates from position in any data structure. Position is a rendering concern only.

### Display viewport

`<MapGrid>` renders a 25×25 grid of fixed-size tiles. The center cell (offset `[0, 0]`) is always the **display center location**. During an active session this is the player's current location; otherwise it is whatever location the user has chosen to center on via `<JumpToLocation>`.

The BFS traversal in `layout.ts` walks the exit graph outward from the center, assigning display offsets `(dx, dy)` in the range `[-12, 12]`. If two paths reach the same location with conflicting offsets, the first-encountered placement wins.

### Sessions start disconnected

Each session begins with no current location. The first location recorded becomes the **session graph root** — a floating subgraph unconnected to the rest of the atlas. The session merges with the atlas the moment the player records an exit pointing to a location ID that already exists in the atlas. Before the merge, only the session's own locations are visible on the map.

### Exit types

```typescript
type Exit =
  | { kind: 'location'; id: LocationId }         // traversable exit to a known location
  | { kind: 'departure'; id: LocationId | null } // asterisk — destination null until taken
  | { kind: 'blocked' }                          // cannot be traversed
  | null;                                        // not yet discovered
```

A `departure` with `id: null` is unresolved (asterisk visible, destination unknown). Once the player takes the departure and records the destination, `id` is populated. A resolved departure participates in graph traversal and atlas merging the same way a `location` exit does.

### Sub-maps do not nest

Interior, aerial, and underground sub-maps are independent location graphs anchored to a main-map location. Sub-map locations use the same exit structure as main-map locations but carry no sub-map link flags — sub-maps only link back to the main map, never to further sub-maps.

`<MapGrid>` is parameterised and reused identically for both the main map and sub-maps.

---

## Data Model

All types live in `src/types/index.ts`. The canonical source of truth for the full type definitions is `docs/vantage-companion-design.md`. Key points:

- `Location` — a main-map location; exits + sub-map flags + notes; no coordinates
- `SubMapLocation` — same exit structure, no sub-map flags
- `SubMap` — container for a sub-map's location graph, anchored to a `parentId`
- `GameSession` — includes `currentLocationId` (player position) and `sessionGraphRootId` (pre-merge anchor)
- `PersistentAtlas` — the full serialized state stored under the `vantage-atlas` localStorage key; includes a `version` integer for migrations

---

## Store Responsibilities

**`atlasStore`** owns all persistent data. It loads/saves `PersistentAtlas` to localStorage and is the only store that touches storage. All mutations to locations, exits, sub-maps, and notes go through here.

**`sessionStore`** owns the active `GameSession`. It tracks `currentLocationId`, records visits and action flags, and manages the merge state. It reads from `atlasStore` but does not write to it directly — it calls `atlasStore` actions for any atlas mutations that arise from session events (e.g. creating a new location when the player enters one).

**`uiStore`** owns ephemeral display state: selected location, open panel, display center override. Nothing in `uiStore` is persisted.

---

## Key Invariants

- Location IDs are always 3-digit zero-padded strings (`"042"`, not `42`).
- Exits are always bidirectional in the game, but the app records each direction independently as the player discovers them — do not auto-populate the reverse exit.
- `actionTaken` is per-session and once set to `true` cannot be unset within that session.
- The `version` field in `PersistentAtlas` must be incremented whenever the schema changes, and a migration function added to `storage.ts`.
- `<MapGrid>` must never read from localStorage directly — all data flows through stores.

---

## Visual Design

Design intent: aged expedition cartography filtered through a clean tablet UI. The map is the hero; surrounding chrome is minimal.

CSS custom properties (defined globally):

```css
--color-bg:               #1a1c22;
--color-map-surface:      #23262f;
--color-cell-unknown:     #2a2d38;
--color-cell-known:       #3a4a5c;
--color-cell-visited:     #5b8fa8;
--color-cell-selected:    #a8c5d6;
--color-departure:        #c97a3a;
--color-text:             #d4dde8;
--color-action-taken:     #7ec88a;

--font-id:   'JetBrains Mono', 'IBM Plex Mono', monospace;
--font-body: 'Inter', sans-serif;
```

Exit lines on map cells are rendered as SVG paths with a subtle hand-drawn quality — slightly imperfect, not pixel-perfect machine lines.

---

## PWA / Offline

The app must work fully offline. `vite-plugin-pwa` handles service worker generation. The manifest sets `display: standalone` and `orientation: landscape`. All static assets are precached. No runtime network requests are made.
