import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, reactive, ref } from 'vue'
import { useArchiveMacPlayback } from './useArchiveMacPlayback'
import type { DailyAlbumStatsItem } from '@shared/types/archive'
import type { PlaybackPublicApi } from '@renderer/features/playback/composables/usePlayback'
import type { RandomAlbumTracksResult } from '@shared/types/playback'

const mocks = vi.hoisted(() => ({ query: vi.fn(), getPlayback: vi.fn() }))
vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: { playback: { getAlbumTracks: mocks.query } },
}))
vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: mocks.getPlayback,
}))

const item: DailyAlbumStatsItem = {
  key: 'opaque',
  albumKey: { album: 'Album', albumArtist: 'Artist' },
  title: 'Album',
  artist: 'Artist',
  artworkCacheKey: null,
  playCount: 3,
  durationSeconds: 360,
  canPlay: true,
}
const tracks = [11, 12, 13].map((id) => ({
  id,
  title: `Track ${id}`,
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Artist',
  durationSeconds: 120,
  artworkCacheKey: null,
}))
const result: RandomAlbumTracksResult = { album: 'Album', albumArtist: 'Artist', tracks }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
let scope: ReturnType<typeof effectScope>
let adapter: ReturnType<typeof useArchiveMacPlayback>
let api: PlaybackPublicApi
let play: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mocks.query.mockResolvedValue(result)
  play = vi.fn().mockResolvedValue(undefined)
  api = {
    state: reactive({ currentTrack: null, isPlaying: false, error: null, playbackMode: 'shuffle' }),
    isPlaybackPending: ref(false),
    playTrackFromQueue: play,
  } as unknown as PlaybackPublicApi
  mocks.getPlayback.mockReturnValue(api)
  scope = effectScope()
  scope.run(() => {
    adapter = useArchiveMacPlayback()
  })
})
afterEach(() => scope.stop())

describe('Mac album playback submission', () => {
  it('submits the complete ordered album from the first available track without changing mode', async () => {
    const committed = vi.fn()
    await adapter.playAlbum(item, new AbortController().signal, committed)
    expect(mocks.query).toHaveBeenCalledWith(item.albumKey)
    expect(play).toHaveBeenCalledWith(tracks, 11)
    expect(api.state.playbackMode).toBe('shuffle')
    expect(committed).toHaveBeenCalledOnce()
    expect(adapter.message.value).not.toContain('正在播放')
  })
  it.each([null, { ...result, tracks: [] }])(
    'keeps the queue when no tracks are returned: %s',
    async (empty) => {
      mocks.query.mockResolvedValue(empty)
      await adapter.playAlbum(item, new AbortController().signal, vi.fn())
      expect(play).not.toHaveBeenCalled()
      expect(adapter.message.value).toContain('原播放队列已保留')
    },
  )
  it('does not query an unplayable item or missing album identity', async () => {
    for (const invalid of [
      { ...item, canPlay: false },
      { ...item, albumKey: null },
    ])
      await adapter.playAlbum(invalid, new AbortController().signal, vi.fn())
    expect(mocks.query).not.toHaveBeenCalled()
    expect(play).not.toHaveBeenCalled()
  })
  it('query failure is retryable and leaves playback untouched', async () => {
    mocks.query.mockRejectedValueOnce(Error('IPC failed'))
    await adapter.playAlbum(item, new AbortController().signal, vi.fn())
    expect(play).not.toHaveBeenCalled()
    expect(adapter.message.value).toContain('读取失败')
    await adapter.playAlbum(item, new AbortController().signal, vi.fn())
    expect(play).toHaveBeenCalledOnce()
  })
  it('aborted query cannot submit a late result', async () => {
    const query = deferred<RandomAlbumTracksResult>()
    mocks.query.mockReturnValue(query.promise)
    const abort = new AbortController()
    const pending = adapter.playAlbum(item, abort.signal, vi.fn())
    expect(adapter.message.value).toContain('正在读取专辑')
    abort.abort()
    expect(adapter.message.value).not.toContain('正在读取专辑')
    query.resolve(result)
    await pending
    expect(play).not.toHaveBeenCalled()
  })
  it('replacement and disposal both invalidate old query results', async () => {
    const first = deferred<RandomAlbumTracksResult>()
    mocks.query.mockReturnValueOnce(first.promise)
    const old = adapter.playAlbum(item, new AbortController().signal, vi.fn())
    await adapter.playAlbum(item, new AbortController().signal, vi.fn())
    first.resolve(result)
    await old
    expect(play).toHaveBeenCalledOnce()
    play.mockClear()
    const next = deferred<RandomAlbumTracksResult>()
    mocks.query.mockReturnValueOnce(next.promise)
    const exiting = adapter.playAlbum(item, new AbortController().signal, vi.fn())
    scope.stop()
    next.resolve(result)
    await exiting
    expect(play).not.toHaveBeenCalled()
  })
  it('submitted playback continues after page cancellation and disposal', async () => {
    const globalPending = deferred<void>()
    play.mockReturnValue(globalPending.promise)
    const abort = new AbortController(),
      committed = vi.fn()
    const pending = adapter.playAlbum(item, abort.signal, committed)
    await Promise.resolve()
    expect(committed).toHaveBeenCalledOnce()
    abort.abort()
    scope.stop()
    globalPending.resolve()
    await pending
    expect(play).toHaveBeenCalledOnce()
  })
  it('reports actual pending, playing, paused and shared audio errors', () => {
    api.state.currentTrack = tracks[0]
    expect(adapter.message.value).toContain('已暂停')
    api.state.isPlaying = true
    expect(adapter.message.value).toContain('正在播放：Track 11')
    ;(api.isPlaybackPending as ReturnType<typeof ref<boolean>>).value = true
    expect(adapter.message.value).toBe('正在启动播放…')
    api.state.error = 'Decoder failed'
    expect(adapter.message.value).toBe('播放失败：Decoder failed')
  })
})
