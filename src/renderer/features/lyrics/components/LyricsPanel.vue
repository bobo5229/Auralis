<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import type { ChineseScript } from '@renderer/features/appearance/utils/chineseText'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { useDisplayedTrackLyrics } from '../composables/useDisplayedTrackLyrics'
import { useLyricsEffectsPreference } from '../lyricsEffectsPreference'
import FullscreenLyricsContextMenu from './FullscreenLyricsContextMenu.vue'
import SyncedLyricsView from './SyncedLyricsView.vue'
import PlainLyricsView from './PlainLyricsView.vue'
import LyricsEmptyState from './LyricsEmptyState.vue'

const { t } = useI18n()
const { effects } = useLyricsEffectsPreference()
const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const emit = defineEmits<{
  editLyrics: [trigger: HTMLElement | null]
}>()
const { displayMode } = usePlayerDisplayMode()
const { lyricsScript, setLyricsScript, lyricsPersistFailed } = useChineseTextDisplay()
const {
  status,
  rawLyrics,
  parsedLines,
  activeIndex,
  isPrelude,
  showPrelude,
  preludeLitDotCount,
  preludeElapsed,
} = useDisplayedTrackLyrics()
const panelRef = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const anchor = ref({ clientX: 0, clientY: 0 })
const enabled = computed(
  () =>
    props.active &&
    displayMode.value === 'normal' &&
    ((status.value === 'lrc' && parsedLines.value.length > 0) ||
      (status.value === 'plain' && !!rawLyrics.value?.trim())),
)

function scrollElement(): HTMLElement | null {
  return panelRef.value?.querySelector('.synced-lyrics-scroll, .plain-lyrics-scroll') ?? null
}

function closeMenu(restoreFocus = false): void {
  menuOpen.value = false
  if (restoreFocus)
    void nextTick(() => {
      if (enabled.value) scrollElement()?.focus({ preventScroll: true })
    })
}

function onMenuClose(reason: string): void {
  closeMenu(reason === 'escape' || reason === 'position-error')
}

function selectScript(script: ChineseScript): void {
  setLyricsScript(script)
  closeMenu(true)
}

function onEditLyrics(): void {
  const trigger = scrollElement()
  closeMenu()
  emit('editLyrics', trigger)
}

function openMenu(clientX?: number, clientY?: number): void {
  if (!enabled.value) return
  const rect = scrollElement()?.getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) return
  anchor.value = {
    clientX: clientX ?? Math.round(rect.left + rect.width / 2),
    clientY: clientY ?? Math.round(rect.top + rect.height / 2),
  }
  menuOpen.value = true
}

function onContextMenu(event: MouseEvent): void {
  if (!enabled.value) return
  event.preventDefault()
  event.stopPropagation()
  if (event.clientX === 0 && event.clientY === 0) {
    if (!menuOpen.value) openMenu()
  } else openMenu(event.clientX, event.clientY)
}

function onKeydown(event: KeyboardEvent): void {
  if (!enabled.value || !(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)))
    return
  event.preventDefault()
  event.stopPropagation()
  openMenu()
}

function onPointerDown(event: PointerEvent): void {
  // Opening a context menu keeps the synchronous lyrics following playback.
  if (enabled.value && event.button === 2) event.stopPropagation()
}

watch(
  () => [enabled.value, status.value, parsedLines.value, rawLyrics.value],
  () => closeMenu(),
  { flush: 'sync' },
)
</script>

<template>
  <div
    ref="panelRef"
    class="lyrics-panel relative flex h-full min-h-0 flex-col"
    @contextmenu="onContextMenu"
    @keydown.capture="onKeydown"
    @pointerdown.capture="onPointerDown"
  >
    <div
      class="flex min-h-0 flex-1 flex-col overflow-hidden"
      :style="
        status === 'lrc' && effects.edgeFade
          ? {
              maskImage:
                'linear-gradient(to bottom, transparent 0, black 120px, black calc(100% - 120px), transparent 100%)',
            }
          : undefined
      "
    >
      <div v-if="status === 'no-track'" class="flex h-full items-center justify-center">
        <p class="text-sm text-[var(--auralis-text-faint)]">{{ t('player.lyricsNoTrack') }}</p>
      </div>

      <div v-else-if="status === 'loading'" class="flex h-full items-center justify-center">
        <p class="text-sm text-[var(--auralis-text-faint)]">{{ t('player.lyricsLoading') }}</p>
      </div>

      <LyricsEmptyState v-else-if="status === 'empty'" />

      <PlainLyricsView
        v-else-if="status === 'plain' && rawLyrics"
        :text="rawLyrics"
        tabindex="0"
        :aria-haspopup="enabled ? 'menu' : undefined"
        :aria-expanded="menuOpen"
        :aria-controls="menuOpen ? 'normal-lyrics-context-menu' : undefined"
      />

      <SyncedLyricsView
        v-else-if="status === 'lrc'"
        :active="active"
        :lines="parsedLines"
        :active-index="activeIndex"
        :is-prelude="isPrelude"
        :show-prelude="showPrelude"
        :prelude-lit-dot-count="preludeLitDotCount"
        :prelude-elapsed="preludeElapsed"
        :aria-haspopup="enabled ? 'menu' : undefined"
        :aria-expanded="menuOpen"
        :aria-controls="menuOpen ? 'normal-lyrics-context-menu' : undefined"
      />
    </div>
    <p v-if="enabled && lyricsPersistFailed" class="lyrics-panel-save-status" role="status">
      {{ t('fullscreen.lyricsContextMenu.persistFailed') }}
    </p>
    <Teleport to="body">
      <div class="lyrics-menu-overlay">
        <FullscreenLyricsContextMenu
          id="normal-lyrics-context-menu"
          :open="menuOpen"
          :anchor="anchor"
          :current-script="lyricsScript"
          :show-edit-lyrics="true"
          @select="selectScript"
          @edit-lyrics="onEditLyrics"
          @close="onMenuClose"
        />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.lyrics-panel-save-status {
  position: absolute;
  right: 16px;
  bottom: 12px;
  left: 16px;
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--auralis-text);
  background: var(--auralis-context-menu-bg);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  pointer-events: none;
}
</style>
