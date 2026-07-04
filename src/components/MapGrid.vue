<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import type { Direction, Exit, Location, LocationId, SubMapLocation } from '../types'
import { useAtlasStore } from '../stores/atlas'
import { useUiStore } from '../stores/ui'
import { computeLayout } from '../utils/layout'

type AnyLocation = Location | SubMapLocation

const props = defineProps<{
  displayCenter?: LocationId
  readOnly?: boolean
  subMapLocations?: Record<LocationId, SubMapLocation>
}>()

const emit = defineEmits<{
  selectLocation: [id: LocationId]
  longPressLocation: [id: LocationId]
}>()

const atlasStore = useAtlasStore()
const uiStore = useUiStore()

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
const locationMap = computed<Record<LocationId, AnyLocation>>(() =>
  props.subMapLocations ?? atlasStore.locations
)

const center = computed<LocationId | null>(() =>
  props.displayCenter ?? uiStore.displayCenter ?? null
)

const layout = computed(() => {
  if (!center.value || Object.keys(locationMap.value).length === 0) {
    return new Map<LocationId, { dx: number; dy: number }>()
  }
  return computeLayout(center.value, locationMap.value)
})

const placedLocations = computed(() =>
  [...layout.value.entries()].map(([id, offset]) => ({ id, ...offset }))
)

// ── Session data ───────────────────────────────────────────────
const selectedId = computed(() => uiStore.selectedLocationId)
const visitedSet = computed(() => new Set(atlasStore.activeSession?.visitedLocations ?? []))
const actionTakenMap = computed(() => atlasStore.activeSession?.actionTaken ?? {})
const currentLocationId = computed(() => atlasStore.activeSession?.currentLocationId ?? null)

// ── Coordinate helpers ─────────────────────────────────────────
function cellLeft(dx: number) { return (dx + 13) * TILE + HALF_G }
function cellTop(dy: number)  { return (dy + 13) * TILE + HALF_G }
function cellCx(dx: number)   { return (dx + 13) * TILE + TILE / 2 }
function cellCy(dy: number)   { return (dy + 13) * TILE + TILE / 2 }

// ── Cell styling ───────────────────────────────────────────────
function cellFill(id: LocationId): string {
  if (id === selectedId.value)                          return 'var(--color-cell-selected)'
  if (!props.readOnly && visitedSet.value.has(id))      return 'var(--color-cell-visited)'
  return 'var(--color-cell-known)'
}

function isMainMapLocation(loc: AnyLocation): loc is Location {
  return 'hasInterior' in loc
}

// ── Exit lines ─────────────────────────────────────────────────
// Lines connect cell centers; cells are rendered on top, making the
// lines visible only in the gutters between cells.
type ExitLine = { x1: number; y1: number; x2: number; y2: number }

const exitLines = computed<ExitLine[]>(() => {
  const lines: ExitLine[] = []
  const drawn = new Set<string>()

  for (const { id, dx, dy } of placedLocations.value) {
    const loc = locationMap.value[id]
    if (!loc) continue

    for (const [, exit] of Object.entries(loc.exits) as [Direction, Exit][]) {
      if (!exit || exit.kind !== 'location') continue
      const tgt = exit.id
      if (!layout.value.has(tgt)) continue

      const key = [id, tgt].sort().join(':')
      if (drawn.has(key)) continue
      drawn.add(key)

      const { dx: tdx, dy: tdy } = layout.value.get(tgt)!
      lines.push({ x1: cellCx(dx), y1: cellCy(dy), x2: cellCx(tdx), y2: cellCy(tdy) })
    }
  }
  return lines
})

// ── Departure markers ──────────────────────────────────────────
// Asterisk sits in the source cell's half of the gutter.
// Resolved departures also draw a dashed line to the target.
type DepMarker = { x: number; y: number; lineX2?: number; lineY2?: number }

function departurePoint(dx: number, dy: number, dir: Direction): { x: number; y: number } {
  const dist = CELL / 2 + HALF_G / 2   // midpoint of source cell's half-gutter
  if (dir === 'north') return { x: cellCx(dx), y: cellCy(dy) - dist }
  if (dir === 'south') return { x: cellCx(dx), y: cellCy(dy) + dist }
  if (dir === 'east')  return { x: cellCx(dx) + dist, y: cellCy(dy) }
  /* west */           return { x: cellCx(dx) - dist, y: cellCy(dy) }
}

const departureMarkers = computed<DepMarker[]>(() => {
  const markers: DepMarker[] = []

  for (const { id, dx, dy } of placedLocations.value) {
    const loc = locationMap.value[id]
    if (!loc) continue

    for (const [dir, exit] of Object.entries(loc.exits) as [Direction, Exit][]) {
      if (!exit || exit.kind !== 'departure') continue

      const pt = departurePoint(dx, dy, dir)
      const marker: DepMarker = { ...pt }

      if (exit.id) {
        const tgtOffset = layout.value.get(exit.id)
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
// × drawn at gutter midpoint, deduplicated by gutter identity.
type BlkMarker = { x: number; y: number }

function gutterKey(dx: number, dy: number, dir: Direction): string {
  if (dir === 'north') return `h:${dx}:${dy - 1}`
  if (dir === 'south') return `h:${dx}:${dy}`
  if (dir === 'east')  return `v:${dy}:${dx}`
  /* west */           return `v:${dy}:${dx - 1}`
}

function gutterMid(dx: number, dy: number, dir: Direction): BlkMarker {
  if (dir === 'north') return { x: cellCx(dx), y: cellCy(dy) - TILE / 2 }
  if (dir === 'south') return { x: cellCx(dx), y: cellCy(dy) + TILE / 2 }
  if (dir === 'east')  return { x: cellCx(dx) + TILE / 2, y: cellCy(dy) }
  /* west */           return { x: cellCx(dx) - TILE / 2, y: cellCy(dy) }
}

const blockedMarkers = computed<BlkMarker[]>(() => {
  const markers: BlkMarker[] = []
  const drawn = new Set<string>()

  for (const { id, dx, dy } of placedLocations.value) {
    const loc = locationMap.value[id]
    if (!loc) continue

    for (const [dir, exit] of Object.entries(loc.exits) as [Direction, Exit][]) {
      if (!exit || exit.kind !== 'blocked') continue

      const key = gutterKey(dx, dy, dir)
      if (drawn.has(key)) continue
      drawn.add(key)

      markers.push(gutterMid(dx, dy, dir))
    }
  }
  return markers
})

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

      <!-- Blocked markers -->
      <text
        v-for="(blk, i) in blockedMarkers"
        :key="`blk-${i}`"
        :x="blk.x" :y="blk.y"
        :class="$style.blockedMark"
        dominant-baseline="middle"
        text-anchor="middle"
      >×</text>

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
          text-anchor="middle"
          dominant-baseline="middle"
        >{{ id }}</text>
        <!-- Interior sub-map indicator (lower-left) -->
        <text
          v-if="isMainMapLocation(locationMap[id]) && (locationMap[id] as Location).hasInterior"
          :x="cellLeft(dx) + 3"
          :y="cellTop(dy) + CELL - 2"
          :class="$style.cellFlag"
          dominant-baseline="auto"
        >I</text>
        <!-- Action taken (lower-right) -->
        <text
          v-if="!readOnly && actionTakenMap[id]"
          :x="cellLeft(dx) + CELL - 3"
          :y="cellTop(dy) + CELL - 2"
          :class="$style.cellActionTaken"
          dominant-baseline="auto"
          text-anchor="end"
        >✓</text>
      </g>

      <!-- Departure asterisks (in front of cells) -->
      <text
        v-for="(dep, i) in departureMarkers"
        :key="`dep-ast-${i}`"
        :x="dep.x" :y="dep.y"
        :class="$style.departureAsterisk"
        dominant-baseline="middle"
        text-anchor="middle"
      >*</text>
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
