<script setup lang="ts">
import type { LocationId } from '../types'

defineProps<{
  displayCenter?: LocationId
  readOnly?: boolean
}>()
</script>

<template>
  <div :class="$style.mapGrid">
    <span :class="$style.placeholder">Map rendering not yet implemented</span>
  </div>
</template>

<style module>
.mapGrid {
  width: 100%;
  height: 100%;
  background: var(--color-map-surface);
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder {
  color: var(--color-text-dim);
  font-size: 13px;
  letter-spacing: 0.04em;
  user-select: none;
}
</style>
