<script setup lang="ts">
import type { ArtistIndexLetter } from '@shared/utils/artistIndex'

defineProps<{
  anchors: readonly { letter: ArtistIndexLetter; rowIndex: number | null }[]
  label: string
  current?: ArtistIndexLetter | null
}>()
const emit = defineEmits<{ select: [index: number] }>()
</script>

<template>
  <nav :aria-label="label">
    <button
      v-for="anchor in anchors"
      :key="anchor.letter"
      :class="{
        'artist-index-letter--other': anchor.letter === '#',
        'artist-index-letter--current': anchor.letter === current,
      }"
      :aria-current="anchor.letter === current ? 'location' : undefined"
      type="button"
      :disabled="anchor.rowIndex === null"
      @click="anchor.rowIndex !== null && emit('select', anchor.rowIndex)"
    >
      {{ anchor.letter }}
    </button>
    <slot />
  </nav>
</template>

<style>
.main-artist-index {
  position: absolute;
  top: 8px;
  right: 2px;
  bottom: var(--auralis-playbar-safe-area);
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: safe center;
  width: 24px;
  overflow-y: auto;
  scrollbar-width: none;
}
.main-artist-index::-webkit-scrollbar {
  display: none;
}
.main-artist-index button {
  flex: 0 0 auto;
  width: 24px;
  height: 18px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--auralis-text-muted);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}
.main-artist-index .artist-index-letter--current:not(:disabled) {
  color: var(--auralis-theme-accent);
  font-weight: 700;
}
.main-artist-index button:disabled {
  opacity: 0.35;
  cursor: default;
}
.main-artist-index button:hover:not(:disabled) {
  color: var(--auralis-theme-accent);
}
.main-artist-index button:focus-visible {
  outline: 2px solid var(--auralis-theme-accent);
  outline-offset: -2px;
}
.artist-index-scroll {
  margin-right: 28px;
  scrollbar-width: none !important;
  scrollbar-gutter: auto !important;
}
.artist-index-scroll::-webkit-scrollbar {
  display: none;
}
</style>
