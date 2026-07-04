<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Location, LocationId, SubMapType } from './types'
import SessionManager from './components/SessionManager.vue'
import LocationDetail from './components/LocationDetail.vue'
import MapGrid from './components/MapGrid.vue'
import SubMapView from './components/SubMapView.vue'
import JumpToLocation from './components/JumpToLocation.vue'
import { useAtlasStore } from './stores/atlas'
import { useSessionStore } from './stores/session'
import { useUiStore } from './stores/ui'

const atlasStore = useAtlasStore()
const sessionStore = useSessionStore()
const uiStore = useUiStore()

type AppView = 'home' | 'session' | 'atlas' | 'prev-sessions'

const view = ref<AppView>('home')
const showSessionManager = ref(false)
const showJumpTo = ref(false)

const selectedLocation = ref<Location | null>(null)
const activeSubMap = ref<{ type: SubMapType; parentLocationId: LocationId } | null>(null)

// Placeholder location shown while the map/store is not yet wired up
const demoLocation: Location = {
  id: '042',
  exits: {
    north: { kind: 'location', id: '041' },
    east: { kind: 'departure', id: null },
    south: null,
    west: { kind: 'blocked' },
  },
  hasInterior: true,
  hasAerial: false,
  hasUnderground: false,
  notes: '',
}

function openNewSession() {
  showSessionManager.value = true
}

function onSessionSubmit(name: string, startingLocationId: LocationId) {
  sessionStore.startSession(name, startingLocationId)
  showSessionManager.value = false
  view.value = 'session'
  selectedLocation.value = null
}

function onSelectLocation(id: LocationId) {
  const loc = atlasStore.locations[id]
  if (!loc) return
  selectedLocation.value = loc
  uiStore.selectedLocationId = id
}

function isActionTaken(id: LocationId): boolean {
  return !!atlasStore.activeSession?.actionTaken[id]
}

function onCenterMap(id: LocationId) {
  const session = atlasStore.activeSession
  if (session) session.displayCenter = id
  uiStore.selectedLocationId = id
}

function onTeleport(id: LocationId) {
  const session = atlasStore.activeSession
  if (!session) return
  if (!(id in atlasStore.locations)) atlasStore.addLocation(id)
  session.currentLocationId = id
  session.displayCenter = id
  selectedLocation.value = atlasStore.locations[id]
  uiStore.selectedLocationId = id
}

function toggleDemoPanel() {
  selectedLocation.value = selectedLocation.value ? null : demoLocation
}

function onOpenSubMap(type: SubMapType) {
  if (!selectedLocation.value) return
  activeSubMap.value = { type, parentLocationId: selectedLocation.value.id }
}

const pastSessions = computed(() =>
  atlasStore.sessions.filter(s => s.id !== atlasStore.activeSessionId)
)
</script>

<template>
  <!-- Home screen -->
  <main v-if="view === 'home'" :class="$style.home">
    <div :class="$style.homeLogo">
      <span :class="$style.homeTitle">VANTAGE</span>
      <span :class="$style.homeWordmark">Companion</span>
    </div>
    <nav :class="$style.homeNav">
      <button :class="[$style.navBtn, $style.navBtnPrimary]" @click="openNewSession">
        New Session
      </button>
      <button :class="[$style.navBtn, $style.navBtnSecondary]" @click="view = 'atlas'">
        View Atlas
      </button>
      <button :class="[$style.navBtn, $style.navBtnSecondary]" @click="view = 'prev-sessions'">
        Previous Sessions
      </button>
    </nav>

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
        <button :class="$style.headerBtn" @click="toggleDemoPanel">
          {{ selectedLocation ? 'Close panel' : 'Demo panel' }}
        </button>
        <button :class="$style.headerBtn" @click="showJumpTo = true">Jump to…</button>
        <button
          :class="[$style.headerBtn, $style.zoomBtn]"
          @click="uiStore.zoomLevel = uiStore.zoomLevel === 'full' ? 'near' : 'full'"
        >{{ uiStore.zoomLevel === 'full' ? 'Full' : 'Near' }}</button>
        <button :class="[$style.headerBtn, $style.headerBtnEnd]" @click="view = 'home'">
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
            :action-taken="isActionTaken(selectedLocation.id)"
            @close="selectedLocation = null"
            @center-map="onCenterMap"
            @teleport="onTeleport"
            @open-sub-map="onOpenSubMap"
          />
        </aside>
      </transition>
    </div>

    <JumpToLocation v-if="showJumpTo" @close="showJumpTo = false" @navigate="() => {}" />
    <SubMapView
      v-if="activeSubMap"
      :type="activeSubMap.type"
      :parent-location-id="activeSubMap.parentLocationId"
      @close="activeSubMap = null"
    />
  </div>

  <!-- Atlas view -->
  <div v-else-if="view === 'atlas'" :class="$style.appLayout">
    <header :class="$style.appHeader">
      <span :class="$style.headerSessionName">Atlas</span>
      <div :class="$style.headerActions">
        <button :class="$style.headerBtn" @click="toggleDemoPanel">
          {{ selectedLocation ? 'Close panel' : 'Demo panel' }}
        </button>
        <button :class="$style.headerBtn" @click="showJumpTo = true">Jump to…</button>
        <button
          :class="[$style.headerBtn, $style.zoomBtn]"
          @click="uiStore.zoomLevel = uiStore.zoomLevel === 'full' ? 'near' : 'full'"
        >{{ uiStore.zoomLevel === 'full' ? 'Full' : 'Near' }}</button>
        <button :class="$style.headerBtn" @click="view = 'home'">← Home</button>
      </div>
    </header>

    <div :class="$style.appBody">
      <div :class="$style.mapArea">
        <MapGrid :read-only="true" />
      </div>
      <transition name="panel">
        <aside v-if="selectedLocation" :class="$style.detailPanel">
          <LocationDetail
            :location="selectedLocation"
            :in-session="false"
            @close="selectedLocation = null"
            @center-map="onCenterMap"
            @open-sub-map="onOpenSubMap"
          />
        </aside>
      </transition>
    </div>

    <JumpToLocation v-if="showJumpTo" @close="showJumpTo = false" @navigate="() => {}" />
    <SubMapView
      v-if="activeSubMap"
      :type="activeSubMap.type"
      :parent-location-id="activeSubMap.parentLocationId"
      @close="activeSubMap = null"
    />
  </div>

  <!-- Previous sessions view -->
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
        >
          <span :class="$style.sessionItemName">{{ s.name }}</span>
          <span :class="$style.sessionItemMeta">
            Started at <span :class="$style.sessionItemId">{{ s.startingLocationId }}</span>
            &middot;
            {{ new Date(s.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
          </span>
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
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 5px;
  background: var(--color-map-surface);
  border: 1px solid var(--color-border);
}

.sessionItemName {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.sessionItemMeta {
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.sessionItemId {
  font-family: var(--font-id);
  font-size: 13px;
  color: var(--color-text);
}
</style>
