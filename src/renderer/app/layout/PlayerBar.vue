<script setup lang="ts">
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import TrackProgressInfo from './TrackProgressInfo.vue'

const playback = usePlayback()

function handlePlayPause(): void {
  playback.togglePlayPause()
}

function handlePrev(): void {
  playback.playPrevious()
}

function handleNext(): void {
  playback.playNext()
}
</script>

<template>
  <footer class="player-bar">
    <div class="transport-controls">
      <button class="player-control" type="button" aria-label="Previous track" @click="handlePrev">
        Prev
      </button>
      <button
        class="player-control-primary"
        type="button"
        :aria-label="playback.state.isPlaying ? 'Pause' : 'Play'"
        @click="handlePlayPause"
      >
        {{ playback.state.isPlaying ? 'Pause' : 'Play' }}
      </button>
      <button class="player-control" type="button" aria-label="Next track" @click="handleNext">
        Next
      </button>
    </div>

    <TrackProgressInfo />

    <div class="playback-actions">
      <button class="player-control" type="button" aria-label="Queue">Queue</button>
      <button class="player-control" type="button" aria-label="Play mode">Mode</button>
      <input
        type="range"
        class="volume-slider"
        min="0"
        max="1"
        step="0.01"
        :value="playback.state.volume"
        aria-label="Volume"
        @input="playback.setVolume(Number(($event.target as HTMLInputElement).value))"
      />
    </div>
  </footer>
</template>
