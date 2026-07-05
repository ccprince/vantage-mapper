<script setup lang="ts">
import { ref, computed } from 'vue'
import type { GameSession, LayerLocation, LayerType, Location, LocationId } from './types'
import SessionManager from './components/SessionManager.vue'
import LocationDetail from './components/LocationDetail.vue'
import LayerLocationDetail from './components/LayerLocationDetail.vue'
import SubMapLocationDetail from './components/SubMapLocationDetail.vue'
import MapGrid from './components/MapGrid.vue'
import StartSubMapModal from './components/StartSubMapModal.vue'
import JumpToLocation from './components/JumpToLocation.vue'
import { useAtlasStore } from './stores/atlas'
import { useSessionStore } from './stores/session'
import { useUiStore } from './stores/ui'
import { downloadAtlas, parseBackup, CURRENT_VERSION } from './utils/storage'

const atlasStore = useAtlasStore()
const sessionStore = useSessionStore()
const uiStore = useUiStore()

type AppView = 'home' | 'session' | 'atlas' | 'prev-sessions' | 'prev-session-map'

const view = ref<AppView>('home')
const showSessionManager = ref(false)
const showJumpTo = ref(false)

// Surface location selected on the main map
const selectedLocation = ref<Location | null>(null)
// Aerial or underground layer location selected on the main map
const selectedLayerLocation = ref<LayerLocation | null>(null)

// Interior sub-map state
const activeSubMap = ref<{ parentLocationId: LocationId } | null>(null)
const selectedSubMapLocation = ref<LayerLocation | null>(null)
const subMapDisplayCenter = ref<LocationId | undefined>(undefined)
const pendingSubMap = ref<LocationId | null>(null)  // parentLocationId awaiting interior start

const reviewedSession = ref<GameSession | null>(null)
const reviewedSessionDisplayCenters = ref<Record<LayerType, LocationId | null>>({
  surface: null, aerial: null, underground: null,
})

const restoreError = ref('')
const restoreFileInput = ref<HTMLInputElement | null>(null)

// --- Layer helpers ---

function clearSelection() {
  selectedLocation.value = null
  selectedLayerLocation.value = null
  uiStore.selectedLocationId = null
}

function switchLayer(layer: LayerType) {
  uiStore.activeLayer = layer
  clearSelection()
  // Initialize atlas browse center for the new layer if not set
  if (view.value === 'atlas' && !uiStore.atlasBrowseCenters[layer]) {
    const locs = layer === 'aerial' ? atlasStore.aerialLocations
               : layer === 'underground' ? atlasStore.undergroundLocations
               : atlasStore.locations
    uiStore.atlasBrowseCenters[layer] = Object.keys(locs)[0] ?? null
  }
}

// --- Session lifecycle ---

function openNewSession() {
  showSessionManager.value = true
}

function onSessionSubmit(name: string, startingLocationId: LocationId) {
  sessionStore.startSession(name, startingLocationId)
  showSessionManager.value = false
  uiStore.activeLayer = 'surface'
  view.value = 'session'
  clearSelection()
}

function endSession() {
  atlasStore.activeSessionId = null
  clearSelection()
  view.value = 'home'
}

function continueSession() {
  clearSelection()
  uiStore.selectedLocationId = null
  view.value = 'session'
}

// --- Location selection ---

function onSelectLocation(id: LocationId) {
  const layer = uiStore.activeLayer
  uiStore.selectedLocationId = id
  if (layer === 'surface') {
    const loc = atlasStore.locations[id]
    if (!loc) return
    selectedLocation.value = loc
    selectedLayerLocation.value = null
  } else {
    const locs = layer === 'aerial' ? atlasStore.aerialLocations : atlasStore.undergroundLocations
    const loc = locs[id]
    if (!loc) return
    selectedLayerLocation.value = loc
    selectedLocation.value = null
  }
}

// --- Session navigation ---

function onGo(id: LocationId) {
  const session = atlasStore.activeSession
  if (!session) return
  const layer = uiStore.activeLayer
  if (layer === 'surface') {
    if (!(id in atlasStore.locations)) atlasStore.addLocation(id)
    selectedLocation.value = atlasStore.locations[id]
    selectedLayerLocation.value = null
  } else {
    const layerKey = layer as 'aerial' | 'underground'
    const locs = layer === 'aerial' ? atlasStore.aerialLocations : atlasStore.undergroundLocations
    if (!(id in locs)) atlasStore.addLayerLocation(layerKey, id)
    selectedLayerLocation.value = locs[id]
    selectedLocation.value = null
  }
  session.currentLocationId = id
  if (!session.visitedLocations.includes(id)) session.visitedLocations.push(id)
  uiStore.selectedLocationId = id
}

function onJump(id: LocationId) {
  const session = atlasStore.activeSession
  if (!session) return
  const layer = uiStore.activeLayer
  if (layer === 'surface') {
    if (!(id in atlasStore.locations)) atlasStore.addLocation(id)
    session.displayCenters.surface = id
    selectedLocation.value = atlasStore.locations[id]
    selectedLayerLocation.value = null
  } else {
    const layerKey = layer as 'aerial' | 'underground'
    const locs = layer === 'aerial' ? atlasStore.aerialLocations : atlasStore.undergroundLocations
    if (!(id in locs)) atlasStore.addLayerLocation(layerKey, id)
    session.displayCenters[layer] = id
    selectedLayerLocation.value = locs[id]
    selectedLocation.value = null
  }
  session.currentLocationId = id
  if (!session.visitedLocations.includes(id)) session.visitedLocations.push(id)
  uiStore.selectedLocationId = id
}

function onJumpTo(id: LocationId) {
  onJump(id)
  showJumpTo.value = false
}

function onCenterMap(id: LocationId) {
  const session = atlasStore.activeSession
  if (session) session.displayCenters[uiStore.activeLayer] = id
  uiStore.selectedLocationId = id
}

// --- Layer navigation from surface location detail ---

function onGoToLayer(layer: 'aerial' | 'underground') {
  if (!selectedLocation.value) return
  const entryId = layer === 'aerial'
    ? selectedLocation.value.aerialEntryId
    : selectedLocation.value.undergroundEntryId
  if (!entryId) return

  uiStore.activeLayer = layer
  clearSelection()

  const session = atlasStore.activeSession
  if (session) {
    session.currentLocationId = entryId
    session.displayCenters[layer] = entryId
    if (!session.visitedLocations.includes(entryId)) session.visitedLocations.push(entryId)
    const locs = layer === 'aerial' ? atlasStore.aerialLocations : atlasStore.undergroundLocations
    if (locs[entryId]) {
      selectedLayerLocation.value = locs[entryId]
      uiStore.selectedLocationId = entryId
    }
  } else {
    // Atlas mode: center on entry location
    uiStore.atlasBrowseCenters[layer] = entryId
  }
}

// --- Interior sub-map ---

function onOpenSubMap() {
  if (!selectedLocation.value) return
  const parentLocationId = selectedLocation.value.id
  const subMapId = `${parentLocationId}-interior`
  if (atlasStore.subMaps[subMapId]) {
    const ids = Object.keys(atlasStore.subMaps[subMapId].locations)
    subMapDisplayCenter.value = ids[0]
    selectedSubMapLocation.value = null
    uiStore.selectedLocationId = null
    activeSubMap.value = { parentLocationId }
  } else {
    pendingSubMap.value = parentLocationId
  }
}

function onStartSubMap(startingLocationId: LocationId) {
  if (!pendingSubMap.value) return
  const parentLocationId = pendingSubMap.value
  atlasStore.createSubMap(parentLocationId, 'interior', startingLocationId)
  pendingSubMap.value = null
  subMapDisplayCenter.value = startingLocationId
  selectedSubMapLocation.value = null
  uiStore.selectedLocationId = null
  activeSubMap.value = { parentLocationId }

  const session = atlasStore.activeSession
  if (session) {
    session.currentLocationId = startingLocationId
    if (!session.visitedLocations.includes(startingLocationId)) {
      session.visitedLocations.push(startingLocationId)
    }
  }
}

function onSelectSubMapLocation(id: LocationId) {
  if (!activeSubMap.value) return
  const subMapId = `${activeSubMap.value.parentLocationId}-interior`
  const subMap = atlasStore.subMaps[subMapId]
  if (!subMap) return
  selectedSubMapLocation.value = subMap.locations[id] ?? null
  uiStore.selectedLocationId = id
}

function onSubMapGo(id: LocationId) {
  if (!activeSubMap.value) return
  const subMapId = `${activeSubMap.value.parentLocationId}-interior`
  const subMap = atlasStore.subMaps[subMapId]
  if (!subMap || !(id in subMap.locations)) return
  const session = atlasStore.activeSession
  if (session) {
    session.currentLocationId = id
    if (!session.visitedLocations.includes(id)) session.visitedLocations.push(id)
  }
  selectedSubMapLocation.value = subMap.locations[id]
  uiStore.selectedLocationId = id
}

function onSubMapCenterMap(id: LocationId) {
  subMapDisplayCenter.value = id
  uiStore.selectedLocationId = id
}

function closeSubMap() {
  activeSubMap.value = null
  selectedSubMapLocation.value = null
  uiStore.selectedLocationId = null
}

// --- Atlas browse ---

function enterAtlasView() {
  const sessions = atlasStore.sessions
  const lastSession = sessions[sessions.length - 1]
  if (lastSession) {
    uiStore.atlasBrowseCenters.surface = lastSession.displayCenters.surface
    uiStore.atlasBrowseCenters.aerial = lastSession.displayCenters.aerial
    uiStore.atlasBrowseCenters.underground = lastSession.displayCenters.underground
  } else {
    uiStore.atlasBrowseCenters.surface = Object.keys(atlasStore.locations)[0] ?? null
    uiStore.atlasBrowseCenters.aerial = Object.keys(atlasStore.aerialLocations)[0] ?? null
    uiStore.atlasBrowseCenters.underground = Object.keys(atlasStore.undergroundLocations)[0] ?? null
  }
  uiStore.activeLayer = 'surface'
  view.value = 'atlas'
  clearSelection()
}

function onAtlasCenterMap(id: LocationId) {
  uiStore.atlasBrowseCenters[uiStore.activeLayer] = id
  uiStore.selectedLocationId = id
}

function onAtlasGoToLayer(layer: 'aerial' | 'underground') {
  if (!selectedLocation.value) return
  const entryId = layer === 'aerial'
    ? selectedLocation.value.aerialEntryId
    : selectedLocation.value.undergroundEntryId
  if (!entryId) return
  uiStore.activeLayer = layer
  uiStore.atlasBrowseCenters[layer] = entryId
  clearSelection()
}

// --- Previous sessions ---

const pastSessions = computed(() =>
  atlasStore.sessions.filter(s => s.id !== atlasStore.activeSessionId)
)

function openPreviousSession(session: GameSession) {
  reviewedSession.value = session
  reviewedSessionDisplayCenters.value = { ...session.displayCenters }
  clearSelection()
  uiStore.activeLayer = 'surface'
  view.value = 'prev-session-map'
}

function onReviewCenterMap(id: LocationId) {
  reviewedSessionDisplayCenters.value[uiStore.activeLayer] = id
  uiStore.selectedLocationId = id
}

// --- Backup / restore ---

function downloadBackup() {
  const atlas = {
    version: CURRENT_VERSION,
    locations: atlasStore.locations,
    aerialLocations: atlasStore.aerialLocations,
    undergroundLocations: atlasStore.undergroundLocations,
    subMaps: atlasStore.subMaps,
    sessions: atlasStore.sessions,
    activeSessionId: atlasStore.activeSessionId,
  }
  downloadAtlas(atlas)
}

function triggerRestoreFile() {
  restoreError.value = ''
  restoreFileInput.value?.click()
}

function onRestoreFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const text = reader.result as string
    const parsed = parseBackup(text)
    if (!parsed) {
      restoreError.value = 'Invalid backup file.'
      return
    }
    if (!confirm('Replace all local atlas data with this backup? This cannot be undone.')) return
    atlasStore.restoreFromBackup(parsed)
    view.value = 'home'
    clearSelection()
    restoreError.value = ''
  }
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}

// --- Layer tab labels ---

const LAYER_LABELS: Record<LayerType, string> = {
  surface: 'Surface',
  aerial: 'Aerial',
  underground: 'Underground',
}
</script>

<template>
  <!-- Home screen -->
  <main v-if="view === 'home'" :class="$style.home">
    <div :class="$style.homeLogo">
      <span :class="$style.homeTitle">VANTAGE</span>
      <span :class="$style.homeWordmark">Companion</span>
    </div>
    <nav :class="$style.homeNav">
      <template v-if="atlasStore.activeSession">
        <button :class="[$style.navBtn, $style.navBtnPrimary]" @click="continueSession">
          Continue: {{ atlasStore.activeSession.name }}
        </button>
        <div :class="$style.navDivider" />
      </template>
      <button :class="[$style.navBtn, atlasStore.activeSession ? $style.navBtnSecondary : $style.navBtnPrimary]" @click="openNewSession">
        New Session
      </button>
      <button :class="[$style.navBtn, $style.navBtnSecondary]" @click="enterAtlasView">
        View Atlas
      </button>
      <button :class="[$style.navBtn, $style.navBtnSecondary]" @click="view = 'prev-sessions'">
        Previous Sessions
      </button>
      <div :class="$style.navDivider" />
      <button :class="[$style.navBtn, $style.navBtnSecondary]" @click="downloadBackup">
        Backup Atlas
      </button>
      <button :class="[$style.navBtn, $style.navBtnSecondary]" @click="triggerRestoreFile">
        Restore Atlas
      </button>
      <p v-if="restoreError" :class="$style.restoreError">{{ restoreError }}</p>
      <input
        ref="restoreFileInput"
        type="file"
        accept=".json,application/json"
        :class="$style.hiddenInput"
        @change="onRestoreFileSelected"
      />
    </nav>

    <SessionManager
      v-if="showSessionManager"
      @submit="onSessionSubmit"
      @cancel="showSessionManager = false"
    />
  </main>

  <!-- Interior sub-map view -->
  <div v-else-if="activeSubMap" :class="$style.appLayout">
    <header :class="$style.appHeader">
      <div :class="$style.subMapBreadcrumb">
        <button :class="$style.headerBtn" @click="closeSubMap">← Back</button>
        <span :class="$style.subMapTypeLabel">Interior</span>
        <span :class="$style.subMapSeparator">/</span>
        <span :class="$style.subMapParentId">{{ activeSubMap.parentLocationId }}</span>
      </div>
      <div :class="$style.headerActions">
        <button
          :class="[$style.headerBtn, $style.zoomBtn]"
          @click="uiStore.zoomLevel = uiStore.zoomLevel === 'full' ? 'near' : 'full'"
        >{{ uiStore.zoomLevel === 'full' ? 'Full' : 'Near' }}</button>
      </div>
    </header>

    <div :class="$style.appBody">
      <div :class="$style.mapArea">
        <MapGrid
          :display-center="subMapDisplayCenter"
          :sub-map-locations="atlasStore.subMaps[`${activeSubMap.parentLocationId}-interior`]?.locations"
          @select-location="onSelectSubMapLocation"
        />
      </div>
      <transition name="panel">
        <aside v-if="selectedSubMapLocation" :class="$style.detailPanel">
          <SubMapLocationDetail
            :location="selectedSubMapLocation"
            :sub-map-id="`${activeSubMap.parentLocationId}-interior`"
            :action-taken="!!atlasStore.activeSession?.actionTaken[selectedSubMapLocation.id]"
            :is-current-location="atlasStore.activeSession?.currentLocationId === selectedSubMapLocation.id"
            @close="selectedSubMapLocation = null; uiStore.selectedLocationId = null"
            @go="onSubMapGo"
            @center-map="onSubMapCenterMap"
          />
        </aside>
      </transition>
    </div>
  </div>

  <!-- Session view -->
  <div v-else-if="view === 'session'" :class="$style.appLayout">
    <header :class="$style.appHeader">
      <span :class="$style.headerSessionName">{{ atlasStore.activeSession?.name || 'Session' }}</span>
      <div :class="$style.headerActions">
        <button :class="$style.headerBtn" @click="showJumpTo = true">Jump to…</button>
        <button
          :class="[$style.headerBtn, $style.zoomBtn]"
          @click="uiStore.zoomLevel = uiStore.zoomLevel === 'full' ? 'near' : 'full'"
        >{{ uiStore.zoomLevel === 'full' ? 'Full' : 'Near' }}</button>
        <button :class="$style.headerBtn" @click="view = 'home'">Main Menu</button>
        <button :class="[$style.headerBtn, $style.headerBtnEnd]" @click="endSession">
          End Session
        </button>
      </div>
    </header>

    <div :class="$style.appBody">
      <div :class="$style.mapArea">
        <MapGrid @select-location="onSelectLocation" />
      </div>
      <transition name="panel">
        <aside v-if="selectedLocation" :class="$style.detailPanel">
          <LocationDetail
            :location="selectedLocation"
            :in-session="true"
            :is-current-location="atlasStore.activeSession?.currentLocationId === selectedLocation.id"
            :action-taken="!!atlasStore.activeSession?.actionTaken[selectedLocation.id]"
            @close="selectedLocation = null; uiStore.selectedLocationId = null"
            @go="onGo"
            @center-map="onCenterMap"
            @jump="onJump"
            @open-sub-map="onOpenSubMap"
            @go-to-layer="onGoToLayer"
          />
        </aside>
        <aside v-else-if="selectedLayerLocation" :class="$style.detailPanel">
          <LayerLocationDetail
            :location="selectedLayerLocation"
            :layer="uiStore.activeLayer as 'aerial' | 'underground'"
            :in-session="true"
            :is-current-location="atlasStore.activeSession?.currentLocationId === selectedLayerLocation.id"
            :action-taken="!!atlasStore.activeSession?.actionTaken[selectedLayerLocation.id]"
            @close="selectedLayerLocation = null; uiStore.selectedLocationId = null"
            @go="onGo"
            @center-map="onCenterMap"
            @jump="onJump"
          />
        </aside>
      </transition>
    </div>

    <!-- Layer tab bar -->
    <nav :class="$style.tabBar">
      <button
        v-for="layer in (['surface', 'aerial', 'underground'] as LayerType[])"
        :key="layer"
        :class="[$style.tab, uiStore.activeLayer === layer && $style.tabActive]"
        @click="switchLayer(layer)"
      >{{ LAYER_LABELS[layer] }}</button>
    </nav>

    <JumpToLocation v-if="showJumpTo" @close="showJumpTo = false" @navigate="onJumpTo" />
    <StartSubMapModal
      v-if="pendingSubMap"
      :parent-location-id="pendingSubMap"
      @submit="onStartSubMap"
      @cancel="pendingSubMap = null"
    />
  </div>

  <!-- Atlas view -->
  <div v-else-if="view === 'atlas'" :class="$style.appLayout">
    <header :class="$style.appHeader">
      <span :class="$style.headerSessionName">Atlas</span>
      <div :class="$style.headerActions">
        <button
          :class="[$style.headerBtn, $style.zoomBtn]"
          @click="uiStore.zoomLevel = uiStore.zoomLevel === 'full' ? 'near' : 'full'"
        >{{ uiStore.zoomLevel === 'full' ? 'Full' : 'Near' }}</button>
        <button :class="$style.headerBtn" @click="view = 'home'">← Home</button>
      </div>
    </header>

    <div :class="$style.appBody">
      <div :class="$style.mapArea">
        <MapGrid
          :display-center="uiStore.atlasBrowseCenters[uiStore.activeLayer] ?? undefined"
          :read-only="true"
          @select-location="onSelectLocation"
        />
      </div>
      <transition name="panel">
        <aside v-if="selectedLocation" :class="$style.detailPanel">
          <LocationDetail
            :location="selectedLocation"
            :in-session="false"
            @close="selectedLocation = null; uiStore.selectedLocationId = null"
            @center-map="onAtlasCenterMap"
            @open-sub-map="onOpenSubMap"
            @go-to-layer="onAtlasGoToLayer"
          />
        </aside>
        <aside v-else-if="selectedLayerLocation" :class="$style.detailPanel">
          <LayerLocationDetail
            :location="selectedLayerLocation"
            :layer="uiStore.activeLayer as 'aerial' | 'underground'"
            :in-session="false"
            @close="selectedLayerLocation = null; uiStore.selectedLocationId = null"
            @center-map="onAtlasCenterMap"
          />
        </aside>
      </transition>
    </div>

    <!-- Layer tab bar -->
    <nav :class="$style.tabBar">
      <button
        v-for="layer in (['surface', 'aerial', 'underground'] as LayerType[])"
        :key="layer"
        :class="[$style.tab, uiStore.activeLayer === layer && $style.tabActive]"
        @click="switchLayer(layer)"
      >{{ LAYER_LABELS[layer] }}</button>
    </nav>

    <StartSubMapModal
      v-if="pendingSubMap"
      :parent-location-id="pendingSubMap"
      @submit="onStartSubMap"
      @cancel="pendingSubMap = null"
    />
  </div>

  <!-- Previous session map view -->
  <div v-else-if="view === 'prev-session-map' && reviewedSession" :class="$style.appLayout">
    <header :class="$style.appHeader">
      <span :class="$style.headerSessionName">{{ reviewedSession.name }}</span>
      <div :class="$style.headerActions">
        <button :class="$style.headerBtn" @click="view = 'prev-sessions'">← Sessions</button>
        <button
          :class="[$style.headerBtn, $style.zoomBtn]"
          @click="uiStore.zoomLevel = uiStore.zoomLevel === 'full' ? 'near' : 'full'"
        >{{ uiStore.zoomLevel === 'full' ? 'Full' : 'Near' }}</button>
        <button :class="$style.headerBtn" @click="view = 'home'">Main Menu</button>
      </div>
    </header>

    <div :class="$style.appBody">
      <div :class="$style.mapArea">
        <MapGrid
          :display-center="reviewedSessionDisplayCenters[uiStore.activeLayer] ?? undefined"
          :read-only="true"
          :session-visited="reviewedSession.visitedLocations"
          :session-action-taken="reviewedSession.actionTaken"
          @select-location="onSelectLocation"
        />
      </div>
      <transition name="panel">
        <aside v-if="selectedLocation" :class="$style.detailPanel">
          <LocationDetail
            :location="selectedLocation"
            :in-session="false"
            @close="selectedLocation = null; uiStore.selectedLocationId = null"
            @center-map="onReviewCenterMap"
          />
        </aside>
        <aside v-else-if="selectedLayerLocation" :class="$style.detailPanel">
          <LayerLocationDetail
            :location="selectedLayerLocation"
            :layer="uiStore.activeLayer as 'aerial' | 'underground'"
            :in-session="false"
            @close="selectedLayerLocation = null; uiStore.selectedLocationId = null"
            @center-map="onReviewCenterMap"
          />
        </aside>
      </transition>
    </div>

    <!-- Layer tab bar -->
    <nav :class="$style.tabBar">
      <button
        v-for="layer in (['surface', 'aerial', 'underground'] as LayerType[])"
        :key="layer"
        :class="[$style.tab, uiStore.activeLayer === layer && $style.tabActive]"
        @click="switchLayer(layer)"
      >{{ LAYER_LABELS[layer] }}</button>
    </nav>
  </div>

  <!-- Previous sessions list -->
  <div v-else-if="view === 'prev-sessions'" :class="$style.simpleLayout">
    <header :class="$style.simpleHeader">
      <button :class="$style.backBtn" @click="view = 'home'">← Back</button>
      <h2 :class="$style.simpleTitle">Previous Sessions</h2>
    </header>
    <div :class="$style.sessionList">
      <p v-if="pastSessions.length === 0" :class="$style.emptyState">No previous sessions.</p>
      <ul v-else :class="$style.sessionItems">
        <li
          v-for="s in pastSessions"
          :key="s.id"
          :class="$style.sessionItem"
          @click="openPreviousSession(s)"
        >
          <div :class="$style.sessionItemMain">
            <span :class="$style.sessionItemName">{{ s.name }}</span>
            <span :class="$style.sessionItemMeta">
              Started at <span :class="$style.sessionItemId">{{ s.startingLocationId }}</span>
              &middot;
              {{ new Date(s.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
              &middot;
              {{ s.visitedLocations.length }} location{{ s.visitedLocations.length === 1 ? '' : 's' }} visited
            </span>
          </div>
          <span :class="$style.sessionItemArrow">›</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style>
.panel-enter-active,
.panel-leave-active {
  transition: width 0.2s ease, opacity 0.2s ease;
  overflow: hidden;
}
.panel-enter-from,
.panel-leave-to {
  width: 0;
  opacity: 0;
}
.panel-enter-to,
.panel-leave-from {
  width: 320px;
  opacity: 1;
}
</style>

<style module>
/* --- Home screen --- */
.home {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
  gap: 48px;
}

.homeLogo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.homeTitle {
  font-family: var(--font-id);
  font-size: 52px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--color-text);
  line-height: 1;
}

.homeWordmark {
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.homeNav {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 260px;
}

.navDivider {
  height: 1px;
  background: var(--color-border);
  margin: 4px 0;
}

.navBtn {
  width: 100%;
  padding: 13px 0;
  border-radius: 5px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.03em;
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.navBtnPrimary {
  background: var(--color-btn-primary-bg);
  border-color: var(--color-btn-primary-bg);
  color: var(--color-text);
}
.navBtnPrimary:hover {
  background: var(--color-btn-primary-hover);
  border-color: var(--color-btn-primary-hover);
}

.navBtnSecondary {
  background: transparent;
  border-color: var(--color-border);
  color: var(--color-text-muted);
}
.navBtnSecondary:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text);
}

.restoreError {
  margin: 0;
  font-size: 12px;
  color: var(--color-error);
  text-align: center;
}

.hiddenInput {
  display: none;
}

/* --- Shared session/atlas layout --- */
.appLayout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-bg);
  overflow: hidden;
}

.appHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 48px;
  background: var(--color-map-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.headerSessionName {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  letter-spacing: 0.02em;
}

.subMapBreadcrumb {
  display: flex;
  align-items: center;
  gap: 10px;
}

.subMapTypeLabel {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.subMapSeparator {
  color: var(--color-text-dim);
  font-size: 14px;
}

.subMapParentId {
  font-family: var(--font-id);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--color-text);
}

.headerActions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.headerBtn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-muted);
  font-size: 13px;
  padding: 5px 12px;
  transition: border-color 0.15s, color 0.15s;
}
.headerBtn:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text);
}

.headerBtnEnd {
  color: var(--color-error);
  border-color: transparent;
}
.headerBtnEnd:hover {
  border-color: var(--color-error);
  color: var(--color-error);
}

.zoomBtn {
  font-variant-numeric: tabular-nums;
  min-width: 44px;
}

.appBody {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.mapArea {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.detailPanel {
  width: 320px;
  flex-shrink: 0;
  overflow: hidden;
}

/* --- Layer tab bar --- */
.tabBar {
  display: flex;
  height: 44px;
  background: var(--color-map-surface);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.tab {
  flex: 1;
  background: none;
  border: none;
  border-top: 2px solid transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: color 0.15s, border-color 0.15s;
}
.tab:hover {
  color: var(--color-text);
}
.tabActive {
  color: var(--color-cell-visited);
  border-top-color: var(--color-cell-visited);
}

/* --- Previous sessions --- */
.simpleLayout {
  min-height: 100vh;
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
}

.simpleHeader {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-map-surface);
}

.backBtn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 13px;
  padding: 0;
  transition: color 0.15s;
}
.backBtn:hover {
  color: var(--color-text);
}

.simpleTitle {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.sessionList {
  flex: 1;
  padding: 32px 24px;
}

.emptyState {
  color: var(--color-text-dim);
  font-size: 14px;
  margin: 0;
}

.sessionItems {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sessionItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 5px;
  background: var(--color-map-surface);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.sessionItem:hover {
  border-color: var(--color-text-muted);
  background: var(--color-cell-known);
}

.sessionItemMain {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.sessionItemName {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.sessionItemMeta {
  font-size: 12px;
  color: var(--color-text-muted);
}

.sessionItemId {
  font-family: var(--font-id);
  font-size: 13px;
  color: var(--color-text);
}

.sessionItemArrow {
  font-size: 20px;
  color: var(--color-text-dim);
  flex-shrink: 0;
  line-height: 1;
}
</style>
