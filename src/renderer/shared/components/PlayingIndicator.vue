<script setup lang="ts">
import { ref, watch } from 'vue'
import { usePlayingIconPreference } from '@renderer/features/appearance/composables/usePlayingIconPreference'
import { animatePlaybackBars, animatePlaybackBlocks } from '@renderer/shared/animation/motion'
import { useWindowVisibility } from '@renderer/shared/animation/useWindowVisibility'

const props = defineProps<{ playing: boolean; size?: number }>()
const { playingIcon } = usePlayingIconPreference()
const element = ref<SVGSVGElement | null>(null)
const visible = useWindowVisibility()
const blocks = Array.from({ length: 9 }, (_, index) => ({
  x: 1 + (index % 3) * 7.33,
  y: 1 + Math.floor(index / 3) * 7.33,
}))
watch(
  [element, playingIcon, () => props.playing, visible],
  (_, __, onCleanup) => {
    if (!element.value) return
    const shapes = Array.from(element.value.querySelectorAll<SVGRectElement>('rect'))
    const animate =
      playingIcon.value === 'blocks-wave' ? animatePlaybackBlocks : animatePlaybackBars
    onCleanup(animate(shapes, props.playing && visible.value))
  },
  { flush: 'post', immediate: true },
)
</script>

<template>
  <svg
    ref="element"
    class="playing-indicator"
    :data-preset="playingIcon"
    :style="{
      width: `${size ?? (playingIcon === 'blocks-wave' ? 12 : 14)}px`,
      height: `${size ?? (playingIcon === 'blocks-wave' ? 12 : 14)}px`,
    }"
    :viewBox="playingIcon === 'blocks-wave' ? '0 0 24 24' : '0 0 14 14'"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="playingIcon === 'blocks-wave'">
      <rect
        v-for="(block, index) in blocks"
        :key="`block-${index}`"
        :x="block.x"
        :y="block.y"
        width="7.33"
        height="7.33"
      />
    </template>
    <template v-else>
      <rect
        v-for="index in 3"
        :key="`bar-${index}`"
        :x="2 + (index - 1) * 4"
        y="2"
        width="2"
        height="12"
        rx="1"
      />
    </template>
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
.playing-indicator[data-preset='blocks-wave'] rect {
  transform-origin: center;
}
</style>
