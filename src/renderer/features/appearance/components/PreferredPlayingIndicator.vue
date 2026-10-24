<script setup lang="ts">
import PlayingIndicator from '@renderer/shared/components/PlayingIndicator.vue'
import { usePlayingIconPreference } from '../composables/usePlayingIconPreference'

defineProps<{ playing: boolean; size?: number }>()
const { playingIcon } = usePlayingIconPreference()
</script>

<template>
  <PlayingIndicator :playing="playing" :size="size" :preset="playingIcon" />
</template>
