<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getPlayerModeMenuItems,
  resolveModeMenuItemTabIndex,
  resolveModeMenuKeydown,
} from '@renderer/app/utils/playerOverlayFocus'
import type { PlaybackMode } from '@renderer/features/playback/types'
import { usePlaybackModePresentation } from '@renderer/features/playback/composables/usePlaybackModePresentation'
import type { PlaybarStyle } from '@renderer/features/appearance/composables/usePlaybarStyle'
import FrostedSurface from '@renderer/shared/components/FrostedSurface.vue'
import PlayerBarActionIcon from './PlayerBarActionIcon.vue'

const props = defineProps<{
  currentMode: PlaybackMode
  material?: PlaybarStyle
}>()
const emit = defineEmits<{
  select: [mode: PlaybackMode, source: 'pointer' | 'keyboard']
  close: []
}>()

const { t } = useI18n()
const element = ref<HTMLElement | null>(null)

const { options: modes } = usePlaybackModePresentation(() => props.currentMode)

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
    event.stopPropagation()
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
  // 打开后聚焦当前模式并使其成为唯一 tab 停靠点（TECHDOC §8.2）。
  const currentIndex = modes.value.findIndex((mode) => mode.id === props.currentMode)
  const initialIndex = currentIndex >= 0 ? currentIndex : 0
  focusedIndex.value = initialIndex
  getMenuItems()[initialIndex]?.focus()
})
</script>

<template>
  <div
    ref="element"
    class="player-overlay playback-mode-menu"
    :class="{ 'playback-mode-menu--playbar': material !== undefined }"
    role="menu"
    :aria-label="t('player.mode')"
    @keydown="handleKeydown"
  >
    <FrostedSurface
      v-if="material !== undefined"
      :frosted="material === 'frosted'"
      plain-background="var(--auralis-playbar-bg)"
    />
    <template v-for="(mode, index) in modes" :key="mode.id">
      <button
        v-tooltip="mode.description"
        class="playback-mode-item"
        :class="{
          'playback-mode-item-active': currentMode === mode.id,
          'playback-mode-item-first': index === 0,
          'playback-mode-item-middle': index > 0 && index < modes.length - 1,
          'playback-mode-item-last': index === modes.length - 1,
        }"
        type="button"
        role="menuitemradio"
        :aria-checked="currentMode === mode.id"
        :aria-label="mode.description ? `${mode.label} · ${mode.description}` : mode.label"
        :tabindex="resolveModeMenuItemTabIndex(focusedIndex, index)"
        @focus="focusedIndex = index"
        @click="handleSelect(mode.id)"
      >
        <PlayerBarActionIcon :icon="mode.icon" size="playback-mode" />
        <span>{{ mode.label }}</span>
        <span v-if="currentMode === mode.id" class="playback-mode-check" aria-hidden="true">
          <PlayerBarActionIcon icon="i-ph-check" size="compact" />
        </span>
      </button>
      <div v-if="index < modes.length - 1" class="playback-mode-divider" role="separator" />
    </template>
  </div>
</template>

<style scoped>
.playback-mode-menu--playbar {
  isolation: isolate;
  border: none;
  background: transparent;
  box-shadow: none;
}
</style>
