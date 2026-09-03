import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { auralis } from '@renderer/shared/ipc/client'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { useTrackLyrics } from './useTrackLyrics'
import {
  ensureDesktopLyricsFontReady,
  formatDesktopLyricsText,
} from '../utils/formatDesktopLyricsText'
import {
  buildDesktopLyricsPayload,
  getDesktopLyricsPayloadKey,
} from '../utils/buildDesktopLyricsPayload'

const isVisible = ref(false)
const isMousePassthroughEnabled = ref(true)
let lastPayloadKey: string | null = null
let started = false
let currentTranslate: ((key: string) => string) | null = null

export function syncDesktopLyrics(force = false): void {
  if (!force && !isVisible.value) return

  const playback = usePlayback()
  const lyrics = useTrackLyrics()
  const t = currentTranslate ?? ((key: string) => key)

  const payload = buildDesktopLyricsPayload({
    track: playback.state.currentTrack,
    isPlaying: playback.state.isPlaying,
    lyricsStatus: lyrics.status.value,
    rawLyrics: lyrics.rawLyrics.value,
    parsedLines: lyrics.parsedLines.value,
    activeIndex: lyrics.activeIndex.value,
    showPrelude: lyrics.showPrelude.value,
    preludeLitDotCount: lyrics.preludeLitDotCount.value,
    loadingText: t('player.lyricsLoading'),
    emptyText: t('player.lyricsEmpty'),
    formatText: formatDesktopLyricsText,
  })

  const key = getDesktopLyricsPayloadKey(payload)
  if (!force && key === lastPayloadKey) return

  lastPayloadKey = key
  void auralis.desktopLyrics.update(payload)
}

export async function toggle(): Promise<{ visible: boolean }> {
  const result = await auralis.desktopLyrics.toggle()
  isVisible.value = result.visible
  if (result.visible) {
    syncDesktopLyrics(true)
  }
  return result
}

export async function toggleMousePassthrough(): Promise<{ enabled: boolean }> {
  const result = await auralis.desktopLyrics.toggleMousePassthrough()
  isMousePassthroughEnabled.value = result.enabled
  return result
}

export function useDesktopLyricsSync() {
  const { t } = useI18n()
  currentTranslate = t

  if (!started) {
    started = true
    const playback = usePlayback()
    const lyrics = useTrackLyrics()
    const { displayMode } = usePlayerDisplayMode()

    watch(
      displayMode,
      (mode) => {
        void auralis.desktopLyrics.setSuppressed(mode === 'fullscreen')
      },
      { immediate: true },
    )

    // Do not watch currentTime — it fires every media tick. Line changes already
    // surface via activeIndex / preludeLitDotCount; track/play/status cover the rest.
    watch(
      () => [
        playback.state.currentTrackId,
        playback.state.currentTrack?.title,
        playback.state.currentTrack?.artist,
        playback.state.isPlaying,
        lyrics.status.value,
        lyrics.rawLyrics.value,
        lyrics.activeIndex.value,
        lyrics.showPrelude.value,
        lyrics.preludeLitDotCount.value,
        lyrics.parsedLines.value.length,
      ],
      () => {
        syncDesktopLyrics()
      },
      { immediate: true },
    )

    void ensureDesktopLyricsFontReady().then(() => {
      if (isVisible.value) {
        syncDesktopLyrics(true)
      }
    })

    void auralis.desktopLyrics.isVisible().then((result) => {
      isVisible.value = result.visible
      if (result.visible) {
        syncDesktopLyrics(true)
      }
    })

    void auralis.desktopLyrics.isMousePassthroughEnabled().then((result) => {
      isMousePassthroughEnabled.value = result.enabled
    })

    auralis.desktopLyrics.onVisibilityChanged((visible) => {
      isVisible.value = visible
      if (visible) {
        syncDesktopLyrics(true)
      }
    })

    auralis.desktopLyrics.onMousePassthroughChanged((enabled) => {
      isMousePassthroughEnabled.value = enabled
    })
  }

  return {
    isVisible,
    isMousePassthroughEnabled,
    toggle,
    toggleMousePassthrough,
    syncDesktopLyrics,
  }
}
