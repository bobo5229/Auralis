<script setup lang="ts">
import { ref, watch, type DeepReadonly } from 'vue'
import FluidArtworkBackground from './FluidArtworkBackground.vue'
import FluidArtworkBackgroundEffects from './FluidArtworkBackgroundEffects.vue'
import LiquidMetalArtworkBackground from './LiquidMetalArtworkBackground.vue'
import { useFullscreenArtworkBackground } from '../composables/useFullscreenArtworkBackground'
import type { FullscreenBackgroundMode } from '../composables/useFullscreenBackground'
import type { ArtworkPalette } from '../types'
import type { LiquidMetalSettings } from '../runtime/liquidMetalSettings'

const props = defineProps<{
  mode: FullscreenBackgroundMode
  target: HTMLElement | null
  artworkUrl: string | null
  artworkKey: string | null
  palette: DeepReadonly<ArtworkPalette>
  settings: Readonly<LiquidMetalSettings>
  active: boolean
  playing: boolean
  motionPaused: boolean
  deferInitialization?: boolean
}>()
const emit = defineEmits<{
  fallback: [mode: FullscreenBackgroundMode]
  'presentation-mode': [mode: FullscreenBackgroundMode]
}>()
const surface = ref<HTMLElement | null>(null)
const metal = ref<InstanceType<typeof LiquidMetalArtworkBackground> | null>(null)
const fluid = ref<InstanceType<typeof FluidArtworkBackground> | null>(null)
const background = useFullscreenArtworkBackground(props, surface, metal, fluid, (mode) =>
  emit('fallback', mode),
)
watch(background.presentationMode, (mode) => emit('presentation-mode', mode), { immediate: true })
</script>

<template>
  <Teleport :to="target ?? 'body'">
    <div
      ref="surface"
      class="fullscreen-artwork-background"
      :class="{ 'fullscreen-artwork-background--parked': target === null }"
      :data-background-transition="
        background.transitioning.value
          ? 'morphing'
          : background.preparing.value
            ? 'preparing'
            : 'stable'
      "
      :style="{ visibility: target === null ? 'hidden' : 'visible' }"
      aria-hidden="true"
    >
      <FluidArtworkBackground
        ref="fluid"
        :target="surface"
        :artwork-url="artworkUrl"
        :enabled="background.fluidEnabled.value"
        :active="background.fluidActive.value"
        :playing="playing"
        :visible="background.fluidVisible.value"
        :window-visible="background.windowVisible.value"
        :motion-paused="motionPaused"
        :capture-frames="background.captureFrames.value"
        :effects="false"
        :defer-initialization="deferInitialization"
        @frame="background.onFlowFrame"
        @ready="background.onFluidReady"
        @invalidated="background.onFluidInvalidated"
        @unavailable="background.onFluidUnavailable"
        @lost="background.onFluidLost"
        @capture-unavailable="background.onCaptureUnavailable"
      />
      <LiquidMetalArtworkBackground
        ref="metal"
        :target="surface"
        :enabled="background.metalEnabled.value"
        :visible="background.metalVisible.value"
        :palette="palette"
        :settings="settings"
        :active="background.metalActive.value"
        :playing="playing"
        :motion-paused="motionPaused"
        enable-morph
        :defer-initialization="deferInitialization"
        @unavailable="background.onMetalUnavailable"
        @lost="background.onMetalLost"
        @morph-frame="background.onMorphFrame"
        @morph-complete="background.onMorphComplete"
      />
      <FluidArtworkBackgroundEffects />
    </div>
  </Teleport>
</template>

<style scoped>
.fullscreen-artwork-background {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background: var(--auralis-artwork-background-fallback);
}
.fullscreen-artwork-background--parked {
  position: fixed;
}
</style>
