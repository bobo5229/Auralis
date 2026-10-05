<script setup lang="ts">
import { ref, watch, type DeepReadonly } from 'vue'
import type { ArtworkPalette } from '../types'
import { useLiquidMetalArtworkBackground } from '../composables/useLiquidMetalArtworkBackground'
import type { LiquidMetalSettings } from '../runtime/liquidMetalSettings'

const props = defineProps<{
  palette: DeepReadonly<ArtworkPalette>
  target: HTMLElement | null
  enabled: boolean
  visible: boolean
  active: boolean
  playing: boolean
  motionPaused: boolean
  settings: Readonly<LiquidMetalSettings>
}>()
const emit = defineEmits<{ unavailable: [] }>()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const { ready, resize } = useLiquidMetalArtworkBackground(canvasRef, props, () =>
  emit('unavailable'),
)
// Teleport finishes before measuring; activation's queued draw must use the new target size.
watch(() => [props.target, props.visible], resize, { flush: 'post' })
</script>

<template>
  <Teleport :to="target ?? 'body'">
    <canvas
      ref="canvasRef"
      class="liquid-metal-artwork-background"
      :class="{ 'liquid-metal-artwork-background--parked': target === null }"
      :style="{ opacity: ready ? 1 : 0, visibility: visible ? 'visible' : 'hidden' }"
      aria-hidden="true"
    />
  </Teleport>
</template>

<style scoped>
.liquid-metal-artwork-background {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
  background: var(--auralis-artwork-background-fallback);
}

.liquid-metal-artwork-background--parked {
  /* Keep viewport geometry while hidden, avoiding a 1px drawing-buffer resize on every exit. */
  position: fixed;
}
</style>
