# Vantage Companion App — Design Document

## Overview

A browser-based tablet companion for the board game _Vantage_, enabling players to record and accumulate map knowledge across multiple play sessions. The app maintains two layers of state: a persistent **atlas** (everything discovered across all games) and a transient **session log** (what has been visited in the current game). Together these let a player navigate with accumulated knowledge while still tracking new progress.

---

## Goals

- Render the atlas as a navigable map centered on the session's starting location, with known locations radiating outward by direction
- Persist map data (location IDs, connections, notes) across games as a graph of directional relationships
- Track per-session state: which locations were visited _this game_, and whether a location action was taken
- Support sub-maps: interior, aerial, and underground locations linked from main-map locations
- Work well on a tablet in landscape orientation, with touch-first interactions

---

## Tech Stack

| Layer              | Choice                          | Rationale                                                      |
| ------------------ | ------------------------------- | -------------------------------------------------------------- |
| Language           | TypeScript                      | Type safety across a complex, nested data model                |
| UI framework       | Vue 3 (Composition API)         | Reactive state maps naturally to incremental map discovery     |
| State management   | Pinia                           | First-class Vue integration; straightforward store composition |
| Persistence        | `localStorage` (JSON)           | No backend needed; data volume is small                        |
| Styling            | CSS Modules + custom properties | Scoped styles without a framework dependency                   |
| Build              | Vite                            | Fast HMR; native TypeScript support                            |
| Package management | pnpm                            |                                                                |

---

## Data Model

### Core types

```typescript
// A direction from a location
type Direction = "north" | "south" | "east" | "west";

// What a direction leads to
type Exit =
  | { kind: "location"; id: LocationId } // a known, traversable exit
  | { kind: "departure"; id: LocationId | null } // asterisk — destination unknown until the departure is taken
  | { kind: "blocked" } // cannot be traversed
  | null; // not yet discovered

// A three-digit location identifier, e.g. "042"
type LocationId = string;

// A location on the surface layer. No coordinates are stored — position is
// derived at render time by traversing exit relationships from a center node.
interface Location {
  id: LocationId;
  exits: Record<Direction, Exit>;
  hasInterior: boolean;
  aerialEntryId: LocationId | null;      // which aerial location this surface spot connects to
  undergroundEntryId: LocationId | null; // which underground location this surface spot connects to
  notes: string;
}

// An interior sub-map anchored to a specific surface location.
// Aerial and underground are full independent layers, not sub-maps.
type SubMapType = "interior";

interface SubMap {
  id: string; // e.g. "042-interior"
  parentId: LocationId;
  type: SubMapType;
  locations: Record<LocationId, LayerLocation>;
}

// A location in the aerial or underground layer, or inside an interior sub-map.
// Same exit graph structure as a surface Location but carries no layer-link flags.
// Location IDs are globally unique — no ID can appear in more than one layer.
interface LayerLocation {
  id: LocationId;
  exits: Record<Direction, Exit>;
  notes: string;
}

// An identifier for a play session
type GameId = string; // e.g. ISO timestamp of session start

// A full play session
interface GameSession {
  id: GameId;
  startedAt: string; // ISO 8601
  name: string; // player-supplied name; defaults to the session start date
  startingLocationId: LocationId;
  currentLocationId: LocationId; // single global current location across all layers
  displayCenters: Record<LayerType, LocationId | null>; // per-layer display center
  floatingRoots: Record<LayerType, LocationId[]>;       // per-layer disconnected subgraph roots
  visitedLocations: LocationId[]; // flat and global — IDs are unique across all layers
  actionTaken: Record<LocationId, boolean>;
}

type LayerType = "surface" | "aerial" | "underground";
```

### Persistence shape

All data lives under a single `localStorage` key (`vantage-atlas`) as a serialized JSON object:

```typescript
interface PersistentAtlas {
  version: number;
  locations: Record<LocationId, Location>;         // surface layer
  aerialLocations: Record<LocationId, LayerLocation>;
  undergroundLocations: Record<LocationId, LayerLocation>;
  subMaps: Record<string, SubMap>; // keyed by SubMap.id, e.g. "042-interior"
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
- Tracking `currentLocationId` — updated whenever the player moves to a new location or teleports
- Tracking `displayCenter` — set to the starting location on session creation; set to the destination on teleport; set to any location via "Center map here"
- Recording a visit (sets `visited: true`)
- Recording a location action (sets `actionTaken: true`)
- Managing `floatingRoots`: adding a new root when the player teleports to a location new to the atlas; removing roots when their subgraph merges into the atlas or into another floating subgraph via a recorded exit
- Querying: was location X visited this session? Was the action taken?

### `uiStore`

Ephemeral UI state only. Responsible for:

- Currently selected location (for the detail panel)
- Active view (main map, sub-map, location detail panel)
- The **display center** — read from `displayCenter` in the active session (or the reviewed session); `uiStore` does not own this value but exposes it as a computed property for components to consume
- Whether the detail panel is open

---

## Views and Components

### App entry and home screen

When the app opens, it presents a home screen rather than dropping the player directly into a map. The home screen offers three actions:

- **Start a new session** — opens the new session form (see below)
- **View the atlas** — opens the map in atlas-browse mode, with no active session; the player can navigate and inspect locations but not record new ones
- **View a previous session** — opens a session list; selecting a session shows the map as it appeared at the end of that session in read-only mode

If an active session exists when the app opens, the home screen is skipped and the player resumes directly into that session.

---

### New session form

Starting a new session requires two inputs before the session is created:

- **Session name** — free text; defaults to the current date formatted as `Month D, YYYY` (e.g. `July 4, 2026`). The player may change it.
- **Starting location** — a 3-digit location ID. This is the tile the player begins the game on.

Both fields are shown together. The session is created when the player confirms. The starting location immediately becomes `currentLocationId`. If the starting location ID is not already in the atlas, a new `Location` entry is created for it, marked as visited, and added to `floatingRoots`. If it is already in the atlas, `floatingRoots` starts empty.

---

### Main layout

The app runs as a single-page application with three persistent zones:

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: app name | session name          | End session / Main menu │
├──────────────────────────────┬──────────────────────────────────┤
│                              │                                   │
│        Map Canvas            │         Detail Panel              │
│      (primary area)          │         (slide-in)                │
│                              │                                   │
└──────────────────────────────┴───────────────────────────────────┘
```

The detail panel slides in from the right when a location is selected, and can be dismissed. On smaller tablets the panel overlays the map rather than sitting beside it.

---

### `<MapGrid>`

Renders a 27×27 display grid (13 cells in each direction from center) as a square grid of fixed-size tiles.

#### Display center

The center cell always represents the **display center** (`displayCenter`), which is independent of the player's current location. What occupies that cell on initial load depends on context:

| Context                      | Initial display center                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| Active session               | Restored from saved session state                                                         |
| Atlas-browse mode            | The last active session's saved `displayCenter`, or the atlas origin if no sessions exist |
| Previous session (read-only) | That session's saved `displayCenter`                                                      |

During an active session, `displayCenter` is set when the session starts (to the starting location) and when the player teleports (to the destination). It is not affected by ordinary movement between adjacent locations — the map stays put. The player can also move it explicitly at any time using "Center map here" in `<LocationDetail>`. The player's actual position is shown as a distinct marker wherever it falls on the grid, independent of the display center.

#### Layout algorithm

The renderer performs a breadth-first traversal of the atlas graph starting from the display center location. Each traversed exit places the neighboring location one cell in the corresponding direction from its parent. Display coordinates `(dx, dy)` are offsets from center, clamped to the ±13 range. Locations outside this range are not rendered but remain fully intact in the atlas — clamping is a visibility decision only. The player can bring any location into view by using "Center map here" on a location closer to it. This is the intended mechanism for dealing with any viewport limitation — if known locations are being clipped at the edge of the grid, the player moves the display center toward them until they come into view. No automatic wrapping or scrolling is needed.

If two graph paths lead to the same location with conflicting display coordinates, the first-encountered placement wins. This can happen due to the wrapping nature of the underlying game map, and is an acceptable approximation — the graph topology is always correct even if the visual layout has rare inconsistencies at long range.

Locations that are part of a floating subgraph (not yet connected to the main atlas) are laid out from their own root, independently of the atlas. If the player's current location is in a floating subgraph, the BFS starts from that subgraph's root and only locations reachable within it are shown. Once the subgraph merges into the atlas, the full atlas becomes visible.

#### Cell anatomy

Each location is rendered as a filled square. The grid is sized so that each cell slot — the square itself plus its surrounding gutter — accommodates two departure asterisks side by side with a small margin to spare. This gutter space is where exit indicators and departure markers live.

**Within the square:**

- The 3-digit location ID is centered in the upper portion of the square
- The lower-left corner displays `I` if the location has an interior sub-map
- The lower-right corner displays `✓` if an action has been taken there this session, rendered in the action-taken accent color

**In the gutter between squares:**

Regular (traversable) exits are drawn as a straight line connecting the edges of the two squares, running through the center of the gutter. This makes adjacency immediately readable without ambiguity about which cells are connected.

Departure exits are rendered as an asterisk placed just outside the edge of the source square, in the gutter on the appropriate side. An unresolved departure (destination unknown) shows only the asterisk. A resolved departure (destination recorded) shows the asterisk plus a line continuing to the destination square, matching the style of a regular exit line.

A blocked exit is marked with `×` centered in the gutter on that side.

An undiscovered exit shows nothing in the gutter.

#### Cell states (visual encoding)

| State                        | Appearance                                       |
| ---------------------------- | ------------------------------------------------ |
| Empty (no known location)    | No square; gutter is blank                       |
| Known (prior game only)      | Square filled with dim palette color             |
| Known + visited this session | Square filled with full-brightness palette color |
| Current location             | Square outlined with a distinct highlight ring   |
| Selected                     | Square outlined with the selected-cell color     |

#### Touch interactions

- Tap a known cell to select it and open the detail panel
- Tap an empty cell adjacent to a known location to begin recording a new location there
- Tap the current location to open its detail panel
- Tap again (or tap elsewhere) to deselect

There is no manual panning. The display center changes only on teleport or when the player explicitly uses "Center map here."

---

### Layer tab bar

A persistent tab bar at the bottom of the map views (session, atlas, previous-session) lets the player switch between the three map layers: Surface, Aerial, and Underground. Each layer is an independent directed graph with its own BFS layout, its own display center, and its own floating roots. The player's actual position (`currentLocationId`) is a single global value — the ring marker appears only on the layer that contains it.

### Interior sub-map view

Activated when the player taps "Open" on the Interior connection in a surface location's detail panel. Replaces the main map with a full-screen view bound to that interior's location graph, with a breadcrumb header and a "← Back" button. Interior locations do not link to further sub-maps. `<MapGrid>` is parameterized by a location collection and reused identically for all views.

---

### `<LocationDetail>`

A panel (right sidebar or overlay) showing everything about the selected location:

- **ID**, a **"Set as current location"** button (updates `currentLocationId` to this location without moving the display center), and a **"Center map here"** button (updates `displayCenter` to this location without changing the player's current location)

- **Exit editor:** one row per direction (north, south, east, west). Each row has:
  - A 3-digit text field for the destination location ID
  - A "Departure" toggle button
  - A "Blocked" toggle button

  At most one toggle can be active per direction. The four resulting states are:

  | Field  | Departure | Blocked | Meaning                                                             |
  | ------ | --------- | ------- | ------------------------------------------------------------------- |
  | Empty  | Off       | Off     | Unknown — exit not yet explored                                     |
  | Filled | Off       | Off     | Regular exit to the given location                                  |
  | Empty  | On        | Off     | Unresolved departure — asterisk known, destination not yet recorded |
  | Filled | On        | Off     | Resolved departure — destination recorded                           |
  | —      | Off       | On      | Blocked — cannot be traversed (field disabled)                      |

  All changes save immediately. For main-map locations, the field accepts any valid location ID; for sub-map locations, it accepts IDs within the same sub-map or the special value indicating a return to the main map.

- **Connections** (surface locations only):
  - Interior: toggle to mark existence; "Open" button to enter the interior sub-map
  - Aerial entry: 3-digit ID field recording which aerial location this surface spot connects to; "Go" button to switch to the aerial layer
  - Underground entry: same for underground

- **Session state:**
  - "Visited this game" checkbox (auto-checked on selection, but can be toggled)
  - "Action taken" checkbox (once checked, disabled for the rest of the session)

- **Notes:** a free-text textarea, autosaved on blur

---

### Header

The header displays the app name on the left and two context-sensitive elements on the right: the current context label and an action button. During an active session, a small **"Go to…"** button also appears in the header; tapping it opens a minimal modal with a single 3-digit ID field. Confirming moves `currentLocationId` to the entered location (see Teleportation below).

**During an active session:** the session name is shown as the label. The action button reads "End session." Tapping it archives the session and returns to the home screen.

**While browsing the atlas:** the label reads "Atlas." The action button reads "Main menu." Tapping it returns to the home screen. The "Go to…" button is not shown.

**While viewing a previous session:** the session name is shown as the label. The action button reads "Main menu." Tapping it returns to the home screen. The "Go to…" button is not shown.

There is no session selector in the header. All session management (starting, selecting, reviewing) is handled from the home screen.

## Map Discovery Flow

A new location can be recorded in two ways: by tapping an empty cell on the map, or by filling in an exit field in the detail panel.

**Via the map:** the player taps an empty display cell adjacent to a known location. The app prompts for a 3-digit location ID. The player enters the ID from the game tile and confirms.

**Via the exit editor:** the player types a location ID into an exit field in `<LocationDetail>`. If that ID doesn't yet exist in the atlas, the new location is created when the field is committed.

In both cases, once the destination location ID is known, the following happens:

1. If the destination ID already exists in the atlas, the exit on the source location is linked to it. If this connects a floating subgraph to the atlas, that root is removed from `floatingRoots`.
2. If the destination ID is new, a new `Location` is created and the exit from the source is recorded.
3. If the exit is a **regular exit** (not a departure) and the destination was just created, the reverse exit is automatically populated: the new location's exit in the opposite direction is set to point back to the source. For example, setting location 123's north exit to new location 222 will set 222's south exit to 123. If the destination already existed in the atlas, its exits are left untouched — they may already be recorded correctly, and overwriting them silently would be destructive.
4. If the location was reached by the player (not just noted as an adjacent known location), it is marked as visited this session.

The player can also long-press an empty display cell to record a location as known but not yet entered — the exit is recorded and the location added to the atlas, but it is not marked as visited and no reverse exit is created.

---

## Teleportation

The player can move to any location — not just adjacent ones — using the "Go to…" control in the header. This is called a teleport. The rules are:

- If the destination ID is already in the atlas, `currentLocationId` is updated to it, the location is marked as visited, no new floating root is created, and `displayCenter` is set to the destination. The map recenters on it.
- If the destination ID is new to the atlas, a new `Location` is created, marked as visited, added to the atlas, added to `floatingRoots`, and `displayCenter` is set to it. The map recenters on this new isolated location.

Teleportation to an existing atlas location effectively "reconnects" the player to the known map without any graph bookkeeping. Teleportation to a new location starts a new floating island that will eventually need to be connected via recorded exits.

---

## Session Graph and Atlas Merge

A session may have zero or more **floating subgraphs** — location graphs not yet connected to the main atlas. These are tracked in `floatingRoots`. Each entry is the root of one such subgraph.

`floatingRoots` starts with the session's starting location if it was new to the atlas, or empty if it was already known. It grows when the player teleports to a new location. It shrinks when:

- A recorded exit connects a floating subgraph to the main atlas — that root is removed from `floatingRoots` and all its locations become part of the atlas graph.
- A recorded exit connects two floating subgraphs to each other — the two roots merge into one (the earlier-created root is kept).

Until a floating subgraph merges, only locations reachable from its root are visible when the player is in that subgraph. Once merged, the full atlas is visible.

It is possible for a session to end with entries still in `floatingRoots` — the player may have explored areas that never connected to known territory. Those locations persist in the atlas as disconnected components, available to be linked up in a future session.

---

## Session Lifecycle

```
App opens
    │
    ├─ Active session exists ──► Resume directly (home screen skipped)
    │
    └─ No active session
           │
           └─ Home screen
                  │
                  ├─ "Start a new session"
                  │       │
                  │       └─ New session form (name + starting location)
                  │               │
                  │               └─ Session created ──► Map view
                  │
                  ├─ "View the atlas" ──► Map in atlas-browse mode (read-only)
                  │
                  └─ "View a previous session" ──► Session list ──► Read-only map
```

Ending a session:

- Player taps "End session" in the header
- Session is archived; `activeSessionId` is set to `null`
- All atlas data (location IDs, exits, sub-locations, notes) persists
- Per-session state (visited flags, action flags) is frozen in the archived session record
- App returns to the home screen

---

## Visual Design Direction

The map is the hero; all chrome around it stays quiet. The visual style is clean and geometric — precise lines, clear contrast, no decorative texture.

**Palette:**

| Role                      | Color                     |
| ------------------------- | ------------------------- |
| Background                | `#1a1c22` (deep charcoal) |
| Map surface               | `#23262f`                 |
| Unknown cell              | `#2a2d38`                 |
| Known cell (prior game)   | `#3a4a5c`                 |
| Known cell (this session) | `#5b8fa8`                 |
| Selected cell             | `#a8c5d6`                 |
| Departure marker          | `#c97a3a` (amber)         |
| Text / UI                 | `#d4dde8`                 |
| Action taken accent       | `#7ec88a` (muted green)   |

**Typography:**

- Display / IDs: a monospaced face (`JetBrains Mono` or `IBM Plex Mono`) — the 3-digit numbers should read like instrument readouts
- Body / labels: `Inter` — neutral and legible at small sizes on a tablet

---

## Future Considerations (Out of Scope v1)

- **Wrap-aware map rendering:** the underlying game map is toroidal (e.g. 25×26). Once the atlas contains enough connectivity data to infer the map's actual dimensions and a location's canonical grid position, the renderer could switch from the BFS viewport model to a fixed-grid model that correctly wraps locations around the edges rather than clamping them. The precondition is detecting that the graph topology is consistent with a known wrap boundary.
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
import { VitePWA } from "vite-plugin-pwa";

VitePWA({
  registerType: "autoUpdate",
  manifest: {
    name: "Vantage Atlas",
    short_name: "Vantage",
    display: "standalone",
    orientation: "landscape",
    background_color: "#1a1c22",
    theme_color: "#1a1c22",
    icons: [
      /* 192×192 and 512×512 PNG */
    ],
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,woff2,png,svg}"],
  },
});
```

On first load the service worker precaches all assets. Subsequent loads — including fully offline — are served from cache. `localStorage` data is already local-only, so persistence requires no additional work.
