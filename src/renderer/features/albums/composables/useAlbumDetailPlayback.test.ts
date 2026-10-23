import { effectScope, reactive, ref, shallowRef } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { PlaybackPublicApi } from '@renderer/features/playback/composables/usePlayback'
import type { PlaybackMode } from '@renderer/features/playback/types'
import { useAlbumDetailPlayback } from './useAlbumDetailPlayback'
import { useAlbumDetailTracks } from './useAlbumDetailTracks'
import { invalidateAlbumDetailSnapshot, writeAlbumDetailSnapshot } from '../albumDetailSnapshot'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { error: vi.fn() },
}))
const track = (id: number, album = 'Album', trackNo = id) =>
  ({ id, album, albumArtist: 'Artist', title: `Track ${id}`, discNo: 1, trackNo }) as TrackListItem
const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.restoreAllMocks()
  invalidateAlbumDetailSnapshot()
})

function setup(mode: PlaybackMode = 'sequential') {
  const albumTracks = ref([track(1), track(2)])
  const catalog = [
    track(9, 'Before'),
    track(2),
    track(4, 'After', 2),
    track(1),
    track(3, 'After', 1),
  ]
  const ensurePlaybackCatalog = vi.fn(async (): Promise<TrackListItem[] | null> => catalog)
  const albumArtist = ref('Artist')
  const albumTitle = ref('Album')
  const state = reactive({ playbackMode: mode }) as PlaybackPublicApi['state']
  const queueSession = shallowRef<PlaybackPublicApi['queueSession']['value']>(null)
  const playbackCatalogRevision = ref(0)
  const playback = {
    state,
    queueSession,
    commandRevision: ref(0),
    playTrackFromQueue: vi.fn<PlaybackPublicApi['playTrackFromQueue']>(async () => {}),
    setPlaybackMode: vi.fn((next: PlaybackMode) => {
      state.playbackMode = next
    }),
  }
  const scope = effectScope()
  scopes.push(scope)
  const actions = scope.run(() =>
    useAlbumDetailPlayback({
      albumArtist,
      albumTitle,
      albumTracks,
      tracks: ref(albumTracks.value),
      ensurePlaybackCatalog,
      playbackCatalogRevision,
      playback,
    }),
  )!
  return {
    actions,
    playback,
    ensurePlaybackCatalog,
    playbackCatalogRevision,
    albumTitle,
    albumTracks,
    scope,
  }
}

function deferCatalog(fixture: ReturnType<typeof setup>) {
  let resolve!: (tracks: TrackListItem[] | null) => void
  fixture.ensurePlaybackCatalog.mockReturnValue(
    new Promise((value) => {
      resolve = value
    }),
  )
  return resolve
}

describe('album detail playback actions', () => {
  it.each(['navigation', 'fetched'] as const)(
    'invalidates a returned %s catalog before playback commits and permits retry',
    async (source) => {
      const old = [track(1), track(2, 'After')]
      const fresh = [{ ...track(1), title: 'Updated' }, track(3, 'New album')]
      if (source === 'navigation')
        writeAlbumDetailSnapshot({
          albumArtist: 'Artist',
          albumTitle: 'Album',
          artworkCacheKey: null,
          releaseDate: null,
          tracks: [old[0]],
          moreAlbums: [],
          catalogTracks: old,
        })
      let emit!: (event: {
        reason: 'metadata-refresh'
        trackIds: number[]
        filePaths: string[]
      }) => void
      const library = {
        getAlbumDetail: vi.fn(async () => ({ tracks: [old[0]], moreAlbums: [], genreAlbums: [] })),
        getTracks: vi.fn(async () => old),
        onChanged: (listener: typeof emit) => {
          emit = listener
          return () => {}
        },
      }
      const artist = ref('Artist'),
        title = ref('Album')
      const detail = useAlbumDetailTracks({ albumArtist: artist, albumTitle: title, library })
      const f = setup()
      try {
        await detail.initialize()
        if (source === 'fetched') await detail.ensurePlaybackCatalog()
        const actions = f.scope.run(() =>
          useAlbumDetailPlayback({
            albumArtist: artist,
            albumTitle: title,
            tracks: detail.tracks,
            albumTracks: detail.albumTracks,
            ensurePlaybackCatalog: detail.ensurePlaybackCatalog,
            playbackCatalogRevision: detail.playbackCatalogRevision,
            playback: f.playback,
          }),
        )!
        const pending = actions.playTrack(1)
        library.getTracks.mockResolvedValue(fresh)
        library.getAlbumDetail.mockResolvedValue({
          tracks: [fresh[0]],
          moreAlbums: [],
          genreAlbums: [],
        })
        emit({ reason: 'metadata-refresh', trackIds: [1], filePaths: [] })
        await pending
        expect(f.playback.playTrackFromQueue).not.toHaveBeenCalled()
        await actions.playTrack(1)
        expect(f.playback.playTrackFromQueue).toHaveBeenCalledExactlyOnceWith(fresh, 1)
      } finally {
        detail.dispose()
      }
    },
  )

  it('plays the first album track with the ordered current and following albums', async () => {
    const { actions, playback } = setup()
    actions.playAlbum()
    await Promise.resolve()
    expect(playback.playTrackFromQueue.mock.calls[0]?.[0].map((t) => t.id)).toEqual([1, 2, 3, 4])
    expect(playback.playTrackFromQueue.mock.calls[0]?.[1]).toBe(1)
  })
  it('keeps the whole queue and starts at the clicked track, excluding preceding albums', async () => {
    const { actions, playback } = setup()
    await actions.playTrack(2)
    expect(playback.playTrackFromQueue.mock.calls[0]?.[0].map((t) => t.id)).toEqual([1, 2, 3, 4])
    expect(playback.playTrackFromQueue.mock.calls[0]?.[1]).toBe(2)
  })
  it.each(['repeat-one', 'repeat-all', 'shuffle', 'album-shuffle'] as const)(
    'keeps %s and uses only the current album without loading the catalog',
    async (mode) => {
      const { actions, playback, ensurePlaybackCatalog } = setup(mode)
      await actions.playTrack(2)
      expect(ensurePlaybackCatalog).not.toHaveBeenCalled()
      expect(playback.state.playbackMode).toBe(mode)
      expect(playback.playTrackFromQueue.mock.calls[0]?.[0].map((t) => t.id)).toEqual([1, 2])
    },
  )
  it('preserves album-only shuffle and supersedes a pending ordinary playback', async () => {
    const f = setup()
    const resolve = deferCatalog(f)
    const pending = f.actions.playTrack(1)
    vi.spyOn(Math, 'random').mockReturnValue(0.75)
    f.actions.playAlbumShuffle()
    resolve([track(1)])
    await pending
    expect(f.playback.playTrackFromQueue).toHaveBeenCalledExactlyOnceWith(f.albumTracks.value, 2, {
      shufflePool: f.albumTracks.value,
    })
    expect(f.playback.setPlaybackMode).toHaveBeenCalledWith('shuffle')
  })
  it('lets the most recent click choose the starting track', async () => {
    const f = setup()
    const resolve = deferCatalog(f)
    const first = f.actions.playTrack(1)
    const second = f.actions.playTrack(2)
    resolve([track(1), track(2)])
    await Promise.all([first, second])
    expect(f.playback.playTrackFromQueue).toHaveBeenCalledTimes(1)
    expect(f.playback.playTrackFromQueue.mock.calls[0]?.[1]).toBe(2)
  })
  it.each(['route', 'mode', 'session', 'command', 'catalog', 'leave', 'dispose'] as const)(
    'discards pending playback after %s changes',
    async (change) => {
      const f = setup()
      const resolve = deferCatalog(f)
      const pending = f.actions.playTrack(1)
      if (change === 'route') {
        f.albumTitle.value = 'Other'
        f.albumTitle.value = 'Album'
      }
      if (change === 'mode') {
        f.playback.state.playbackMode = 'repeat-all'
        f.playback.state.playbackMode = 'sequential'
      }
      if (change === 'session') f.playback.queueSession.value = { id: 1, source: 'default' }
      if (change === 'command') f.playback.commandRevision.value += 1
      if (change === 'catalog') f.playbackCatalogRevision.value += 1
      if (change === 'leave') f.actions.cancel()
      if (change === 'dispose') f.scope.stop()
      resolve([track(1)])
      await pending
      expect(f.playback.playTrackFromQueue).not.toHaveBeenCalled()
    },
  )
  it.each(['missing', 'invalidated', 'failed'] as const)(
    'does not replace playback when catalog is %s',
    async (result) => {
      const f = setup()
      if (result === 'missing') f.ensurePlaybackCatalog.mockResolvedValue([track(3, 'Other')])
      if (result === 'invalidated') f.ensurePlaybackCatalog.mockResolvedValue(null)
      if (result === 'failed') f.ensurePlaybackCatalog.mockRejectedValue(new Error('failed'))
      await f.actions.playTrack(1)
      expect(f.playback.playTrackFromQueue).not.toHaveBeenCalled()
    },
  )
})
