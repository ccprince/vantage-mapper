<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LocationId } from '../types'

const emit = defineEmits<{
  submit: [name: string, startingLocationId: LocationId]
  cancel: []
}>()

const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
const name = ref(today)
const startingId = ref('')
const attemptedSubmit = ref(false)

const nameError = computed(() => {
  if (!attemptedSubmit.value) return ''
  return name.value.trim() === '' ? 'Session name is required' : ''
})

const idError = computed(() => {
  if (!attemptedSubmit.value) return ''
  if (startingId.value === '') return 'Starting location is required'
  if (!/^\d{3}$/.test(startingId.value)) return 'Enter a 3-digit location ID (e.g. 042)'
  return ''
})

const isValid = computed(() => name.value.trim() !== '' && /^\d{3}$/.test(startingId.value))

function handleSubmit() {
  attemptedSubmit.value = true
  if (isValid.value) {
    emit('submit', name.value.trim(), startingId.value)
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('cancel')
}
</script>

<template>
  <div :class="$style.overlay" @keydown="handleKeydown">
    <div :class="$style.dialog" role="dialog" aria-modal="true" aria-label="New session">
      <header :class="$style.dialogHeader">
        <h2 :class="$style.dialogTitle">New Session</h2>
        <button :class="$style.closeBtn" @click="emit('cancel')" aria-label="Cancel">×</button>
      </header>

      <div :class="$style.dialogBody">
        <div :class="$style.field">
          <label :class="$style.fieldLabel" for="session-name">Session name</label>
          <input
            id="session-name"
            :class="[$style.input, nameError && $style.inputError]"
            v-model="name"
            type="text"
            placeholder="e.g. 2026-07-04"
            autocomplete="off"
          />
          <p v-if="nameError" :class="$style.fieldError">{{ nameError }}</p>
        </div>

        <div :class="$style.field">
          <label :class="$style.fieldLabel" for="starting-location">Starting location</label>
          <input
            id="starting-location"
            :class="[$style.input, $style.idInput, idError && $style.inputError]"
            v-model="startingId"
            type="text"
            maxlength="3"
            placeholder="042"
            spellcheck="false"
            autocomplete="off"
          />
          <p v-if="idError" :class="$style.fieldError">{{ idError }}</p>
          <p :class="$style.fieldHint">This becomes your current location and map center.</p>
        </div>
      </div>

      <footer :class="$style.dialogFooter">
        <button :class="[$style.btn, $style.btnGhost]" @click="emit('cancel')">Cancel</button>
        <button :class="[$style.btn, $style.btnPrimary]" @click="handleSubmit">Start Session</button>
      </footer>
    </div>
  </div>
</template>

<style module>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--color-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.dialog {
  background: var(--color-map-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
}

.dialogHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
}

.dialogTitle {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
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

.dialogBody {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fieldLabel {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.input {
  background: var(--color-cell-unknown);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 9px 12px;
  color: var(--color-text);
  outline: none;
  transition: border-color 0.15s;
}
.input:focus {
  border-color: var(--color-cell-visited);
}
.inputError {
  border-color: var(--color-error);
}

.idInput {
  font-family: var(--font-id);
  font-size: 18px;
  font-weight: 500;
  letter-spacing: 0.1em;
  max-width: 100px;
}

.fieldError {
  margin: 0;
  font-size: 12px;
  color: var(--color-error);
}

.fieldHint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-dim);
}

.dialogFooter {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 24px 20px;
}

.btn {
  border-radius: 4px;
  padding: 8px 18px;
  font-weight: 600;
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
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
</style>
