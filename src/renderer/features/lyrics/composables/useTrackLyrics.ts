import { computed, ref, watch } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import type { LyricLine } from '../types'
import { parseLrc } from '../utils/parseLrc'
import { getActiveLyricIndex } from '../utils/getActiveLyricIndex'

export type LyricsStatus = 'no-track' | 'loading' | 'empty' | 'plain' | 'lrc'

// Module-level singleton — shared by LyricsPanel, PlayerBar, FullscreenPlayerOverlay.
// One fetch, one onChanged subscription, one set of reactive state for the whole renderer.
const playback = usePlayback()

const status = ref<LyricsStatus>('no-track')
const rawLyrics = ref<string | null>(null)
const parsedLines = ref<LyricLine[]>([])

/** Monotonic token so out-of-order async responses cannot clobber newer state. */
let fetchRequestToken = 0

const activeIndex = computed(() => {
  if (status.value !== 'lrc') return -1
  return getActiveLyricIndex(parsedLines.value, playback.state.currentTime)
})

const canShowPrelude = computed(
  () =>
    status.value === 'lrc' && parsedLines.value.length > 0 && parsedLines.value[0].timeSeconds >= 3,
)

const isPrelude = computed(() => {
  if (!canShowPrelude.value) return false
  const first = parsedLines.value[0]
  return (
    playback.state.currentTime < first.timeSeconds &&
    playback.state.currentTime >= first.timeSeconds - 3
  )
})

const showPrelude = computed(() => {
  if (!canShowPrelude.value) return false
  return playback.state.currentTime >= parsedLines.value[0].timeSeconds - 3
})

const preludeLitDotCount = computed(() => {
  if (!showPrelude.value) return 0
  const secondsUntilFirstLine = parsedLines.value[0].timeSeconds - playback.state.currentTime
  if (secondsUntilFirstLine <= 0) return 3
  return Math.min(3, Math.max(1, Math.floor(3 - secondsUntilFirstLine) + 1))
})

function reset(): void {
  status.value = 'no-track'
  rawLyrics.value = null
  parsedLines.value = []
}

async function fetchLyrics(trackId: number): Promise<void> {
  const requestToken = ++fetchRequestToken
  status.value = 'loading'
  rawLyrics.value = null
  parsedLines.value = []

  try {
    const result = await auralis.lyrics.getByTrackId(trackId)

    // Drop stale responses (track changed or a newer fetch started)
    if (requestToken !== fetchRequestToken || playback.state.currentTrackId !== trackId) {
      return
    }

    if (!result?.lyricsText || !result.lyricsFormat) {
      status.value = 'empty'
      return
    }

    if (result.lyricsFormat === 'lrc') {
      const parsed = parseLrc(result.lyricsText)
      if (parsed.length === 0) {
        // LRC 解析失败，降级为 plain 显示
        rawLyrics.value = result.lyricsText
        status.value = 'plain'
        return
      }
      rawLyrics.value = result.lyricsText
      parsedLines.value = parsed
      status.value = 'lrc'
    } else {
      rawLyrics.value = result.lyricsText
      status.value = 'plain'
    }
  } catch {
    if (requestToken !== fetchRequestToken || playback.state.currentTrackId !== trackId) {
      return
    }
    status.value = 'empty'
  }
}

watch(
  () => playback.state.currentTrackId,
  (trackId) => {
    if (!trackId) {
      fetchRequestToken += 1
      reset()
      return
    }
    void fetchLyrics(trackId)
  },
  { immediate: true },
)

// Subscribe once for the process lifetime (singleton; no per-component unmount).
auralis.library.onChanged((event) => {
  const trackId = playback.state.currentTrackId
  if (!trackId) return

  if (
    event.reason === 'metadata-refresh' ||
    event.reason === 'file-change' ||
    event.reason === 'track-relocated'
  ) {
    if (event.trackIds.includes(trackId)) {
      void fetchLyrics(trackId)
    }
  }
})

export function useTrackLyrics() {
  return {
    status,
    rawLyrics,
    parsedLines,
    activeIndex,
    isPrelude,
    showPrelude,
    preludeLitDotCount,
  }
}
