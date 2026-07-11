<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import type { Direction, Exit, LayerType, Location, LocationId } from '../types'
import { useAtlasStore } from '../stores/atlas'
import { useUiStore } from '../stores/ui'
import { computeLayout } from '../utils/layout'

const props = defineProps<{
  displayCenter?: LocationId
  readOnly?: boolean
  sessionVisited?: LocationId[]
  sessionCurrentLocationId?: LocationId
  sessionActionTaken?: Record<LocationId, boolean>
}>()

const emit = defineEmits<{
  selectLocation: [id: LocationId]
  longPressLocation: [id: LocationId]
}>()

const atlasStore = useAtlasStore()
const uiStore = useUiStore()

const LAYER_INITIAL: Record<LayerType, string> = {
  surface: 'S', aerial: 'A', underground: 'U', interior: 'I', city: 'C',
}
const ALL_LAYERS: LayerType[] = ['surface', 'aerial', 'underground', 'interior', 'city']

// ── Constants ──────────────────────────────────────────────────
const TILE = 48        // px between cell origins (includes gutter)
const CELL = 32        // cell square size
const HALF_G = (TILE - CELL) / 2   // 8px half-gutter
const GRID = 27
const SVG_SIZE = GRID * TILE   // 1296
// Center cell SVG midpoint (grid origin = offset 0 maps to column/row 13)
const CENTER_SVG = 13 * TILE + TILE / 2   // 648
const NEAR_RADIUS = 5   // cells in each direction for 'near' zoom
const NEAR_SIZE = (NEAR_RADIUS * 2 + 1) * TILE   // 528
const NEAR_ORIGIN = CENTER_SVG - (NEAR_RADIUS + 0.5) * TILE   // 384

const viewBox = computed(() => {
  if (uiStore.zoomLevel === 'near') {
    return `${NEAR_ORIGIN} ${NEAR_ORIGIN} ${NEAR_SIZE} ${NEAR_SIZE}`
  }
  return `0 0 ${SVG_SIZE} ${SVG_SIZE}`
})

// ── Background grid positions ──────────────────────────────────
// In 'near' mode only render the (2R+1)² inner cells; full mode renders 27×27.
const bgCells = computed(() => {
  const cells: Array<{ row: number; col: number }> = []
  const lo = uiStore.zoomLevel === 'near' ? 13 - NEAR_RADIUS : 0
  const hi = uiStore.zoomLevel === 'near' ? 13 + NEAR_RADIUS : GRID - 1
  for (let row = lo; row <= hi; row++) {
    for (let col = lo; col <= hi; col++) {
      cells.push({ row, col })
    }
  }
  return cells
})

// ── Data sources ───────────────────────────────────────────────
const center = computed<LocationId | null>(() =>
  props.displayCenter ?? uiStore.displayCenter ?? null
)

const layout = computed(() => {
  if (!center.value || Object.keys(atlasStore.locations).length === 0) {
    return { placed: new Map<LocationId, { dx: number; dy: number }>(), crossLayerExits: [] }
  }
  return computeLayout(center.value, atlasStore.locations, uiStore.activeLayer)
})

const placedLocations = computed(() =>
  [...layout.value.placed.entries()].map(([id, offset]) => ({ id, ...offset }))
)

function locationAt(id: LocationId): Location | undefined {
  return atlasStore.locations[id]
}

// ── Session data ───────────────────────────────────────────────
const selectedId = computed(() => uiStore.selectedLocationId)
const visitedSet = computed(() =>
  props.sessionVisited
    ? new Set(props.sessionVisited)
    : new Set(atlasStore.activeSession?.visitedLocations ?? [])
)
const actionTakenMap = computed(() =>
  props.sessionActionTaken ?? atlasStore.activeSession?.actionTaken ?? {}
)
const currentLocationId = computed(() =>
  props.sessionCurrentLocationId ?? atlasStore.activeSession?.currentLocationId ?? null
)

// ── Coordinate helpers ─────────────────────────────────────────
function cellLeft(dx: number) { return (dx + 13) * TILE + HALF_G }
function cellTop(dy: number)  { return (dy + 13) * TILE + HALF_G }
function cellCx(dx: number)   { return (dx + 13) * TILE + TILE / 2 }
function cellCy(dy: number)   { return (dy + 13) * TILE + TILE / 2 }

// ── Cell styling ───────────────────────────────────────────────
function cellState(id: LocationId): 'selected' | 'visited' | 'known' {
  if (id === selectedId.value) return 'selected'
  if (visitedSet.value.has(id) && (!props.readOnly || props.sessionVisited)) return 'visited'
  return 'known'
}

function cellFill(id: LocationId): string {
  const s = cellState(id)
  if (s === 'selected') return 'var(--color-cell-selected)'
  if (s === 'visited')  return 'var(--color-cell-visited)'
  return 'var(--color-cell-known)'
}

function cellIdFill(id: LocationId): string {
  const s = cellState(id)
  if (s === 'selected') return 'var(--color-cell-selected-fg)'
  if (s === 'visited')  return 'var(--color-cell-visited-fg)'
  return 'var(--color-text)'
}

function cellFlagFill(id: LocationId): string {
  const s = cellState(id)
  if (s === 'selected') return 'var(--color-cell-selected-fg)'
  if (s === 'visited')  return 'var(--color-cell-visited-fg)'
  return 'var(--color-text-muted)'
}

function cellActionFill(id: LocationId): string {
  const s = cellState(id)
  if (s === 'selected') return 'var(--color-cell-selected-action)'
  if (s === 'visited')  return 'var(--color-cell-visited-action)'
  return 'var(--color-action-taken)'
}

// ── Connection badges (lower-left) ──────────────────────────────
// One small letter per other layer this location has a recorded connection to.
type Badge = { layer: LayerType; resolved: boolean }

function connectionBadges(id: LocationId): Badge[] {
  const loc = locationAt(id)
  if (!loc) return []
  const badges: Badge[] = []
  for (const layer of ALL_LAYERS) {
    if (layer === loc.layer) continue
    const exit = loc.connections[layer]
    if (!exit) continue
    const resolved = exit.kind === 'location' || (exit.kind === 'departure' && !!exit.id)
    badges.push({ layer, resolved })
  }
  return badges
}

// ── Exit lines ─────────────────────────────────────────────────
// Lines connect cell centers; cells are rendered on top, making the
// lines visible only in the gutters between cells.
type ExitLine = { x1: number; y1: number; x2: number; y2: number }

const exitLines = computed<ExitLine[]>(() => {
  const lines: ExitLine[] = []
  const drawn = new Set<string>()

  for (const { id, dx, dy } of placedLocations.value) {
    const loc = locationAt(id)
    if (!loc) continue

    for (const [, exit] of Object.entries(loc.exits) as [Direction, Exit][]) {
      if (!exit || exit.kind !== 'location') continue
      const tgt = exit.id
      if (!layout.value.placed.has(tgt)) continue

      const key = [id, tgt].sort().join(':')
      if (drawn.has(key)) continue
      drawn.add(key)

      const { dx: tdx, dy: tdy } = layout.value.placed.get(tgt)!
      lines.push({ x1: cellCx(dx), y1: cellCy(dy), x2: cellCx(tdx), y2: cellCy(tdy) })
    }
  }
  return lines
})

// ── Departure markers ──────────────────────────────────────────
// Asterisk sits in the source cell's half of the gutter.
// Resolved departures also draw a dashed line to the target.
type DepMarker = { x: number; y: number; lineX2?: number; lineY2?: number }

function edgePoint(dx: number, dy: number, dir: Direction): { x: number; y: number } {
  const dist = CELL / 2 + HALF_G / 2   // midpoint of source cell's half-gutter
  if (dir === 'north') return { x: cellCx(dx), y: cellCy(dy) - dist }
  if (dir === 'south') return { x: cellCx(dx), y: cellCy(dy) + dist }
  if (dir === 'east')  return { x: cellCx(dx) + dist, y: cellCy(dy) }
  /* west */           return { x: cellCx(dx) - dist, y: cellCy(dy) }
}

const departureMarkers = computed<DepMarker[]>(() => {
  const markers: DepMarker[] = []

  for (const { id, dx, dy } of placedLocations.value) {
    const loc = locationAt(id)
    if (!loc) continue

    for (const [dir, exit] of Object.entries(loc.exits) as [Direction, Exit][]) {
      if (!exit || exit.kind !== 'departure') continue

      const pt = edgePoint(dx, dy, dir)
      const marker: DepMarker = { ...pt }

      if (exit.id) {
        const tgtOffset = layout.value.placed.get(exit.id)
        if (tgtOffset) {
          marker.lineX2 = cellCx(tgtOffset.dx)
          marker.lineY2 = cellCy(tgtOffset.dy)
        }
      }
      markers.push(marker)
    }
  }
  return markers
})

// ── Blocked markers ────────────────────────────────────────────
// × drawn near the source cell (same positioning as departure asterisk).
// Not deduplicated: both sides of a gutter can independently be blocked.
type BlkMarker = { x: number; y: number }

const blockedMarkers = computed<BlkMarker[]>(() => {
  const markers: BlkMarker[] = []

  for (const { id, dx, dy } of placedLocations.value) {
    const loc = locationAt(id)
    if (!loc) continue

    for (const [dir, exit] of Object.entries(loc.exits) as [Direction, Exit][]) {
      if (!exit || exit.kind !== 'blocked') continue
      markers.push(edgePoint(dx, dy, dir))
    }
  }
  return markers
})

// ── Cross-layer exit markers ─────────────────────────────────────
// A regular exit whose destination lives on a different layer: traversal
// stops here, but the gutter still shows a marker naming the layer beyond.
type CrossLayerMarker = { x: number; y: number; label: string }

const crossLayerMarkers = computed<CrossLayerMarker[]>(() =>
  layout.value.crossLayerExits.map(({ id, dir, targetLayer }) => {
    const offset = layout.value.placed.get(id)
    if (!offset) return null
    const pt = edgePoint(offset.dx, offset.dy, dir)
    return { ...pt, label: LAYER_INITIAL[targetLayer] }
  }).filter((m): m is CrossLayerMarker => m !== null)
)

// ── Interaction ────────────────────────────────────────────────
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let longPressFired = false

function onCellClick(id: LocationId) {
  if (longPressFired) { longPressFired = false; return }
  emit('selectLocation', id)
}

function onPointerDown(id: LocationId) {
  if (props.readOnly) return
  longPressFired = false
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    longPressFired = true
    emit('longPressLocation', id)
  }, 600)
}

function clearLongPress() {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

onBeforeUnmount(clearLongPress)
</script>

<template>
  <div :class="$style.mapGrid">
    <svg
      :viewBox="viewBox"
      :class="$style.svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <!-- Background grid: subtle placeholders for all 27×27 positions -->
      <rect
        v-for="{ row, col } in bgCells"
        :key="`bg-${row}-${col}`"
        :x="col * TILE + HALF_G"
        :y="row * TILE + HALF_G"
        :width="CELL"
        :height="CELL"
        :class="$style.bgCell"
        rx="1"
      />

      <!-- Regular exit lines (behind cells so only gutter segments are visible) -->
      <line
        v-for="(ln, i) in exitLines"
        :key="`ln-${i}`"
        :x1="ln.x1" :y1="ln.y1"
        :x2="ln.x2" :y2="ln.y2"
        :class="$style.exitLine"
      />

      <!-- Departure resolved lines (dashed, drawn before asterisks) -->
      <template v-for="(dep, i) in departureMarkers" :key="`dep-${i}`">
        <line
          v-if="dep.lineX2 !== undefined"
          :x1="dep.x" :y1="dep.y"
          :x2="dep.lineX2" :y2="dep.lineY2"
          :class="[$style.exitLine, $style.departureLine]"
        />
      </template>

      <!-- Location cells (drawn on top, covering interior portions of exit lines) -->
      <g
        v-for="{ id, dx, dy } in placedLocations"
        :key="id"
        :class="$style.cellInteractive"
        @click="onCellClick(id)"
        @pointerdown="onPointerDown(id)"
        @pointerup="clearLongPress"
        @pointerleave="clearLongPress"
        @pointercancel="clearLongPress"
      >
        <rect
          :x="cellLeft(dx)"
          :y="cellTop(dy)"
          :width="CELL"
          :height="CELL"
          :style="{ fill: cellFill(id) }"
          rx="2"
        />
        <!-- Current location ring -->
        <rect
          v-if="!readOnly && id === currentLocationId"
          :x="cellLeft(dx) - 2"
          :y="cellTop(dy) - 2"
          :width="CELL + 4"
          :height="CELL + 4"
          fill="none"
          :class="$style.currentRing"
          rx="3"
        />
        <!-- 3-digit ID, centered vertically -->
        <text
          :x="cellLeft(dx) + CELL / 2"
          :y="cellTop(dy) + CELL / 2"
          :class="$style.cellId"
          :style="{ fill: cellIdFill(id) }"
          text-anchor="middle"
          dominant-baseline="middle"
        >{{ id }}</text>
        <!-- Connection badges (lower-left): one letter per other-layer link -->
        <text
          v-for="(badge, bi) in connectionBadges(id)"
          :key="`badge-${bi}`"
          :x="cellLeft(dx) + 3 + bi * 7"
          :y="cellTop(dy) + CELL - 2"
          :class="$style.cellFlag"
          :style="{ fill: cellFlagFill(id), opacity: badge.resolved ? 1 : 0.5 }"
          dominant-baseline="auto"
        >{{ LAYER_INITIAL[badge.layer] }}</text>
        <!-- Action taken (lower-right) -->
        <text
          v-if="!readOnly && actionTakenMap[id]"
          :x="cellLeft(dx) + CELL - 3"
          :y="cellTop(dy) + CELL - 2"
          :class="$style.cellActionTaken"
          :style="{ fill: cellActionFill(id) }"
          dominant-baseline="auto"
          text-anchor="end"
        >✓</text>
      </g>

      <!-- Departure asterisks and blocked markers (in front of cells) -->
      <text
        v-for="(dep, i) in departureMarkers"
        :key="`dep-ast-${i}`"
        :x="dep.x" :y="dep.y"
        :class="$style.departureAsterisk"
        dominant-baseline="middle"
        text-anchor="middle"
      >*</text>
      <text
        v-for="(blk, i) in blockedMarkers"
        :key="`blk-${i}`"
        :x="blk.x" :y="blk.y"
        :class="$style.blockedMark"
        dominant-baseline="middle"
        text-anchor="middle"
      >×</text>

      <!-- Cross-layer exit markers: exit leads to a location on another layer -->
      <g v-for="(cl, i) in crossLayerMarkers" :key="`cl-${i}`">
        <circle :cx="cl.x" :cy="cl.y" r="6" :class="$style.crossLayerMarker" />
        <text
          :x="cl.x" :y="cl.y"
          :class="$style.crossLayerLabel"
          dominant-baseline="middle"
          text-anchor="middle"
        >{{ cl.label }}</text>
      </g>
    </svg>
  </div>
</template>

<style module>
.mapGrid {
  width: 100%;
  height: 100%;
  background: var(--color-map-surface);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.svg {
  width: 100%;
  height: 100%;
  display: block;
}

.bgCell {
  fill: var(--color-cell-unknown);
}

.exitLine {
  stroke: var(--color-text-dim);
  stroke-width: 1.5;
  stroke-linecap: round;
}

.departureLine {
  stroke: var(--color-departure);
  stroke-dasharray: 4 3;
  opacity: 0.7;
}

.blockedMark {
  fill: var(--color-text-dim);
  font-family: var(--font-id);
  font-size: 10px;
  font-weight: 700;
}

.departureAsterisk {
  fill: var(--color-departure);
  font-family: var(--font-id);
  font-size: 10px;
  font-weight: 700;
}

.crossLayerMarker {
  fill: var(--color-map-surface);
  stroke: var(--color-departure);
  stroke-width: 1.5;
}

.crossLayerLabel {
  fill: var(--color-departure);
  font-family: var(--font-id);
  font-size: 8px;
  font-weight: 700;
  pointer-events: none;
  user-select: none;
}

.cellInteractive {
  cursor: pointer;
}

.cellInteractive:hover rect:first-child {
  filter: brightness(1.18);
}

.currentRing {
  stroke: var(--color-text);
  stroke-width: 1.5;
}

.cellId {
  fill: var(--color-text);
  font-family: var(--font-id);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  pointer-events: none;
  user-select: none;
}

.cellFlag {
  fill: var(--color-text-muted);
  font-family: var(--font-id);
  font-size: 8px;
  pointer-events: none;
  user-select: none;
}

.cellActionTaken {
  fill: var(--color-action-taken);
  font-size: 9px;
  pointer-events: none;
  user-select: none;
}
</style>
