<script setup lang="ts">
import { ref, computed, watch, useCssModule } from 'vue'
import type { Location, LocationId, Direction, Exit, SubMapType } from '../types'

const props = defineProps<{
  location: Location
  inSession?: boolean
  isCurrentLocation?: boolean
  actionTaken?: boolean
}>()

const emit = defineEmits<{
  close: []
  centerMap: [locationId: LocationId]
  teleport: [locationId: LocationId]
  openSubMap: [type: SubMapType]
}>()

const $style = useCssModule()

// --- Exit editing ---

type EditKind = 'unknown' | 'location' | 'departure' | 'blocked'

const editingDir = ref<Direction | null>(null)
const editKind = ref<EditKind>('unknown')
const editIdValue = ref('')
const editIdTouched = ref(false)

const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west']
const DIR_LABEL: Record<Direction, string> = { north: 'N', east: 'E', south: 'S', west: 'W' }
const DIR_FULL: Record<Direction, string> = { north: 'North', east: 'East', south: 'South', west: 'West' }

const editIdError = computed(() => {
  if (!editIdTouched.value) return ''
  if (editKind.value === 'location') {
    if (!/^\d{3}$/.test(editIdValue.value)) return 'Enter a 3-digit location ID'
  } else if (editKind.value === 'departure' && editIdValue.value !== '') {
    if (!/^\d{3}$/.test(editIdValue.value)) return '3-digit ID or leave blank'
  }
  return ''
})


const editCanSave = computed(() => {
  if (editKind.value === 'location') return /^\d{3}$/.test(editIdValue.value)
  if (editKind.value === 'departure' && editIdValue.value !== '') return /^\d{3}$/.test(editIdValue.value)
  return true
})

function startEdit(dir: Direction) {
  editingDir.value = dir
  editIdTouched.value = false
  const exit = props.location.exits[dir]
  if (exit === null) {
    editKind.value = 'location'
    editIdValue.value = ''
  } else if (exit.kind === 'location') {
    editKind.value = 'location'
    editIdValue.value = exit.id
  } else if (exit.kind === 'departure') {
    editKind.value = 'departure'
    editIdValue.value = exit.id ?? ''
  } else {
    editKind.value = 'blocked'
    editIdValue.value = ''
  }
}

function cancelEdit() {
  editingDir.value = null
}

function saveEdit() {
  editIdTouched.value = true
  if (!editCanSave.value) return
  // Store call goes here once wired up
  editingDir.value = null
}

function onKindChange() {
  editIdValue.value = ''
  editIdTouched.value = false
}

// --- Exit display ---

function exitDescription(exit: Exit): string {
  if (exit === null) return 'Unknown'
  if (exit.kind === 'location') return `→ ${exit.id}`
  if (exit.kind === 'departure') return exit.id != null ? `Departure → ${exit.id}` : 'Departure'
  return 'Blocked'
}

function exitStyleClass(exit: Exit): string {
  if (exit === null) return $style.exitUnknown
  if (exit.kind === 'location') return $style.exitLocation
  if (exit.kind === 'departure') return $style.exitDeparture
  return $style.exitBlocked
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

// --- Sub-maps ---

const subMaps = computed(() => {
  const maps: { type: SubMapType; label: string }[] = []
  if (props.location.hasInterior) maps.push({ type: 'interior', label: 'Interior' })
  if (props.location.hasAerial) maps.push({ type: 'aerial', label: 'Aerial' })
  if (props.location.hasUnderground) maps.push({ type: 'underground', label: 'Underground' })
  return maps
})
</script>

<template>
  <div :class="$style.panel">
    <!-- Header -->
    <header :class="$style.header">
      <div :class="$style.headerLeft">
        <span :class="$style.locationId">{{ location.id }}</span>
        <span v-if="isCurrentLocation" :class="$style.currentBadge">Here</span>
      </div>
      <button :class="$style.closeBtn" @click="emit('close')" aria-label="Close panel">×</button>
    </header>

    <div :class="$style.body">
      <!-- Session status row -->
      <div v-if="inSession" :class="$style.sessionRow">
        <label :class="$style.checkboxLabel">
          <input
            type="checkbox"
            :class="$style.checkbox"
            :checked="actionTaken"
            disabled
          />
          <span :class="[$style.checkboxText, actionTaken && $style.checkboxTextChecked]">
            Action taken
          </span>
        </label>
      </div>

      <!-- Exits -->
      <section :class="$style.section">
        <h3 :class="$style.sectionTitle">Exits</h3>
        <div :class="$style.exits">
          <template v-for="dir in DIRECTIONS" :key="dir">
            <!-- Normal row -->
            <div v-if="editingDir !== dir" :class="$style.exitRow">
              <span :class="$style.dirLabel">{{ DIR_LABEL[dir] }}</span>
              <span :class="[$style.exitStatus, exitStyleClass(location.exits[dir])]">
                {{ exitDescription(location.exits[dir]) }}
              </span>
              <button
                v-if="exitDestination(location.exits[dir])"
                :class="$style.goBtn"
                @click="emit('centerMap', exitDestination(location.exits[dir])!)"
              >Go</button>
              <button :class="$style.editBtn" @click="startEdit(dir)">Edit</button>
            </div>

            <!-- Edit form -->
            <div v-else :class="$style.exitEditor">
              <div :class="$style.editorHeader">
                <span :class="$style.dirLabel">{{ DIR_LABEL[dir] }}</span>
                <span :class="$style.editorDirFull">{{ DIR_FULL[dir] }}</span>
              </div>

              <div :class="$style.kindOptions">
                <label v-for="k in (['location', 'departure', 'blocked'] as EditKind[])" :key="k" :class="$style.kindOption">
                  <input
                    type="radio"
                    :value="k"
                    v-model="editKind"
                    @change="onKindChange"
                  />
                  <span :class="[$style.kindLabel, editKind === k && $style.kindLabelActive]">
                    {{ k === 'location' ? 'Location' : k === 'departure' ? 'Departure' : 'Blocked' }}
                  </span>
                </label>
              </div>

              <div :class="$style.idInputRow">
                <input
                  :class="[$style.idInput, editIdError && $style.idInputError]"
                  v-model="editIdValue"
                  type="text"
                  maxlength="3"
                  :placeholder="editKind === 'departure' ? 'Optional' : '000'"
                  :disabled="editKind === 'blocked'"
                  spellcheck="false"
                  autocomplete="off"
                  @blur="editIdTouched = true"
                />
                <span :class="$style.idInputLabel">
                  {{ editKind === 'location' ? 'Destination ID' : editKind === 'departure' ? 'Destination ID (if known)' : '' }}
                </span>
              </div>
              <p v-if="editIdError" :class="$style.fieldError">{{ editIdError }}</p>

              <div :class="$style.editorActions">
                <button :class="[$style.btn, $style.btnGhost]" @click="cancelEdit">Cancel</button>
                <button
                  :class="[$style.btn, $style.btnPrimary, !editCanSave && $style.btnDisabled]"
                  @click="saveEdit"
                >Save</button>
              </div>
            </div>
          </template>
        </div>
      </section>

      <!-- Sub-maps -->
      <section v-if="subMaps.length > 0" :class="$style.section">
        <h3 :class="$style.sectionTitle">Sub-maps</h3>
        <div :class="$style.subMapBtns">
          <button
            v-for="sm in subMaps"
            :key="sm.type"
            :class="$style.subMapBtn"
            @click="emit('openSubMap', sm.type)"
          >{{ sm.label }}</button>
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
        @click="emit('teleport', location.id)"
      >Teleport here</button>
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

.sectionTitle {
  margin: 0 0 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}

/* Exits */
.exits {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.exitRow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
}

.dirLabel {
  font-family: var(--font-id);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-muted);
  width: 18px;
  flex-shrink: 0;
}

.exitStatus {
  flex: 1;
  font-size: 14px;
}
.exitUnknown {
  color: var(--color-text-dim);
  font-style: italic;
}
.exitLocation {
  color: var(--color-text);
  font-family: var(--font-id);
  font-size: 14px;
}
.exitDeparture {
  color: var(--color-departure);
  font-family: var(--font-id);
  font-size: 14px;
}
.exitBlocked {
  color: var(--color-text-dim);
}

.goBtn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  color: var(--color-cell-visited);
  font-size: 13px;
  padding: 4px 10px;
  flex-shrink: 0;
  transition: border-color 0.15s, color 0.15s;
}
.goBtn:hover {
  border-color: var(--color-cell-visited);
}

.editBtn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  color: var(--color-text-muted);
  font-size: 13px;
  padding: 4px 10px;
  flex-shrink: 0;
  transition: border-color 0.15s, color 0.15s;
}
.editBtn:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text);
}

/* Exit editor */
.exitEditor {
  background: var(--color-cell-unknown);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.editorHeader {
  display: flex;
  align-items: center;
  gap: 8px;
}

.editorDirFull {
  font-size: 12px;
  color: var(--color-text-muted);
}

.kindOptions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.kindOption {
  display: contents;
}
.kindOption input[type="radio"] {
  display: none;
}

.kindLabel {
  font-size: 12px;
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
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

.idInputRow {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.idInputLabel {
  font-size: 11px;
  color: var(--color-text-dim);
}

.idInput {
  background: var(--color-map-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 6px 10px;
  color: var(--color-text);
  font-family: var(--font-id);
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.1em;
  width: 80px;
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
  margin: 0;
  font-size: 11px;
  color: var(--color-error);
}

.editorActions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

/* Sub-maps */
.subMapBtns {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.subMapBtn {
  background: var(--color-cell-unknown);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  font-size: 13px;
  padding: 6px 14px;
  transition: background 0.15s, border-color 0.15s;
}
.subMapBtn:hover {
  background: var(--color-cell-known);
  border-color: var(--color-text-muted);
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
