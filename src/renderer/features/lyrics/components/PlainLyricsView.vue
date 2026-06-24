<script setup lang="ts">
defineProps<{
  text: string
}>()
</script>

<template>
  <div
    class="overflow-auto whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-[var(--auralis-lyrics-inactive)]"
  >
    {{ text }}
  </div>
</template>
