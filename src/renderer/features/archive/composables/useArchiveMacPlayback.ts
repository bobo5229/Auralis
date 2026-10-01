import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { computed, onScopeDispose, ref } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import type { DailyAlbumStatsItem } from '@shared/types/archive'

export function useArchiveMacPlayback() {
  const playback = usePlayback()
  const reading = ref<string | null>(null)
  const error = ref<string | null>(null)
  let revision = 0
  let disposed = false

  const message = computed(() => {
    if (reading.value) return `正在读取专辑 ${reading.value}…`
    if (error.value) return error.value
    if (playback.state.error) return `播放失败：${playback.state.error}`
    if (playback.isPlaybackPending.value) return '正在启动播放…'
    const track = playback.state.currentTrack
    if (!track) return ''
    return `${playback.state.isPlaying ? '正在播放' : '已暂停'}：${track.title ?? '未命名单曲'} · ${track.artist ?? '未知艺术家'}`
  })

  async function playAlbum(
    item: DailyAlbumStatsItem,
    signal: AbortSignal,
    onSubmitted: () => void,
  ) {
    const token = ++revision
    const albumKey = item.albumKey && { ...item.albumKey }
    const title = item.title
    const current = () => !disposed && token === revision && !signal.aborted
    error.value = null
    if (!current()) return
    if (!item.canPlay || !albumKey) {
      error.value = '该专辑当前没有可播放曲目'
      return
    }
    reading.value = title
    const abort = () => {
      if (token === revision) reading.value = null
    }
    signal.addEventListener('abort', abort, { once: true })
    let submitted = false
    try {
      const result = await auralis.playback.getAlbumTracks(albumKey)
      if (!current()) return
      if (!result?.tracks.length) {
        error.value = '该专辑当前没有可播放曲目，原播放队列已保留'
        return
      }
      // No asynchronous boundary between the final cancellation check and global submission.
      reading.value = null
      submitted = true
      const pending = playback.playTrackFromQueue(result.tracks, result.tracks[0].id)
      onSubmitted()
      await pending
    } catch (cause) {
      if (!disposed && token === revision && (submitted || !signal.aborted)) {
        error.value = submitted
          ? `播放失败：${cause instanceof Error ? cause.message : String(cause)}`
          : '专辑读取失败，请重新装入；原播放队列已保留'
      }
    } finally {
      signal.removeEventListener('abort', abort)
      if (token === revision) reading.value = null
    }
  }

  onScopeDispose(() => {
    disposed = true
    revision++
    reading.value = null
  })

  return {
    playback,
    message,
    playAlbum,
  }
}
