import { computed, nextTick, ref, watch, type Ref } from 'vue'
import { useDisplayedTrackLyrics } from './useDisplayedTrackLyrics'
import { useFullscreenLyricsTypography } from './useFullscreenLyricsTypography'
import { useLyricLineSeek } from './useLyricLineSeek'
import {
  FULLSCREEN_LYRICS_FADE_TOP_RATIO,
  FULLSCREEN_LYRICS_FADE_BOTTOM_RATIO,
  FULLSCREEN_LYRICS_ACTIVE_SCALE,
  useFullscreenLyricsViewport,
} from './useFullscreenLyricsViewport'
import { useLyricsScrollPreset } from '../lyricsScrollPreset'
import { useLyricsCountdownPreference } from '../lyricsCountdownPreference'
import type { LyricLine } from '../types'

interface Options {
  isOpen: Readonly<Ref<boolean>>
  currentTrackId: Readonly<Ref<number | null>>
  reducedMotion: Readonly<Ref<boolean>>
  artworkRef: Ref<HTMLElement | null>
}

/** Owns the displayed lyrics, viewport, seek actions and deferred layout refresh. */
export function useFullscreenLyricsPresentation(options: Options) {
  const { isOpen: isFullscreenPlayerOpen, artworkRef } = options
  const lyricsScrollRef = ref<HTMLElement | null>(null)
  const lyricsTrackRef = ref<HTMLElement | null>(null)
  const { preset: lyricsScrollPreset } = useLyricsScrollPreset()
  const { effect: countdownEffect } = useLyricsCountdownPreference()
  const { preference: lyricsTypography, style: lyricsTypographyStyle } =
    useFullscreenLyricsTypography()
  let lyricsLayoutRefreshFrame = 0

  const {
    status: lyricsStatus,
    rawLyrics,
    parsedLines,
    activeIndex,
    isPrelude,
    showPrelude,
    preludeLitDotCount,
    preludeElapsed,
  } = useDisplayedTrackLyrics()

  const fullscreenLyricLines = computed<LyricLine[]>(() => {
    if (lyricsStatus.value === 'plain' && rawLyrics.value) {
      return rawLyrics.value
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line, index) => ({
          id: `plain-${index}`,
          timeSeconds: index,
          text: line,
        }))
    }

    return lyricsStatus.value === 'lrc' ? parsedLines.value : []
  })

  const wholeLineLyrics = computed(() => lyricsStatus.value === 'lrc')

  const {
    topPadding: lyricsTopPadding,
    bottomPadding: lyricsBottomPadding,
    pauseAutoFollow: pauseFullscreenLyricAutoFollow,
    onWheel: handleFullscreenLyricsWheel,
    onKeydown: handleFullscreenLyricsKeydown,
    refresh: refreshFullscreenLyrics,
    renderedLines: renderedLyricLines,
  } = useFullscreenLyricsViewport({
    scrollRef: lyricsScrollRef,
    trackRef: lyricsTrackRef,
    currentTrackId: options.currentTrackId,
    lyricsStatus,
    lineCount: computed(() => fullscreenLyricLines.value.length),
    activeIndex,
    isPrelude,
    showPrelude,
    isOpen: isFullscreenPlayerOpen,
    reducedMotion: options.reducedMotion,
    scrollPreset: lyricsScrollPreset,
    wholeLineMode: wholeLineLyrics,
    lines: fullscreenLyricLines,
    artworkRef,
  })

  const lyricsMaskStyle = computed(() => ({
    ...lyricsTypographyStyle.value,
    '--fullscreen-lyrics-fade-top': `${FULLSCREEN_LYRICS_FADE_TOP_RATIO * 100}%`,
    '--fullscreen-lyrics-fade-bottom': `${(1 - FULLSCREEN_LYRICS_FADE_BOTTOM_RATIO) * 100}%`,
    '--fullscreen-lyric-active-scale': FULLSCREEN_LYRICS_ACTIVE_SCALE,
  }))

  const { activate: seekToLyricLine, onKeydown: handleLyricLineKeydown } = useLyricLineSeek({
    lines: () => fullscreenLyricLines.value,
    enabled: () => lyricsStatus.value === 'lrc',
    onSeek: () => {
      void nextTick(() => refreshFullscreenLyrics('smooth'))
    },
  })

  function cancelLyricsLayoutRefresh(): void {
    if (!lyricsLayoutRefreshFrame) return
    cancelAnimationFrame(lyricsLayoutRefreshFrame)
    lyricsLayoutRefreshFrame = 0
  }

  function scheduleLyricsLayoutRefresh(): void {
    cancelLyricsLayoutRefresh()
    if (!isFullscreenPlayerOpen.value) return
    lyricsLayoutRefreshFrame = requestAnimationFrame(() => {
      lyricsLayoutRefreshFrame = 0
      if (!isFullscreenPlayerOpen.value) return
      refreshFullscreenLyrics('auto', true)
    })
  }

  watch(
    () => [
      lyricsTypography.value.fontSizePercent,
      lyricsTypography.value.fontWeight,
      lyricsTypography.value.lineGapPercent,
      fullscreenLyricLines.value,
    ],
    scheduleLyricsLayoutRefresh,
    { flush: 'post' },
  )

  watch(
    isFullscreenPlayerOpen,
    (isOpen) => {
      if (!isOpen) {
        cancelLyricsLayoutRefresh()
      }
    },
    { flush: 'sync' },
  )

  return {
    lyricsStatus,
    fullscreenLyricLines,
    activeIndex,
    isPrelude,
    showPrelude,
    preludeLitDotCount,
    preludeElapsed,
    countdownEffect,
    wholeLineLyrics,
    lyricsScrollRef,
    lyricsTrackRef,
    lyricsTopPadding,
    lyricsBottomPadding,
    lyricsMaskStyle,
    renderedLyricLines,
    pauseFullscreenLyricAutoFollow,
    handleFullscreenLyricsWheel,
    handleFullscreenLyricsKeydown,
    refreshFullscreenLyrics,
    seekToLyricLine,
    handleLyricLineKeydown,
    dispose: cancelLyricsLayoutRefresh,
  }
}
