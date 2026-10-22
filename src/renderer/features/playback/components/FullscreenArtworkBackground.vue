<script setup lang="ts">
import { ref } from 'vue'
import FluidArtworkBackground from './FluidArtworkBackground.vue'
import { useFullscreenArtworkBackground } from '../composables/useFullscreenArtworkBackground'
import type { FullscreenBackgroundMode } from '../composables/useFullscreenBackground'

const props = defineProps<{
  mode: FullscreenBackgroundMode
  target: HTMLElement | null
  artworkUrl: string | null
  active: boolean
  playing: boolean
  motionPaused: boolean
  deferInitialization?: boolean
}>()
const emit = defineEmits<{
  fallback: [mode: FullscreenBackgroundMode]
}>()
const surface = ref<HTMLElement | null>(null)
const background = useFullscreenArtworkBackground(props, (mode) => emit('fallback', mode))
</script>

<template>
  <Teleport :to="target ?? 'body'">
    <div
      ref="surface"
      class="fullscreen-artwork-background"
      :class="{ 'fullscreen-artwork-background--parked': target === null }"
      :data-background-presentation="mode"
      :style="{ visibility: target === null ? 'hidden' : 'visible' }"
      aria-hidden="true"
    >
      <FluidArtworkBackground
        :target="surface"
        :artwork-url="artworkUrl"
        :enabled="background.fluidEnabled.value"
        :active="background.fluidActive.value"
        :playing="playing"
        :visible="background.fluidVisible.value"
        :window-visible="background.windowVisible.value"
        :motion-paused="motionPaused"
        :defer-initialization="deferInitialization"
        @unavailable="background.onFluidUnavailable"
        @lost="background.onFluidLost"
      />
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
.fullscreen-artwork-background[data-background-presentation='solid'] {
  background: var(--auralis-fullscreen-solid-bg);
}
</style>
