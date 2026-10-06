<script setup lang="ts">
import { ref, watch, type DeepReadonly } from 'vue'
import type { ArtworkPalette } from '../types'
import { useLiquidMetalArtworkBackground } from '../composables/useLiquidMetalArtworkBackground'
import type { LiquidMetalSettings } from '../runtime/liquidMetalSettings'
import type { BackgroundMorphEndpoint } from '../runtime/backgroundMorph'

const props = defineProps<{
  palette: DeepReadonly<ArtworkPalette>
  target: HTMLElement | null
  enabled: boolean
  visible: boolean
  active: boolean
  playing: boolean
  motionPaused: boolean
  settings: Readonly<LiquidMetalSettings>
  deferInitialization?: boolean
  enableMorph?: boolean
}>()
const emit = defineEmits<{
  unavailable: []
  lost: []
  'morph-frame': [phase: number]
  'morph-complete': [phase: BackgroundMorphEndpoint]
}>()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const { ready, resize, uploadFlowFrame, transitionTo } = useLiquidMetalArtworkBackground(
  canvasRef,
  props,
  () => emit('unavailable'),
  {
    onMorphFrame: (phase) => emit('morph-frame', phase),
    onMorphComplete: (phase) => emit('morph-complete', phase),
    onContextLost: () => emit('lost'),
  },
)
defineExpose({ ready, uploadFlowFrame, transitionTo })
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
  filter: blur(var(--background-morph-feather, 0px));
  transform: scale(var(--background-morph-scale, 1));
  transform-origin: center;
}

.liquid-metal-artwork-background--parked {
  /* Keep viewport geometry while hidden, avoiding a 1px drawing-buffer resize on every exit. */
  position: fixed;
}
</style>
