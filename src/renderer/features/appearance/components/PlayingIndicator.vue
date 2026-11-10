<script setup lang="ts">
import { ref, watch } from 'vue'
import { animatePlaybackBars } from '@renderer/shared/animation/motion'
import { useWindowVisibility } from '@renderer/shared/animation/useWindowVisibility'

const props = defineProps<{ playing: boolean; size?: number }>()
const element = ref<SVGSVGElement | null>(null)
const visible = useWindowVisibility()
watch(
  [element, () => props.playing, visible],
  (_, __, onCleanup) => {
    if (!element.value) return
    const shapes = Array.from(element.value.querySelectorAll<SVGRectElement>('rect'))
    onCleanup(animatePlaybackBars(shapes, props.playing && visible.value))
  },
  { flush: 'post', immediate: true },
)
</script>

<template>
  <svg
    ref="element"
    class="playing-indicator"
    :style="{ width: `${size ?? 14}px`, height: `${size ?? 14}px` }"
    viewBox="0 0 14 14"
    aria-hidden="true"
    focusable="false"
  >
    <rect
      v-for="index in 3"
      :key="index"
      :x="2 + (index - 1) * 4"
      y="2"
      width="2"
      height="12"
      rx="1"
    />
  </svg>
</template>

<style scoped>
.playing-indicator {
  display: block;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  fill: currentColor;
  pointer-events: none;
}
.playing-indicator rect {
  transform-box: fill-box;
  transform-origin: center bottom;
}
</style>
