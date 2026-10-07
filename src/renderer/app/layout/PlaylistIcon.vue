<script setup lang="ts">
defineProps<{ kind: 'playlist' | 'recentPlayed' | 'mostListened' | 'recentAdded' | 'custom' }>()
</script>

<template>
  <span
    class="playlist-kind-icon"
    :class="{
      'i-ph-playlist': kind === 'playlist',
      'i-ph-ranking': kind === 'mostListened',
      'i-ph-clock-counter-clockwise': kind === 'recentPlayed',
    }"
    aria-hidden="true"
  >
    <svg
      v-if="kind === 'custom' || kind === 'recentAdded'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M3 6h11M3 12h8M3 18h8" />
      <path v-if="kind === 'recentAdded'" d="M18 11v8M14 15h8" />
      <path
        v-else-if="kind === 'custom'"
        d="M18 8c.6 5 1.2 6.2 4 7-2.8.8-3.4 2-4 7-.6-5-1.2-6.2-4-7 2.8-.8 3.4-2 4-7Z"
      />
    </svg>
  </span>
</template>

<style scoped>
.playlist-kind-icon {
  display: inline-block;
  width: 1em;
  height: 1em;
  flex: 0 0 auto;
}

.playlist-kind-icon > svg {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
