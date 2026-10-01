<script setup lang="ts">
defineProps<{ kind: 'playlist' | 'recentPlayed' | 'mostListened' | 'custom' }>()
</script>

<template>
  <span
    class="playlist-kind-icon"
    :class="{
      'i-ph-playlist': kind === 'playlist',
      'i-lucide-headphones': kind === 'mostListened',
      'i-lucide-edit': kind === 'custom',
    }"
    aria-hidden="true"
  >
    <svg
      v-if="kind === 'recentPlayed'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6" />
      <circle cx="14" cy="12" r="5" />
      <path d="M14 9v3l2 1" />
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
