<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { startFloatingPosition } from '@renderer/shared/floating/floatingPosition'
import { useI18n } from 'vue-i18n'
import {
  getPlayerModeMenuItems,
  resolveModeMenuItemTabIndex,
  resolveModeMenuKeydown,
} from '@renderer/app/utils/playerOverlayFocus'
import type { PlaybackMode } from '@renderer/features/playback/types'
import { usePlaybackModePresentation } from '@renderer/features/playback/composables/usePlaybackModePresentation'
import FrostedSurface from '@renderer/shared/components/FrostedSurface.vue'
import PlayerBarActionIcon from './PlayerBarActionIcon.vue'

const props = defineProps<{
  currentMode: PlaybackMode
  playbar?: boolean
  anchor?: HTMLElement | null
  verticalAnchor?: HTMLElement | null
}>()
const emit = defineEmits<{
  select: [mode: PlaybackMode, source: 'pointer' | 'keyboard']
  close: []
}>()

const { t, locale } = useI18n()
const element = ref<HTMLElement | null>(null)
let floatingPosition: ReturnType<typeof startFloatingPosition> | undefined

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
  if (props.anchor && element.value) {
    const anchor = props.anchor
    floatingPosition = startFloatingPosition({
      reference: {
        contextElement: anchor,
        getBoundingClientRect: () => {
          const rect = anchor.getBoundingClientRect()
          const top = props.verticalAnchor?.getBoundingClientRect().top ?? rect.top
          return new DOMRect(rect.x, top, rect.width, rect.height)
        },
      },
      floating: element.value,
      profile: 'popover',
      placement: 'top-end',
      fallbackPlacements: ['top-start', 'bottom-end'],
      gap: 32,
      onPosition: (_result, first) => {
        if (first) getMenuItems()[initialIndex]?.focus()
      },
      onError: () => emit('close'),
    })
  } else {
    getMenuItems()[initialIndex]?.focus()
  }
})
onBeforeUnmount(() => floatingPosition?.dispose())
</script>

<template>
  <div
    ref="element"
    class="player-overlay playback-mode-menu"
    :class="{ 'playback-mode-menu--playbar': playbar }"
    :style="anchor ? { position: 'fixed', bottom: 'auto', right: 'auto' } : undefined"
    role="menu"
    :aria-label="t('player.mode')"
    @keydown="handleKeydown"
  >
    <FrostedSurface v-if="playbar" />
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
        <span class="playback-mode-option">
          <span>{{ mode.label }}</span>
          <small v-if="locale === 'en' && mode.description" class="playback-mode-description">{{
            mode.description
          }}</small>
        </span>
        <span v-if="currentMode === mode.id" class="playback-mode-check" aria-hidden="true">
          <PlayerBarActionIcon icon="i-ph-check" size="compact" />
        </span>
      </button>
      <div v-if="index < modes.length - 1" class="playback-mode-divider" role="separator" />
    </template>
  </div>
</template>

<style scoped>
.playback-mode-option {
  min-width: 0;
  flex: 1;
}
.playback-mode-description {
  display: block;
  margin-top: 2px;
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  color: var(--auralis-text-muted);
  font-weight: 400;
}
.playback-mode-menu--playbar {
  isolation: isolate;
  border: none;
  background: transparent;
  box-shadow: none;
}
</style>
