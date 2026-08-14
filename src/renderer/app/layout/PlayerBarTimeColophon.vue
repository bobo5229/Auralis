<script setup lang="ts">
import { computed } from 'vue'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { formatPlaybackClockPair } from '@renderer/features/playback/utils/formatPlaybackClock'

const playback = usePlayback()

const clockText = computed(() =>
  formatPlaybackClockPair(
    playback.state.currentTime,
    playback.state.duration,
    Boolean(playback.state.currentTrack),
  ),
)
</script>

<template>
  <p class="player-bar-time" aria-hidden="true">{{ clockText }}</p>
</template>
