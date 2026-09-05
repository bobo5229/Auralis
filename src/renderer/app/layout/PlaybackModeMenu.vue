<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getPlayerModeMenuItems,
  resolveModeMenuItemTabIndex,
  resolveModeMenuKeydown,
} from '@renderer/app/utils/playerOverlayFocus'
import type { PlayerSurfacePresentation } from '@renderer/app/utils/playerSurfacePresentation'
import type { PlaybackMode } from '@renderer/features/playback/types'

const props = defineProps<{
  currentMode: PlaybackMode
  presentation: PlayerSurfacePresentation
}>()
const emit = defineEmits<{
  select: [mode: PlaybackMode, source: 'pointer' | 'keyboard']
  close: []
}>()

const { t } = useI18n()
const element = ref<HTMLElement | null>(null)

const modes = computed<Array<{ id: PlaybackMode; label: string; icon: string }>>(() => [
  { id: 'sequential', label: t('player.modeOption.sequential'), icon: 'i-lucide-list-end' },
  { id: 'repeat-all', label: t('player.modeOption.repeat-all'), icon: 'i-lucide-repeat' },
  { id: 'repeat-one', label: t('player.modeOption.repeat-one'), icon: 'i-lucide-repeat-1' },
  { id: 'shuffle', label: t('player.modeOption.shuffle'), icon: 'i-lucide-shuffle' },
  { id: 'album-shuffle', label: t('player.modeOption.album-shuffle'), icon: 'i-lucide-disc-3' },
])

function handleSelect(mode: PlaybackMode): void {
  emit('select', mode, 'pointer')
}

// Roving tabindex: only the focused item is tabbable, so Tab exits the menu
// as a unit and Arrow / Home / End move within it (P2).
const focusedIndex = ref(-1)

function getMenuItems(): HTMLElement[] {
  const root = element.value
  return root ? getPlayerModeMenuItems(root) : []
}

function moveFocus(nextIndex: number): void {
  focusedIndex.value = nextIndex
  getMenuItems()[nextIndex]?.focus()
}

function handleKeydown(event: KeyboardEvent): void {
  const result = resolveModeMenuKeydown({
    key: event.key,
    shiftKey: event.shiftKey,
    focusedIndex: focusedIndex.value,
    modeCount: modes.value.length,
  })

  if (result.type === 'dismiss') {
    event.preventDefault()
    emit('close')
    return
  }

  if (result.type === 'roving') {
    event.preventDefault()
    moveFocus(result.nextIndex)
    return
  }

  if (result.type === 'select') {
    event.preventDefault()
    const mode = modes.value[result.modeIndex]
    if (mode) {
      emit('select', mode.id, 'keyboard')
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  // 打开后聚焦当前模式并使其成为唯一 tab 停靠点（TECHDOC §8.2）。
  const currentIndex = modes.value.findIndex((mode) => mode.id === props.currentMode)
  const initialIndex = currentIndex >= 0 ? currentIndex : 0
  focusedIndex.value = initialIndex
  getMenuItems()[initialIndex]?.focus()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    ref="element"
    class="player-overlay playback-mode-menu"
    :data-player-presentation="props.presentation"
    role="menu"
    :aria-label="t('player.mode')"
  >
    <button
      v-for="(mode, index) in modes"
      :key="mode.id"
      class="playback-mode-item"
      :class="{ 'playback-mode-item-active': currentMode === mode.id }"
      type="button"
      role="menuitem"
      :tabindex="resolveModeMenuItemTabIndex(focusedIndex, index)"
      @click="handleSelect(mode.id)"
    >
      <span class="h-4 w-4" :class="mode.icon" />
      <span>{{ mode.label }}</span>
      <span v-if="currentMode === mode.id" class="playback-mode-check i-lucide-check" />
    </button>
  </div>
</template>
