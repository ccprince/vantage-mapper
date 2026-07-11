<script setup lang="ts">
import { ref, computed } from 'vue'
import type { GameSession, LayerType, Location, LocationId } from './types'
import SessionManager from './components/SessionManager.vue'
import LocationDetail from './components/LocationDetail.vue'
import MapGrid from './components/MapGrid.vue'
import JumpToLocation from './components/JumpToLocation.vue'
import { useAtlasStore } from './stores/atlas'
import { useSessionStore } from './stores/session'
import { useUiStore } from './stores/ui'
import { downloadAtlas, parseBackup, CURRENT_VERSION } from './utils/storage'
import { appVersion } from './utils/version'

const atlasStore = useAtlasStore()
const sessionStore = useSessionStore()
const uiStore = useUiStore()

type AppView = 'home' | 'session' | 'atlas' | 'prev-sessions' | 'prev-session-map'

const ALL_LAYERS: LayerType[] = ['surface', 'aerial', 'underground', 'interior', 'city']
const LAYER_LABELS: Record<LayerType, string> = {
  surface: 'Surface',
  aerial: 'Aerial',
  underground: 'Underground',
  interior: 'Interior',
  city: 'City',
}

const view = ref<AppView>('home')
const showSessionManager = ref(false)
const showJumpTo = ref(false)

const selectedLocation = ref<Location | null>(null)

const reviewedSession = ref<GameSession | null>(null)
const reviewedSessionDisplayCenters = ref<Record<LayerType, LocationId | null>>({
  surface: null, aerial: null, underground: null, interior: null, city: null,
})

const restoreError = ref('')
const restoreFileInput = ref<HTMLInputElement | null>(null)

// --- Layer helpers ---

function clearSelection() {
  selectedLocation.value = null
  uiStore.selectedLocationId = null
}

function firstLocationIdForLayer(layer: LayerType): LocationId | null {
  for (const loc of Object.values(atlasStore.locations)) {
    if (loc.layer === layer) return loc.id
  }
  return null
}

function switchLayer(layer: LayerType) {
  uiStore.activeLayer = layer
  clearSelection()
  // Initialize atlas browse center for the new layer if not set
  if (view.value === 'atlas' && !uiStore.atlasBrowseCenters[layer]) {
    uiStore.atlasBrowseCenters[layer] = firstLocationIdForLayer(layer)
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
  const loc = atlasStore.locations[id]
  if (!loc) return
  selectedLocation.value = loc
  uiStore.selectedLocationId = id
}

// --- Session navigation ---

function onGo(id: LocationId) {
  const session = atlasStore.activeSession
  if (!session) return
  if (!(id in atlasStore.locations)) atlasStore.addLocation(id, uiStore.activeLayer)
  const loc = atlasStore.locations[id]
  if (loc.layer !== uiStore.activeLayer) {
    uiStore.activeLayer = loc.layer
    session.displayCenters[loc.layer] = id
  }
  selectedLocation.value = loc
  session.currentLocationId = id
  if (!session.visitedLocations.includes(id)) session.visitedLocations.push(id)
  uiStore.selectedLocationId = id
}

function onJump(id: LocationId) {
  const session = atlasStore.activeSession
  if (!session) return
  if (!(id in atlasStore.locations)) atlasStore.addLocation(id, uiStore.activeLayer)
  const loc = atlasStore.locations[id]
  if (loc.layer !== uiStore.activeLayer) uiStore.activeLayer = loc.layer
  session.displayCenters[loc.layer] = id
  selectedLocation.value = loc
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

// --- Following a connection to another layer (dig, climb, enter, …) ---

function onFollowConnection(layer: LayerType) {
  if (!selectedLocation.value) return
  const targetId = selectedLocation.value.connections[layer] ?? null
  if (!targetId) return

  uiStore.activeLayer = layer
  clearSelection()

  if (view.value === 'session') {
    const session = atlasStore.activeSession
    if (!session) return
    session.currentLocationId = targetId
    session.displayCenters[layer] = targetId
    if (!session.visitedLocations.includes(targetId)) session.visitedLocations.push(targetId)
    const loc = atlasStore.locations[targetId]
    if (loc) {
      selectedLocation.value = loc
      uiStore.selectedLocationId = targetId
    }
  } else {
    uiStore.atlasBrowseCenters[layer] = targetId
  }
}

// --- Atlas browse ---

function enterAtlasView() {
  const sessions = atlasStore.sessions
  const lastSession = sessions[sessions.length - 1]
  for (const layer of ALL_LAYERS) {
    uiStore.atlasBrowseCenters[layer] = lastSession
      ? lastSession.displayCenters[layer]
      : firstLocationIdForLayer(layer)
  }
  uiStore.activeLayer = 'surface'
  view.value = 'atlas'
  clearSelection()
}

function onAtlasCenterMap(id: LocationId) {
  uiStore.atlasBrowseCenters[uiStore.activeLayer] = id
  uiStore.selectedLocationId = id
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
    atlasStore.restoreFromBackup(parsed.atlas)
    view.value = 'home'
    clearSelection()
    restoreError.value = ''
  }
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}
</script>

<template>
  <!-- One-time notice that a pre-v6 atlas couldn't be carried forward -->
  <div v-if="atlasStore.resetWarning" :class="$style.resetBanner">
    <span>Atlas data model changed — your saved atlas was reset.</span>
    <button :class="$style.resetBannerDismiss" @click="atlasStore.dismissResetWarning()">Dismiss</button>
  </div>

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

    <p :class="$style.versionInfo">v{{ appVersion }} &middot; schema {{ CURRENT_VERSION }}</p>

    <SessionManager
      v-if="showSessionManager"
      @submit="onSessionSubmit"
      @cancel="showSessionManager = false"
    />
  </main>

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
            @follow-connection="onFollowConnection"
          />
        </aside>
      </transition>
    </div>

    <!-- Layer tab bar -->
    <nav :class="$style.tabBar">
      <button
        v-for="layer in ALL_LAYERS"
        :key="layer"
        :class="[$style.tab, uiStore.activeLayer === layer && $style.tabActive]"
        @click="switchLayer(layer)"
      >{{ LAYER_LABELS[layer] }}</button>
    </nav>

    <JumpToLocation v-if="showJumpTo" @close="showJumpTo = false" @navigate="onJumpTo" />
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
            @follow-connection="onFollowConnection"
          />
        </aside>
      </transition>
    </div>

    <!-- Layer tab bar -->
    <nav :class="$style.tabBar">
      <button
        v-for="layer in ALL_LAYERS"
        :key="layer"
        :class="[$style.tab, uiStore.activeLayer === layer && $style.tabActive]"
        @click="switchLayer(layer)"
      >{{ LAYER_LABELS[layer] }}</button>
    </nav>

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
      </transition>
    </div>

    <!-- Layer tab bar -->
    <nav :class="$style.tabBar">
      <button
        v-for="layer in ALL_LAYERS"
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
/* --- Reset banner --- */
.resetBanner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 8px 16px;
  background: var(--color-departure);
  color: var(--color-bg);
  font-size: 13px;
  font-weight: 600;
}

.resetBannerDismiss {
  background: none;
  border: 1px solid currentColor;
  border-radius: 4px;
  color: inherit;
  font-size: 12px;
  padding: 2px 10px;
}

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

.versionInfo {
  margin: 0;
  font-size: 11px;
  color: var(--color-text-dim);
  letter-spacing: 0.04em;
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
