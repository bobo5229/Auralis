<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PlaybackMode } from '@renderer/features/playback/types'

defineProps<{ currentMode: PlaybackMode }>()
const emit = defineEmits<{ select: [mode: PlaybackMode]; close: [] }>()

const { t } = useI18n()

const modes = computed<Array<{ id: PlaybackMode; label: string; icon: string }>>(() => [
  { id: 'sequential', label: t('player.modeOption.sequential'), icon: 'i-lucide-list-end' },
  { id: 'repeat-all', label: t('player.modeOption.repeat-all'), icon: 'i-lucide-repeat' },
  { id: 'repeat-one', label: t('player.modeOption.repeat-one'), icon: 'i-lucide-repeat-1' },
  { id: 'shuffle', label: t('player.modeOption.shuffle'), icon: 'i-lucide-shuffle' },
  { id: 'album-shuffle', label: t('player.modeOption.album-shuffle'), icon: 'i-lucide-disc-3' },
])

function handleSelect(mode: PlaybackMode): void {
  emit('select', mode)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="playback-mode-menu" role="menu" :aria-label="t('player.mode')">
    <button
      v-for="mode in modes"
      :key="mode.id"
      class="playback-mode-item"
      :class="{ 'playback-mode-item-active': currentMode === mode.id }"
      type="button"
      role="menuitem"
      @click="handleSelect(mode.id)"
    >
      <span class="h-4 w-4" :class="mode.icon" />
      <span>{{ mode.label }}</span>
      <span v-if="currentMode === mode.id" class="playback-mode-check i-lucide-check" />
    </button>
  </div>
</template>
