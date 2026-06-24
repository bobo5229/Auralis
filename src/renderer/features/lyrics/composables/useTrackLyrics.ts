import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import type { LyricLine } from '../types'
import { parseLrc } from '../utils/parseLrc'
import { getActiveLyricIndex } from '../utils/getActiveLyricIndex'

export type LyricsStatus = 'no-track' | 'loading' | 'empty' | 'plain' | 'lrc'

export function useTrackLyrics() {
  const playback = usePlayback()

  const status = ref<LyricsStatus>('no-track')
  const rawLyrics = ref<string | null>(null)
  const parsedLines = ref<LyricLine[]>([])

  const activeIndex = computed(() => {
    if (status.value !== 'lrc') return -1
    return getActiveLyricIndex(parsedLines.value, playback.state.currentTime)
  })

  const isPrelude = computed(() => {
    if (status.value !== 'lrc' || parsedLines.value.length === 0) return false
    const first = parsedLines.value[0]
    return (
      playback.state.currentTime < first.timeSeconds &&
      playback.state.currentTime >= first.timeSeconds - 3
    )
  })

  function reset() {
    status.value = 'no-track'
    rawLyrics.value = null
    parsedLines.value = []
  }

  async function fetchLyrics(trackId: number) {
    status.value = 'loading'
    rawLyrics.value = null
    parsedLines.value = []

    try {
      const result = await auralis.lyrics.getByTrackId(trackId)

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
      status.value = 'empty'
    }
  }

  watch(
    () => playback.state.currentTrackId,
    (trackId) => {
      if (!trackId) {
        reset()
        return
      }
      fetchLyrics(trackId)
    },
    { immediate: true },
  )

  const unsubscribeMetadataChanged = auralis.metadata.onChanged((event) => {
    const trackId = playback.state.currentTrackId

    if (!trackId || !event.trackIds.includes(trackId)) {
      return
    }

    fetchLyrics(trackId)
  })

  onBeforeUnmount(() => {
    unsubscribeMetadataChanged()
  })

  return {
    status,
    rawLyrics,
    parsedLines,
    activeIndex,
    isPrelude,
  }
}
