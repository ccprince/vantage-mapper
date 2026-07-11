<script setup lang="ts">
import { ref, computed, watch, useCssModule } from 'vue'
import type { Location, LocationId, Direction, Exit, LayerType } from '../types'
import { useAtlasStore } from '../stores/atlas'
import { useSessionStore } from '../stores/session'

const props = defineProps<{
  location: Location
  inSession?: boolean
  isCurrentLocation?: boolean
  actionTaken?: boolean
}>()

const emit = defineEmits<{
  close: []
  go: [locationId: LocationId]
  centerMap: [locationId: LocationId]
  jump: [locationId: LocationId]
  followConnection: [layer: LayerType]
}>()

const atlasStore = useAtlasStore()
const sessionStore = useSessionStore()

const $style = useCssModule()

// --- Shared exit/connection editing ---

type EditKind = 'unknown' | 'location' | 'departure' | 'blocked'
type ExitDraft = { kind: EditKind; id: string }

function draftFromExit(exit: Exit): ExitDraft {
  if (exit === null || exit === undefined) return { kind: 'location', id: '' }
  if (exit.kind === 'location') return { kind: 'location', id: exit.id ?? '' }
  if (exit.kind === 'departure') return { kind: 'departure', id: exit.id ?? '' }
  return { kind: 'blocked', id: '' }
}

function draftError(touched: boolean, draft: ExitDraft): string {
  if (!touched) return ''
  const { kind, id } = draft
  if ((kind === 'location' || kind === 'departure') && id !== '' && !/^\d{3}$/.test(id)) return '3-digit ID or leave blank'
  return ''
}

function draftValid(draft: ExitDraft): boolean {
  const { kind, id } = draft
  if ((kind === 'location' || kind === 'departure') && id !== '') return /^\d{3}$/.test(id)
  return true
}

function destinationOf(exit: Exit | undefined): LocationId | null {
  if (!exit) return null
  if (exit.kind === 'location') return exit.id
  if (exit.kind === 'departure' && exit.id) return exit.id
  return null
}

// --- Exit editing ---

const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west']
const DIR_LABEL: Record<Direction, string> = { north: 'N', east: 'E', south: 'S', west: 'W' }
const DIR_FULL: Record<Direction, string> = { north: 'North', east: 'East', south: 'South', west: 'West' }
const DIR_GRID_ROW: Record<Direction, number> = { north: 1, east: 2, south: 3, west: 2 }
const DIR_GRID_COL: Record<Direction, number> = { north: 2, east: 3, south: 2, west: 1 }

const editingExits = ref(false)
const exitDrafts = ref<Record<Direction, ExitDraft>>({
  north: { kind: 'location', id: '' },
  east: { kind: 'location', id: '' },
  south: { kind: 'location', id: '' },
  west: { kind: 'location', id: '' },
})
const exitDraftTouched = ref<Record<Direction, boolean>>({
  north: false, east: false, south: false, west: false,
})

watch(() => props.location.id, () => {
  editingExits.value = false
  editingConnections.value = false
})

function startEditExits() {
  for (const dir of DIRECTIONS) {
    exitDrafts.value[dir] = draftFromExit(props.location.exits[dir])
    exitDraftTouched.value[dir] = false
  }
  editingExits.value = true
}

function cancelEditExits() {
  editingExits.value = false
}

function exitDraftError(dir: Direction): string {
  return draftError(exitDraftTouched.value[dir], exitDrafts.value[dir])
}

const exitDraftsValid = computed(() => DIRECTIONS.every(dir => draftValid(exitDrafts.value[dir])))

function saveEditExits() {
  for (const dir of DIRECTIONS) exitDraftTouched.value[dir] = true
  if (!exitDraftsValid.value) return
  for (const dir of DIRECTIONS) {
    const { kind, id } = exitDrafts.value[dir]
    let exit: Exit
    if (kind === 'location') exit = { kind: 'location', id: id || null }
    else if (kind === 'departure') exit = { kind: 'departure', id: id || null }
    else exit = { kind: 'blocked' }
    atlasStore.setExit(props.location.id, dir, exit)
  }
  editingExits.value = false
}

function onExitKindChange(dir: Direction) {
  exitDrafts.value[dir].id = ''
  exitDraftTouched.value[dir] = false
}

// --- Connections (action-based links to other layers) ---
// A connection is just an optional destination ID: a filled field means a
// connection to that location, an empty field means no connection at all.

const LAYER_LABEL: Record<LayerType, string> = {
  surface: 'Surface', aerial: 'Aerial', underground: 'Underground', interior: 'Interior', city: 'City',
}
const ALL_LAYERS: LayerType[] = ['surface', 'aerial', 'underground', 'interior', 'city']

const otherLayers = computed(() => ALL_LAYERS.filter(l => l !== props.location.layer))

const editingConnections = ref(false)
const connectionDrafts = ref<Partial<Record<LayerType, string>>>({})
const connectionDraftTouched = ref<Partial<Record<LayerType, boolean>>>({})

function startEditConnections() {
  for (const layer of otherLayers.value) {
    connectionDrafts.value[layer] = props.location.connections[layer] ?? ''
    connectionDraftTouched.value[layer] = false
  }
  editingConnections.value = true
}

function cancelEditConnections() {
  editingConnections.value = false
}

function connectionDraftError(layer: LayerType): string {
  if (!connectionDraftTouched.value[layer]) return ''
  const id = connectionDrafts.value[layer] ?? ''
  return id !== '' && !/^\d{3}$/.test(id) ? '3-digit ID or leave blank' : ''
}

const connectionDraftsValid = computed(() =>
  otherLayers.value.every(layer => {
    const id = connectionDrafts.value[layer] ?? ''
    return id === '' || /^\d{3}$/.test(id)
  })
)

function saveEditConnections() {
  for (const layer of otherLayers.value) connectionDraftTouched.value[layer] = true
  if (!connectionDraftsValid.value) return
  for (const layer of otherLayers.value) {
    const id = connectionDrafts.value[layer] || null
    atlasStore.setConnection(props.location.id, layer, id)
  }
  editingConnections.value = false
}

// --- Notes ---

const notesDraft = ref(props.location.notes)
watch(() => props.location.notes, (v) => { notesDraft.value = v })

function saveNotes() {
  atlasStore.setNotes(props.location.id, notesDraft.value)
}

// --- Action taken ---

function onActionTaken() {
  sessionStore.toggleActionTaken(props.location.id)
}
</script>

<template>
  <div :class="$style.panel">
    <!-- Header -->
    <header :class="$style.header">
      <div :class="$style.headerLeft">
        <span :class="$style.locationId">{{ location.id }}</span>
        <span :class="$style.layerBadge">{{ LAYER_LABEL[location.layer] }}</span>
        <span v-if="isCurrentLocation" :class="$style.currentBadge">Here</span>
      </div>
      <button :class="$style.closeBtn" @click="emit('close')" aria-label="Close panel">×</button>
    </header>

    <div :class="$style.body">
      <!-- Session status row -->
      <div v-if="inSession" :class="$style.sessionRow">
        <label :class="[$style.checkboxLabel, $style.checkboxLabelClickable]">
          <input
            type="checkbox"
            :class="$style.checkbox"
            :checked="actionTaken"
            @change="onActionTaken"
          />
          <span :class="[$style.checkboxText, actionTaken && $style.checkboxTextChecked]">
            Action taken
          </span>
        </label>
      </div>

      <!-- Exits -->
      <section :class="$style.section">
        <div :class="$style.sectionHeader">
          <h3 :class="$style.sectionTitle">Exits</h3>
          <button v-if="!editingExits" :class="$style.sectionEditBtn" @click="startEditExits">Edit</button>
        </div>

        <!-- Compass display -->
        <div v-if="!editingExits" :class="$style.compassGrid">
          <div
            v-for="dir in DIRECTIONS"
            :key="dir"
            :class="$style.compassPoint"
            :style="{ gridRow: DIR_GRID_ROW[dir], gridColumn: DIR_GRID_COL[dir] }"
          >
            <button
              v-if="inSession && destinationOf(location.exits[dir])"
              :class="$style.goBtn"
              @click="emit('go', destinationOf(location.exits[dir])!)"
            >
              <span :class="$style.compassDestId">{{ destinationOf(location.exits[dir]) }}</span>
              <span>Go</span>
            </button>
            <span v-else-if="destinationOf(location.exits[dir])" :class="$style.compassDestId">
              {{ destinationOf(location.exits[dir]) }}
            </span>
            <span v-else :class="$style.compassDirLabel">{{ DIR_LABEL[dir] }}</span>
          </div>
        </div>

        <!-- Edit form -->
        <div v-else :class="$style.exitEditorAll">
          <div v-for="dir in DIRECTIONS" :key="dir" :class="$style.exitEditorRow">
            <span :class="$style.dirLabel">{{ DIR_LABEL[dir] }}</span>
            <div :class="$style.kindOptions">
              <label v-for="k in (['location', 'departure', 'blocked'] as EditKind[])" :key="k" :class="$style.kindOption">
                <input
                  type="radio"
                  :value="k"
                  v-model="exitDrafts[dir].kind"
                  @change="onExitKindChange(dir)"
                />
                <span :class="[$style.kindLabel, exitDrafts[dir].kind === k && $style.kindLabelActive]">
                  {{ k === 'location' ? 'Loc' : k === 'departure' ? 'Dep' : 'Blk' }}
                </span>
              </label>
            </div>
            <input
              :class="[$style.idInput, exitDraftError(dir) && $style.idInputError]"
              v-model="exitDrafts[dir].id"
              type="text"
              maxlength="3"
              :placeholder="exitDrafts[dir].kind === 'blocked' ? '' : 'opt'"
              :disabled="exitDrafts[dir].kind === 'blocked'"
              spellcheck="false"
              autocomplete="off"
              inputmode="numeric"
              @blur="exitDraftTouched[dir] = true"
            />
          </div>
          <template v-for="dir in DIRECTIONS" :key="`err-${dir}`">
            <p v-if="exitDraftError(dir)" :class="$style.fieldError">
              {{ DIR_FULL[dir] }}: {{ exitDraftError(dir) }}
            </p>
          </template>
          <div :class="$style.editorActions">
            <button :class="[$style.btn, $style.btnGhost]" @click="cancelEditExits">Cancel</button>
            <button
              :class="[$style.btn, $style.btnPrimary, !exitDraftsValid && $style.btnDisabled]"
              @click="saveEditExits"
            >Save</button>
          </div>
        </div>
      </section>

      <!-- Connections -->
      <section :class="$style.section">
        <div :class="$style.sectionHeader">
          <h3 :class="$style.sectionTitle">Connections</h3>
          <button v-if="!editingConnections" :class="$style.sectionEditBtn" @click="startEditConnections">Edit</button>
        </div>

        <!-- Display -->
        <div v-if="!editingConnections" :class="$style.subMapRows">
          <div v-for="layer in otherLayers" :key="layer" :class="$style.subMapRow">
            <span :class="$style.layerEntryLabel">{{ LAYER_LABEL[layer] }}</span>
            <span :class="$style.compassDestId">
              {{ location.connections[layer] ?? '—' }}
            </span>
            <button
              v-if="location.connections[layer]"
              :class="$style.subMapOpenBtn"
              @click="emit('followConnection', layer)"
            >Go</button>
          </div>
        </div>

        <!-- Edit form -->
        <div v-else :class="$style.exitEditorAll">
          <div v-for="layer in otherLayers" :key="layer" :class="$style.exitEditorRow">
            <span :class="$style.layerEntryLabel">{{ LAYER_LABEL[layer] }}</span>
            <input
              :class="[$style.idInput, connectionDraftError(layer) && $style.idInputError]"
              v-model="connectionDrafts[layer]"
              type="text"
              maxlength="3"
              placeholder="none"
              spellcheck="false"
              autocomplete="off"
              inputmode="numeric"
              @blur="connectionDraftTouched[layer] = true"
            />
          </div>
          <template v-for="layer in otherLayers" :key="`err-${layer}`">
            <p v-if="connectionDraftError(layer)" :class="$style.fieldError">
              {{ LAYER_LABEL[layer] }}: {{ connectionDraftError(layer) }}
            </p>
          </template>
          <div :class="$style.editorActions">
            <button :class="[$style.btn, $style.btnGhost]" @click="cancelEditConnections">Cancel</button>
            <button
              :class="[$style.btn, $style.btnPrimary, !connectionDraftsValid && $style.btnDisabled]"
              @click="saveEditConnections"
            >Save</button>
          </div>
        </div>
      </section>

      <!-- Notes -->
      <section :class="$style.section">
        <h3 :class="$style.sectionTitle">Notes</h3>
        <textarea
          :class="$style.notes"
          v-model="notesDraft"
          placeholder="Add notes…"
          rows="4"
          @blur="saveNotes"
        />
      </section>
    </div>

    <!-- Footer actions -->
    <footer :class="$style.footer">
      <button :class="[$style.btn, $style.btnGhost]" @click="emit('centerMap', location.id)">
        Center map here
      </button>
      <button
        v-if="inSession"
        :class="[$style.btn, $style.btnPrimary]"
        @click="emit('jump', location.id)"
      >Jump here</button>
    </footer>
  </div>
</template>

<style module>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-map-surface);
  border-left: 1px solid var(--color-border);
  overflow: hidden;
}

/* Header */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.headerLeft {
  display: flex;
  align-items: center;
  gap: 10px;
}

.locationId {
  font-family: var(--font-id);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--color-text);
}

.layerBadge {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  background: var(--color-cell-unknown);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 2px 6px;
}

.currentBadge {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-cell-visited);
  background: rgba(91, 143, 168, 0.15);
  border: 1px solid rgba(91, 143, 168, 0.3);
  border-radius: 3px;
  padding: 2px 6px;
}

.closeBtn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 20px;
  line-height: 1;
  padding: 0 2px;
  border-radius: 3px;
  transition: color 0.15s;
}
.closeBtn:hover {
  color: var(--color-text);
}

/* Body */
.body {
  flex: 1;
  overflow-y: auto;
  padding: 0 0 8px;
}

/* Session row */
.sessionRow {
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border);
}

.checkboxLabel {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: default;
  user-select: none;
}
.checkboxLabelClickable {
  cursor: pointer;
}
.checkboxLabelClickable:hover .checkboxText {
  color: var(--color-text);
}

.checkbox {
  accent-color: var(--color-action-taken);
  width: 14px;
  height: 14px;
}

.checkboxText {
  font-size: 13px;
  color: var(--color-text-muted);
}
.checkboxTextChecked {
  color: var(--color-action-taken);
}

/* Sections */
.section {
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
}

.sectionHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.sectionTitle {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

.sectionEditBtn {
  background: var(--color-cell-unknown);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  color: var(--color-text-muted);
  font-size: 12px;
  padding: 3px 10px;
  transition: border-color 0.15s, color 0.15s;
}
.sectionEditBtn:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text);
}

/* Exits — compass display */
.compassGrid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: auto auto auto;
  gap: 8px 4px;
  padding: 4px 0 8px;
  justify-items: center;
  align-items: center;
}

.compassPoint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  min-width: 56px;
  min-height: 44px;
  justify-content: center;
}

.compassDirLabel {
  font-family: var(--font-id);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-dim);
}

.compassDestId {
  font-family: var(--font-id);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  letter-spacing: 0.08em;
}

/* Edit form dir label (still used in editor rows) */
.dirLabel {
  font-family: var(--font-id);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-muted);
  width: 18px;
  flex-shrink: 0;
}

.goBtn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  background: var(--color-cell-unknown);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  color: var(--color-cell-visited);
  font-size: 13px;
  padding: 8px 14px;
  min-width: 56px;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.goBtn:hover {
  border-color: var(--color-cell-visited);
  background: rgba(91, 143, 168, 0.08);
}

/* Exit editor (all-at-once) */
.exitEditorAll {
  background: var(--color-cell-unknown);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.exitEditorRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}

.kindOptions {
  display: flex;
  gap: 4px;
  flex: 1;
}

.kindOption {
  display: contents;
}
.kindOption input[type="radio"] {
  display: none;
}

.kindLabel {
  font-size: 11px;
  padding: 3px 8px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  white-space: nowrap;
}
.kindLabel:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text);
}
.kindLabelActive {
  border-color: var(--color-cell-visited);
  color: var(--color-cell-visited);
  background: rgba(91, 143, 168, 0.1);
}

.idInput {
  background: var(--color-map-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 4px 8px;
  color: var(--color-text);
  font-family: var(--font-id);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.1em;
  width: 58px;
  flex-shrink: 0;
  outline: none;
  transition: border-color 0.15s;
}
.idInput:focus {
  border-color: var(--color-cell-visited);
}
.idInput:disabled {
  opacity: 0.35;
  cursor: default;
}
.idInputError {
  border-color: var(--color-error);
}

.fieldError {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--color-error);
}

.editorActions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 6px;
}

/* Sub-maps / connections */
.subMapRows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.subMapRow {
  display: flex;
  align-items: center;
  gap: 8px;
}

.subMapOpenBtn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-muted);
  font-size: 13px;
  padding: 5px 12px;
  transition: border-color 0.15s, color 0.15s;
}
.subMapOpenBtn:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text);
}

.layerEntryLabel {
  font-size: 13px;
  color: var(--color-text-muted);
  min-width: 96px;
}

/* Notes */
.notes {
  width: 100%;
  background: var(--color-cell-unknown);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 8px 10px;
  color: var(--color-text);
  resize: vertical;
  outline: none;
  line-height: 1.5;
  transition: border-color 0.15s;
}
.notes:focus {
  border-color: var(--color-cell-visited);
}
.notes::placeholder {
  color: var(--color-text-dim);
}

/* Footer */
.footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

/* Shared button styles */
.btn {
  width: 100%;
  border-radius: 4px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid transparent;
  text-align: center;
  transition: background 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s;
}

.btnPrimary {
  background: var(--color-btn-primary-bg);
  border-color: var(--color-btn-primary-bg);
  color: var(--color-text);
}
.btnPrimary:hover {
  background: var(--color-btn-primary-hover);
  border-color: var(--color-btn-primary-hover);
}

.btnGhost {
  background: transparent;
  border-color: var(--color-border);
  color: var(--color-text-muted);
}
.btnGhost:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text);
}

.btnDisabled {
  opacity: 0.4;
  pointer-events: none;
}
</style>
