<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { PlaybackMode } from '@renderer/features/playback/types'

defineProps<{ currentMode: PlaybackMode }>()
const emit = defineEmits<{ select: [mode: PlaybackMode]; close: [] }>()

const modes: Array<{ id: PlaybackMode; label: string; icon: string }> = [
  { id: 'sequential', label: '顺序播放', icon: 'i-lucide-list-end' },
  { id: 'repeat-all', label: '列表循环', icon: 'i-lucide-repeat' },
  { id: 'repeat-one', label: '单曲循环', icon: 'i-lucide-repeat-1' },
  { id: 'shuffle', label: '随机播放', icon: 'i-lucide-shuffle' },
  { id: 'album-shuffle', label: '专辑随机', icon: 'i-lucide-disc-3' },
]

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
  <div class="playback-mode-menu" role="menu" aria-label="Playback mode">
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
