<script setup lang="ts">
defineProps<{
  text: string
}>()
</script>

<template>
  <div
    class="plain-lyrics-scroll overflow-auto scrollbar-none whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-[var(--auralis-lyrics-inactive)]"
  >
    {{ text }}
  </div>
</template>

<style scoped>
.plain-lyrics-scroll::-webkit-scrollbar {
  display: none;
}
</style>
