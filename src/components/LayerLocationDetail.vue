<script setup lang="ts">
import { ref, computed, watch, useCssModule } from 'vue'
import type { LayerLocation, LocationId, Direction, Exit } from '../types'
import { useAtlasStore } from '../stores/atlas'
import { useSessionStore } from '../stores/session'

const props = defineProps<{
  location: LayerLocation
  layer: 'aerial' | 'underground'
  actionTaken?: boolean
  isCurrentLocation?: boolean
  inSession?: boolean
}>()

const emit = defineEmits<{
  close: []
  go: [locationId: LocationId]
  centerMap: [locationId: LocationId]
  jump: [locationId: LocationId]
}>()

const atlasStore = useAtlasStore()
const sessionStore = useSessionStore()
const $style = useCssModule()

// --- Exit editing ---

type EditKind = 'unknown' | 'location' | 'departure' | 'blocked'
type ExitDraft = { kind: EditKind; id: string }

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

watch(() => props.location.id, () => { editingExits.value = false })

function draftFromExit(exit: Exit): ExitDraft {
  if (exit === null) return { kind: 'location', id: '' }
  if (exit.kind === 'location') return { kind: 'location', id: exit.id }
  if (exit.kind === 'departure') return { kind: 'departure', id: exit.id ?? '' }
  return { kind: 'blocked', id: '' }
}

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
  if (!exitDraftTouched.value[dir]) return ''
  const { kind, id } = exitDrafts.value[dir]
  if (kind === 'location' && !/^\d{3}$/.test(id)) return 'Enter a 3-digit location ID'
  if (kind === 'departure' && id !== '' && !/^\d{3}$/.test(id)) return '3-digit ID or leave blank'
  return ''
}

const exitDraftsValid = computed(() =>
  DIRECTIONS.every(dir => {
    const { kind, id } = exitDrafts.value[dir]
    if (kind === 'location') return /^\d{3}$/.test(id)
    if (kind === 'departure' && id !== '') return /^\d{3}$/.test(id)
    return true
  })
)

function saveEditExits() {
  for (const dir of DIRECTIONS) exitDraftTouched.value[dir] = true
  if (!exitDraftsValid.value) return
  for (const dir of DIRECTIONS) {
    const { kind, id } = exitDrafts.value[dir]
    let exit: Exit
    if (kind === 'location') exit = { kind: 'location', id }
    else if (kind === 'departure') exit = { kind: 'departure', id: id || null }
    else exit = { kind: 'blocked' }
    atlasStore.setLayerExit(props.layer, props.location.id, dir, exit)
  }
  editingExits.value = false
}

function onExitKindChange(dir: Direction) {
  exitDrafts.value[dir].id = ''
  exitDraftTouched.value[dir] = false
}

function exitDestination(exit: Exit): LocationId | null {
  if (!exit) return null
  if (exit.kind === 'location') return exit.id
  if (exit.kind === 'departure' && exit.id) return exit.id
  return null
}

// --- Notes ---

const notesDraft = ref(props.location.notes)
watch(() => props.location.notes, (v) => { notesDraft.value = v })

function saveNotes() {
  atlasStore.setLayerNotes(props.layer, props.location.id, notesDraft.value)
}

// --- Action taken ---

function onActionTaken() {
  sessionStore.toggleActionTaken(props.location.id)
}
</script>

<template>
  <div :class="$style.panel">
    <header :class="$style.header">
      <div :class="$style.headerLeft">
        <span :class="$style.locationId">{{ location.id }}</span>
        <span v-if="isCurrentLocation" :class="$style.currentBadge">Here</span>
      </div>
      <button :class="$style.closeBtn" @click="emit('close')" aria-label="Close panel">×</button>
    </header>

    <div :class="$style.body">
      <!-- Action taken -->
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

        <div v-if="!editingExits" :class="$style.compassGrid">
          <div
            v-for="dir in DIRECTIONS"
            :key="dir"
            :class="$style.compassPoint"
            :style="{ gridRow: DIR_GRID_ROW[dir], gridColumn: DIR_GRID_COL[dir] }"
          >
            <button
              v-if="inSession && exitDestination(location.exits[dir])"
              :class="$style.goBtn"
              @click="emit('go', exitDestination(location.exits[dir])!)"
            >
              <span :class="$style.compassDestId">{{ exitDestination(location.exits[dir]) }}</span>
              <span>Go</span>
            </button>
            <span v-else-if="exitDestination(location.exits[dir])" :class="$style.compassDestId">
              {{ exitDestination(location.exits[dir]) }}
            </span>
            <span v-else :class="$style.compassDirLabel">{{ DIR_LABEL[dir] }}</span>
          </div>
        </div>

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
              :placeholder="exitDrafts[dir].kind === 'departure' ? 'opt' : exitDrafts[dir].kind === 'blocked' ? '' : '000'"
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

.body {
  flex: 1;
  overflow-y: auto;
  padding: 0 0 8px;
}

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

.footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

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
