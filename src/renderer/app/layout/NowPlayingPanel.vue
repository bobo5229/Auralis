<script setup lang="ts">
import LyricsPanel from '@renderer/features/lyrics/components/LyricsPanel.vue'
import type { PlayerSurfacePresentation } from '@renderer/app/utils/playerSurfacePresentation'

defineProps<{ presentation: PlayerSurfacePresentation }>()
</script>

<template>
  <aside class="now-playing-panel" :data-player-presentation="presentation">
    <LyricsPanel />
  </aside>
</template>
