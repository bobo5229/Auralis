<script setup lang="ts">
import { ref } from 'vue'
import FluidArtworkBackground from './FluidArtworkBackground.vue'
import { useFullscreenArtworkBackground } from '../composables/useFullscreenArtworkBackground'

const props = defineProps<{
  target: HTMLElement | null
  artworkUrl: string | null
  active: boolean
  playing: boolean
  motionPaused: boolean
  deferInitialization?: boolean
}>()
const surface = ref<HTMLElement | null>(null)
const background = useFullscreenArtworkBackground(props)
</script>

<template>
  <Teleport :to="target ?? 'body'">
    <div
      ref="surface"
      class="fullscreen-artwork-background"
      :class="{ 'fullscreen-artwork-background--parked': target === null }"
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
      />
    </div>
  </Teleport>
</template>

<style scoped>
.fullscreen-artwork-background {
  --auralis-artwork-background-fallback: var(--auralis-fullscreen-bg, #15181d);

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
