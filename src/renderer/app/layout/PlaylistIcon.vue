<script setup lang="ts">
defineProps<{ kind: 'playlist' | 'recentPlayed' | 'mostListened' | 'recentAdded' | 'custom' }>()
</script>

<template>
  <span
    class="playlist-kind-icon"
    :class="{
      'i-ph-ranking': kind === 'mostListened',
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
    <svg
      v-else-if="kind === 'playlist'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M6 9a7 7 0 1 1 9 9" />
      <circle cx="9" cy="15" r="7" />
      <circle cx="9" cy="15" r="2" />
    </svg>
    <svg
      v-else-if="kind === 'custom' || kind === 'recentAdded'"
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
