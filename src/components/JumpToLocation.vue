<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LocationId } from '../types'

const emit = defineEmits<{
  navigate: [locationId: LocationId]
  close: []
}>()

const input = ref('')
const submitted = ref(false)

const isValid = computed(() => /^\d{3}$/.test(input.value))
const showError = computed(() => submitted.value && !isValid.value)

function handleSubmit() {
  submitted.value = true
  if (isValid.value) {
    emit('navigate', input.value)
    emit('close')
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') handleSubmit()
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <div :class="$style.backdrop" @click.self="emit('close')">
    <div :class="$style.widget">
      <div :class="$style.header">
        <span :class="$style.label">Jump to location</span>
        <button :class="$style.closeBtn" @click="emit('close')" aria-label="Close">×</button>
      </div>
      <div :class="$style.inputRow">
        <input
          :class="[$style.idInput, showError && $style.idInputError]"
          v-model="input"
          type="text"
          maxlength="3"
          placeholder="042"
          spellcheck="false"
          autocomplete="off"
          inputmode="numeric"
          @keydown="handleKeydown"
          autofocus
        />
        <button
          :class="[$style.goBtn, isValid && $style.goBtnActive]"
          :disabled="!isValid"
          @click="handleSubmit"
        >Go</button>
      </div>
      <p v-if="showError" :class="$style.error">Enter a 3-digit location ID</p>
    </div>
  </div>
</template>

<style module>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 80px;
}

.widget {
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 16px;
  width: 240px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.closeBtn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 18px;
  line-height: 1;
  padding: 0 2px;
  border-radius: 3px;
  transition: color 0.15s;
}
.closeBtn:hover {
  color: var(--color-text);
}

.inputRow {
  display: flex;
  gap: 8px;
}

.idInput {
  flex: 1;
  min-width: 0;
  background: var(--color-cell-unknown);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 8px 10px;
  color: var(--color-text);
  font-family: var(--font-id);
  font-size: 18px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-align: center;
  outline: none;
  transition: border-color 0.15s;
}
.idInput:focus {
  border-color: var(--color-cell-visited);
}
.idInputError {
  border-color: var(--color-error);
}

.goBtn {
  background: var(--color-cell-unknown);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-dim);
  padding: 8px 14px;
  font-weight: 600;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.goBtnActive {
  background: var(--color-btn-primary-bg);
  border-color: var(--color-btn-primary-bg);
  color: var(--color-text);
}
.goBtnActive:hover {
  background: var(--color-btn-primary-hover);
  border-color: var(--color-btn-primary-hover);
}

.error {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--color-error);
}
</style>
