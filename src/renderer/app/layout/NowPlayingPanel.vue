<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import LyricsPanel from '@renderer/features/lyrics/components/LyricsPanel.vue'

const props = withDefaults(
  defineProps<{
    shouldMountLyrics?: boolean
    isCollapsed?: boolean
    isInteractive?: boolean
    targetWidthPx?: number
  }>(),
  {
    shouldMountLyrics: true,
    isCollapsed: false,
    isInteractive: true,
    targetWidthPx: undefined,
  },
)

const contentStyle = computed<CSSProperties>(() => ({
  width:
    typeof props.targetWidthPx === 'number' && props.targetWidthPx > 0
      ? `${props.targetWidthPx}px`
      : 'var(--auralis-lyrics-target-width, 20vw)',
}))
</script>

<template>
  <aside
    id="now-playing-panel"
    class="now-playing-panel"
    :class="{ 'now-playing-panel--collapsed': isCollapsed }"
    :inert="!isInteractive ? true : undefined"
    :aria-hidden="isCollapsed ? 'true' : undefined"
  >
    <div class="now-playing-panel-content" :style="contentStyle">
      <LyricsPanel v-if="shouldMountLyrics" />
    </div>
  </aside>
</template>
