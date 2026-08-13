<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getPlayerOverlayFocusables,
  resolvePlayerOverlayKeyAction,
} from '@renderer/app/utils/playerOverlayFocus'
import type { PlayerSurfacePresentation } from '@renderer/app/utils/playerSurfacePresentation'
import type { PlaybackMode } from '@renderer/features/playback/types'

const props = defineProps<{
  currentMode: PlaybackMode
  presentation: PlayerSurfacePresentation
}>()
const emit = defineEmits<{ select: [mode: PlaybackMode]; close: [] }>()

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
  emit('select', mode)
}

function getActiveFocusIndex(focusables: HTMLElement[]): number {
  const active = document.activeElement
  return focusables.findIndex((item) => item === active)
}

function handleKeydown(event: KeyboardEvent): void {
  const root = element.value
  if (!root) return

  const focusables = getPlayerOverlayFocusables(root)
  const action = resolvePlayerOverlayKeyAction({
    key: event.key,
    shiftKey: event.shiftKey,
    kind: 'mode-menu',
    focusableCount: focusables.length,
    activeIndex: getActiveFocusIndex(focusables),
  })

  if (action.type === 'dismiss') {
    event.preventDefault()
    emit('close')
    return
  }

  if (action.type === 'roving') {
    event.preventDefault()
    focusables[action.nextIndex]?.focus()
    return
  }

  if (action.type === 'select') {
    event.preventDefault()
    focusables[getActiveFocusIndex(focusables)]?.click()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  // 打开后聚焦当前模式；若不存在（不应发生）则聚焦首项（TECHDOC §8.2）。
  const root = element.value
  if (root) {
    const focusables = getPlayerOverlayFocusables(root)
    const currentIndex = modes.value.findIndex((mode) => mode.id === props.currentMode)
    const target = currentIndex >= 0 ? focusables[currentIndex] : focusables[0]
    target?.focus()
  }
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
