<script setup lang="ts">
import type { LyricLine } from '../types'

withDefaults(
  defineProps<{
    line: LyricLine
    active: boolean
    startedIndex?: number
    activeSegmentIndex?: number
  }>(),
  { startedIndex: -1, activeSegmentIndex: -1 },
)
</script>

<template>
  <span class="lyric-text" :class="{ 'lyric-text-enhanced': line.enhanced }">
    <template v-if="active && line.segments">
      <span
        v-for="(segment, index) in line.segments"
        :key="index"
        class="lyric-segment"
        :class="{ 'lyric-segment-pending': index > startedIndex }"
        :data-lyric-segment="index"
        :data-lit="index <= startedIndex"
        :data-current="index === activeSegmentIndex"
        >{{ segment.text }}</span
      >
    </template>
    <template v-else>{{ line.text || ' ' }}</template>
  </span>
</template>

<style scoped>
.lyric-text-enhanced {
  white-space: pre-wrap;
}

.lyric-segment-pending {
  color: var(--auralis-text-muted);
}
</style>
