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
    MapGrid.vue     # main map canvas, reused for sub-maps
    SubMapView.vue  # modal overlay wrapping MapGrid for a sub-map
    LocationDetail.vue
    SessionManager.vue
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

- Location IDs are always 3-digit zero-padded strings (`"042"`, not `42`).
- The atlas is a directed graph; locations have no stored coordinates. Display positions are computed at render time by BFS from the display center.
- `actionTaken` is per-session and can be toggled freely within that session.
- The `version` field in `PersistentAtlas` must be incremented whenever the schema changes, with a migration function added to `storage.ts`.
- `<MapGrid>` must never read from localStorage directly — all data flows through stores.
- Reverse exits are auto-populated only when a new location is created via a regular (non-departure) exit. If the destination already exists, its exits are left untouched.
