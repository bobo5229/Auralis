<script setup lang="ts">
import PlayingIndicator from './PlayingIndicator.vue'
import { usePlayingIconPreference } from '../composables/usePlayingIconPreference'

defineProps<{ playing: boolean; size?: number }>()
const { playingIcon } = usePlayingIconPreference()
</script>

<template>
  <PlayingIndicator :playing="playing" :size="size" :preset="playingIcon" />
</template>
