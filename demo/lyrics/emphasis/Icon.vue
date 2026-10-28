<script setup>
defineProps({ name: String })
const paths = {
  play: 'm9 5 11 7-11 7Z',
  pause: 'M8 5v14M16 5v14',
  edit: 'm16 3 5 5M4 15 16 3l5 5L9 20l-6 1Z',
  undo: 'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12',
  replay: 'M4 10a8 8 0 1 1 1 8M4 4v6h6',
  check: 'm5 12 4 4L19 6',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  close: 'm6 6 12 12M6 18 18 6',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  volume: 'M11 4 5 9H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  note: 'M9 18V5l11-2v13M9 8l11-2M9 18a3 2 0 1 1-6 0 3 2 0 0 1 6 0m11-2a3 2 0 1 1-6 0 3 2 0 0 1 6 0',
  next: 'm5 5 10 7-10 7ZM19 5v14',
}
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.note" />
  </svg>
</template>
