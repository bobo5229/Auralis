<script setup lang="ts">
defineProps<{
  text: string
}>()
</script>

<template>
  <div
    class="plain-lyrics-scroll min-h-0 flex-1 overflow-y-auto scrollbar-none whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-[var(--auralis-lyrics-inactive)]"
  >
    {{ text }}
  </div>
</template>

<style scoped>
.plain-lyrics-scroll::-webkit-scrollbar {
  display: none;
}

.plain-lyrics-scroll {
  overflow-wrap: anywhere;
}
</style>
