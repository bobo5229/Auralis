<script setup lang="ts">
import { computed, ref, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { LYRICS_PANEL_WIDTH } from '@renderer/features/appearance/composables/useLyricsPanelWidth'
import LyricsPanel from '@renderer/features/lyrics/components/LyricsPanel.vue'

const props = withDefaults(
  defineProps<{
    shouldMountLyrics?: boolean
    isCollapsed?: boolean
    isInteractive?: boolean
    targetWidthPx?: number
    maxWidthPx?: number
    resizeDisabled?: boolean
    isWidthResizing?: boolean
    isWidthDragging?: boolean
  }>(),
  {
    shouldMountLyrics: true,
    isCollapsed: false,
    isInteractive: true,
    targetWidthPx: undefined,
    maxWidthPx: LYRICS_PANEL_WIDTH.max,
    resizeDisabled: true,
    isWidthResizing: false,
    isWidthDragging: false,
  },
)

const emit = defineEmits<{
  editLyrics: [trigger: HTMLElement | null]
  resizePointerDown: [event: PointerEvent]
  resizeKeyDown: [event: KeyboardEvent]
  resetWidth: []
}>()

const { t } = useI18n()

const lyricsPanelRef = ref<InstanceType<typeof LyricsPanel> | null>(null)

async function prepareForDisplay(): Promise<void> {
  await lyricsPanelRef.value?.prepareForDisplay()
}

defineExpose({ prepareForDisplay })

const contentStyle = computed<CSSProperties>(() => ({
  width:
    typeof props.targetWidthPx === 'number' && props.targetWidthPx > 0
      ? `${props.targetWidthPx}px`
      : 'var(--auralis-lyrics-target-width, 20vw)',
}))
</script>

<template>
  <aside
    id="now-playing-panel"
    class="now-playing-panel"
    :class="{ 'now-playing-panel--collapsed': isCollapsed }"
    :inert="!isInteractive ? true : undefined"
    :aria-hidden="isCollapsed ? 'true' : undefined"
  >
    <div
      v-if="!isCollapsed && isInteractive"
      v-tooltip.fast="t('player.resizeLyricsPanelHint')"
      class="lyrics-resize-handle"
      :class="{ 'is-resizing': isWidthDragging }"
      role="separator"
      aria-orientation="vertical"
      aria-controls="now-playing-panel-content"
      :aria-label="t('player.resizeLyricsPanel')"
      :aria-valuemin="LYRICS_PANEL_WIDTH.min"
      :aria-valuemax="maxWidthPx"
      :aria-valuenow="targetWidthPx"
      :aria-disabled="resizeDisabled || undefined"
      :tabindex="resizeDisabled ? -1 : 0"
      @pointerdown="emit('resizePointerDown', $event)"
      @keydown="emit('resizeKeyDown', $event)"
      @dblclick.prevent.stop="emit('resetWidth')"
    />
    <div id="now-playing-panel-content" class="now-playing-panel-content" :style="contentStyle">
      <LyricsPanel
        v-if="shouldMountLyrics"
        ref="lyricsPanelRef"
        :active="!isCollapsed"
        :interactive="isInteractive && !isWidthResizing"
        @edit-lyrics="emit('editLyrics', $event)"
      />
    </div>
  </aside>
</template>
