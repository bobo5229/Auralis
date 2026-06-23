<script setup lang="ts">
import TrackProgressInfo from './TrackProgressInfo.vue'
</script>

<template>
  <footer class="player-bar">
    <div class="transport-controls">
      <button class="player-control" type="button" aria-label="Previous track">Prev</button>
      <button class="player-control-primary" type="button" aria-label="Play">Play</button>
      <button class="player-control" type="button" aria-label="Next track">Next</button>
    </div>

    <TrackProgressInfo />

    <div class="playback-actions">
      <button class="player-control" type="button" aria-label="Queue">Queue</button>
      <button class="player-control" type="button" aria-label="Play mode">Mode</button>
      <button class="player-control" type="button" aria-label="Volume">Vol</button>
    </div>
  </footer>
</template>
