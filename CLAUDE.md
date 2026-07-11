# Vantage Companion App

A browser-based tablet companion for the board game *Vantage*. Players record map progress during a game and accumulate a persistent atlas across multiple games.

Read `docs/vantage-mapper-design.md` before making significant architectural decisions.

---

## Tech Stack

- **Language:** TypeScript (strict mode)
- **UI framework:** Vue 3, Composition API and `<script setup>` — no Options API
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
    MapGrid.vue     # main map canvas, shared by every layer tab
    LocationDetail.vue
    SessionManager.vue
    JumpToLocation.vue
  types/
    index.ts        # all shared TypeScript types
  utils/
    layout.ts       # BFS graph traversal to compute display coordinates
    storage.ts      # localStorage serialization, versioning, and migration
docs/
  vantage-mapper-design.md
```

---

## Key Invariants

- Location IDs are always 3-digit zero-padded strings (`"042"`, not `42`), and shared across a single global namespace — no two locations anywhere in the atlas, on any layer, share an ID.
- All locations live in one `locations: Record<LocationId, Location>` collection; each `Location` carries a `layer` field (`surface` | `aerial` | `underground` | `interior` | `city`). There are no per-layer collections or sub-map records.
- The atlas is a directed graph; locations have no stored coordinates. Display positions are computed at render time by BFS from the display center, scoped to the active layer — traversal does not cross into a location on a different layer, though the crossing exit itself is still recorded in the graph and rendered as a cross-layer marker.
- `actionTaken` is per-session and can be toggled freely within that session.
- The `version` field in `PersistentAtlas` must be incremented whenever the schema changes, with a migration function added to `storage.ts`.
- `<MapGrid>` must never read from localStorage directly — all data flows through stores.
- Reverse exits are auto-populated via a regular (non-departure) exit when: (a) the destination is newly created, or (b) the destination already exists but its exit in the opposite direction is currently null. If the destination already has a non-null exit in the opposite direction, it is left untouched. The same rule applies to `connections` (action-based, non-compass links to another layer, e.g. a dig or an entrance), keyed by destination layer instead of compass direction.
