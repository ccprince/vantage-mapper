<script setup lang="ts">
import type { LocationId, SubMapType } from '../types'
import MapGrid from './MapGrid.vue'

defineProps<{
  type: SubMapType
  parentLocationId: LocationId
}>()

const emit = defineEmits<{
  close: []
}>()

const TYPE_LABEL: Record<SubMapType, string> = {
  interior: 'Interior',
  aerial: 'Aerial',
  underground: 'Underground',
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <div :class="$style.overlay" @keydown.window="handleKeydown" @click.self="emit('close')">
    <div :class="$style.modal">
      <header :class="$style.header">
        <div :class="$style.headerLeft">
          <span :class="$style.typeLabel">{{ TYPE_LABEL[type] }}</span>
          <span :class="$style.separator">/</span>
          <span :class="$style.parentId">{{ parentLocationId }}</span>
        </div>
        <button :class="$style.closeBtn" @click="emit('close')" aria-label="Close sub-map">×</button>
      </header>
      <div :class="$style.mapArea">
        <MapGrid :display-center="parentLocationId" />
      </div>
    </div>
  </div>
</template>

<style module>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: var(--color-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.modal {
  background: var(--color-map-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  width: 100%;
  max-width: 900px;
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.headerLeft {
  display: flex;
  align-items: center;
  gap: 8px;
}

.typeLabel {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.separator {
  color: var(--color-text-dim);
}

.parentId {
  font-family: var(--font-id);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--color-text);
}

.closeBtn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 22px;
  line-height: 1;
  padding: 0 2px;
  border-radius: 3px;
  transition: color 0.15s;
}
.closeBtn:hover {
  color: var(--color-text);
}

.mapArea {
  flex: 1;
  min-height: 400px;
  overflow: hidden;
}
</style>
