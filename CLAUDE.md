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

Locations have no stored coordinates. The atlas is a directed graph where edges are directional exits (`north`, `south`, `east`, `west`). Display positions are computed at render time by a BFS traversal from the display center node, placing each neighbor one cell in the exit direction from its parent.

Never store or infer coordinates from position in any data structure. Position is a rendering concern only.

### Display viewport

`<MapGrid>` renders a 27×27 grid of fixed-size tiles. The center cell (offset `[0, 0]`) is always the **display center** (`displayCenter`), which is stored in `GameSession` and managed by `sessionStore`. It is not the same as the player's current location.

`displayCenter` is set to the session's starting location when a session is created, updated to the destination when the player teleports, and can be moved to any location via "Center map here" in `<LocationDetail>`. It does not change when the player moves between adjacent locations — the map is stable during normal play.

The BFS traversal walks the exit graph outward from `displayCenter`, assigning display offsets `(dx, dy)` in the range `[-13, 13]`. If two paths reach the same location with conflicting offsets, the first-encountered placement wins. Locations outside the viewport are not rendered but remain fully intact in the atlas — clamping is a visibility decision only.

### App entry

The app opens to a home screen with three options: start a new session, view the atlas, or view a previous session. If an active session exists, the home screen is skipped and the player resumes directly.

Starting a new session requires a name (defaults to the current date) and a starting location ID. Both `currentLocationId` and `displayCenter` are set to the starting location immediately.

### Sessions and floating subgraphs

Each session tracks `currentLocationId` (where the player is) and `displayCenter` (what the map is centered on) separately.

Sessions may have multiple disconnected subgraphs, tracked in `floatingRoots: LocationId[]`. A new root is added when the player teleports to a location not yet in the atlas. A root is removed when its subgraph merges into the main atlas (or into another floating subgraph) via a recorded exit. If the session's starting location was already in the atlas, `floatingRoots` starts empty.

Teleporting to a location already in the atlas never creates a new root — the player simply picks up within the known map.

### Exit types

```typescript
type Exit =
  | { kind: 'location'; id: LocationId }         // traversable exit to a known location
  | { kind: 'departure'; id: LocationId | null } // asterisk — destination null until taken
  | { kind: 'blocked' }                          // cannot be traversed
  | null;                                        // not yet discovered
```

### Reverse exits on location creation

When a regular exit is recorded and the destination location is new to the atlas, the reverse exit is automatically populated. For example, setting location 123's north exit to new location 222 will set 222's south exit to 123. If the destination already existed in the atlas, its exits are left untouched.

Reverse exits are not auto-populated for departures, or when recording a location via long-press (known but not visited).

### Sub-maps do not nest

Interior, aerial, and underground sub-maps are independent location graphs anchored to a main-map location. Sub-map locations use the same exit structure as main-map locations but carry no sub-map link flags — sub-maps only link back to the main map, never to further sub-maps.

`<MapGrid>` is parameterised and reused identically for both the main map and sub-maps.

---

## Data Model

All types live in `src/types/index.ts`. The canonical source of truth for the full type definitions is `docs/vantage-companion-design.md`. Key points:

- `Location` — a main-map location; exits + sub-map flags + notes; no coordinates
- `SubMapLocation` — same exit structure, no sub-map flags
- `SubMap` — container for a sub-map's location graph, anchored to a `parentId`
- `GameSession` — includes `currentLocationId`, `displayCenter`, and `floatingRoots`
- `PersistentAtlas` — the full serialized state stored under the `vantage-atlas` localStorage key; includes a `version` integer for migrations

---

## Store Responsibilities

**`atlasStore`** owns all persistent data. It loads/saves `PersistentAtlas` to localStorage and is the only store that touches storage. All mutations to locations, exits, sub-maps, and notes go through here.

**`sessionStore`** owns the active `GameSession`. It tracks `currentLocationId`, `displayCenter`, and `floatingRoots`; records visits and action flags; and manages merging of floating subgraphs into the atlas. It reads from `atlasStore` but does not write to it directly — it calls `atlasStore` actions for any atlas mutations that arise from session events.

**`uiStore`** owns ephemeral display state: selected location, open panel, active view. It exposes `displayCenter` as a computed property read from the active session. Nothing in `uiStore` is persisted.

---

## Key Invariants

- Location IDs are always 3-digit zero-padded strings (`"042"`, not `42`).
- Exits are always bidirectional in the game, but the app records each direction independently as the player discovers them — reverse exits are only auto-populated when a new location is created via a regular exit.
- `actionTaken` is per-session and once set to `true` cannot be unset within that session.
- The `version` field in `PersistentAtlas` must be incremented whenever the schema changes, and a migration function added to `storage.ts`.
- `<MapGrid>` must never read from localStorage directly — all data flows through stores.

---

## Visual Design

Design intent: clean, geometric. The map is the hero; surrounding chrome is minimal. No decorative texture.

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

### Cell rendering

Each location is a filled square. The gutter between squares is wide enough to hold two departure asterisks side by side with margin to spare.

Within the square:
- 3-digit ID centered in the upper portion
- Lower-left: `I` if the location has an interior sub-map
- Lower-right: `✓` (in `--color-action-taken`) if an action was taken this session

In the gutter:
- Regular exit: a straight line connecting the two squares
- Departure (unresolved): `*` just outside the source square edge
- Departure (resolved): `*` plus a line to the destination square
- Blocked: `×` centered in the gutter
- Unknown: nothing

Exit lines are clean, straight SVG paths — no hand-drawn or textured style.

---

## PWA / Offline

The app must work fully offline. `vite-plugin-pwa` handles service worker generation. The manifest sets `display: standalone` and `orientation: landscape`. All static assets are precached. No runtime network requests are made.
