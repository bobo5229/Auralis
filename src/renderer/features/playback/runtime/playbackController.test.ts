import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { computed, effectScope, isReadonly, reactive, ref, watch, type DeepReadonly } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import { useAlbumDetailPlayback } from '@renderer/features/albums/composables/useAlbumDetailPlayback'
import type { PlaybackMode, PlaybackState, PlaybackTrack } from '../types'
import { createPlaybackController, type PlaybackPublicApi } from './playbackController'
import type { PlaybackAudioSnapshot } from '../audio/playbackAudioRuntime'
import type { PlaybackDependencies } from './playbackDependencies'

function frozenTracks(ids = [1, 2, 3]): PlaybackTrack[] {
  return ids.map((id) =>
    Object.freeze({
      id,
      title: `Track ${id}`,
      artist: 'Artist',
      album: 'Album',
      albumArtist: 'Artist',
      durationSeconds: 180,
      artworkCacheKey: null,
    }),
  )
}

describe('playbackController unit tests with injected dependencies', () => {
  let deps: PlaybackDependencies
  let storageMap: Map<string, string>

  beforeEach(() => {
    storageMap = new Map()
    deps = {
      getAudioUrl: vi.fn(async (trackId: number) => ({ url: `audio://${trackId}` })),
      getRandomTrack: vi.fn(async () => null),
      getAlbumTracks: vi.fn(async () => null),
      getRandomAlbumTracks: vi.fn(async () => null),
      onLibraryChanged: vi.fn(() => () => undefined),
      recordEffectivePlay: vi.fn(async () => ({ ok: true, recorded: false })),
      storage: {
        getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storageMap.set(key, value)
        }),
      },
      diagnostics: {
        warn: vi.fn(),
        error: vi.fn(),
      },
      createAudioRuntime: vi.fn(() => ({
        start: vi.fn(async () => undefined),
        resume: vi.fn(async () => undefined),
        pause: vi.fn(),
        seek: vi.fn(async () => undefined),
        setVolume: vi.fn(),
        scheduleNext: vi.fn(async () => false),
        cancelScheduledNext: vi.fn(),
        clear: vi.fn(),
        getSnapshot: vi.fn(() => ({
          kind: 'idle' as const,
          trackId: null,
          currentTime: 0,
          duration: 0,
          isPlaying: false,
          hasCurrentData: false,
        })),
        dispose: vi.fn(),
      })),
    }
  })

  it.each(['plain', 'frozen-array'] as const)(
    'exposes deeply readonly state for a %s queue, including its tracks',
    async (kind) => {
      expectTypeOf<PlaybackPublicApi['state']>().toEqualTypeOf<DeepReadonly<PlaybackState>>()
      const controller = createPlaybackController(deps)
      const { api } = controller
      const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      try {
        const tracks = frozenTracks().map((track) => ({ ...track }))
        if (kind === 'frozen-array') Object.freeze(tracks)
        await api.playTrackFromQueue(tracks, 1)
        const state = api.state
        const queue = state.queue
        const track = state.currentTrack!
        const volume = state.volume
        expect(isReadonly(state)).toBe(true)
        expect(isReadonly(queue)).toBe(true)
        expect(isReadonly(track)).toBe(true)
        expect(track).toBe(queue[0])
        Reflect.set(state, 'volume', 0)
        Reflect.set(state, 'currentTrack', null)
        Reflect.set(track, 'title', 'External edit')
        Reflect.deleteProperty(queue[0], 'artist')
        Array.prototype.splice.call(queue, 0, 1)
        expect(api.state).toBe(state)
        expect(state.queue).toBe(queue)
        expect(state.currentTrack).toBe(track)
        expect(state.volume).toBe(volume)
        expect(queue.map(({ id }) => id)).toEqual([1, 2, 3])
        expect(track.title).toBe('Track 1')
        expect(track.artist).toBe('Artist')
        expect(warnings).toHaveBeenCalled()
      } finally {
        warnings.mockRestore()
        controller.dispose()
      }
    },
  )

  it('updates retained readonly views through commands and audio events', async () => {
    const controller = createPlaybackController(deps)
    const { api } = controller
    const state = api.state
    const display = computed(() => `${state.currentTrackId}:${state.currentTime}:${state.volume}`)
    const changed = vi.fn()
    const stop = watch(() => state.currentTrackId, changed, { flush: 'sync' })
    try {
      await api.playTrackFromQueue(frozenTracks(), 1)
      const callbacks = vi.mocked(deps.createAudioRuntime!).mock.calls[0][0]
      callbacks.onTimeUpdate({ currentTime: 12, duration: 180 })
      callbacks.onPlayingChange(true)
      api.setVolume(0.4)
      api.selectTrack(2)
      api.setPlaybackMode('sequential')
      expect(display.value).toBe('1:12:0.4')
      expect(state.isPlaying).toBe(true)
      expect(state.selectedTrackId).toBe(2)
      expect(state.playbackMode).toBe('sequential')
      expect(storageMap.get('auralis-volume')).toBe('0.4')
      api.pause()
      expect(state.isPlaying).toBe(false)
      api.toggleMute()
      expect(state.isMuted).toBe(true)
      api.seekTo(45)
      expect(state.currentTime).toBe(45)
      await api.playNext()
      expect(state.currentTrackId).toBe(2)
      expect(changed.mock.calls.map(([id]) => id)).toEqual([1, 2])
      expect(api.state).toBe(state)
    } finally {
      stop()
      controller.dispose()
    }
  })

  it.each([
    'pause',
    'play',
    'toggle',
    'next',
    'previous',
    'seek',
    'seek-ratio',
    'insert',
    'replace',
  ] as const)('keeps a newer %s command when a pending album catalog resolves', async (command) => {
    const controller = createPlaybackController(deps)
    const api = controller.api
    const scope = effectScope()
    let resolve!: (tracks: TrackListItem[]) => void
    const catalog = new Promise<TrackListItem[]>((done) => {
      resolve = done
    })
    const target = { ...frozenTracks([1])[0], trackNo: 1, discNo: 1 } as TrackListItem
    try {
      api.setPlaybackMode('sequential')
      await api.playTrackFromQueue(frozenTracks([10, 11, 12]), 11)
      const actions = scope.run(() =>
        useAlbumDetailPlayback({
          albumArtist: ref('Artist'),
          albumTitle: ref('Album'),
          tracks: ref([target]),
          albumTracks: ref([target]),
          ensurePlaybackCatalog: () => catalog,
          playbackCatalogRevision: ref(0),
          playback: api,
        }),
      )!
      const pending = actions.playTrack(1)
      expect(api.state.currentTrackId).toBe(11)
      expect(deps.getAudioUrl).not.toHaveBeenCalledWith(1)
      if (command === 'pause') api.pause()
      if (command === 'play') await api.play()
      if (command === 'toggle') await api.togglePlayPause()
      if (command === 'next') await api.playNext()
      if (command === 'previous') await api.playPrevious()
      if (command === 'seek') api.seekTo(30)
      if (command === 'seek-ratio') api.seekByRatio(0.5)
      if (command === 'insert') api.insertTrackAfterCurrent(frozenTracks([13])[0])
      if (command === 'replace')
        expect(
          api.replaceCurrentPlaybackQueue({
            expectedSessionId: api.queueSession.value!.id,
            expectedTrackId: 11,
            expectedQueueTrackIds: [10, 11, 12],
            queue: frozenTracks([11, 14]),
            playbackMode: 'sequential',
          }),
        ).toBe(true)
      if (command === 'next') expect(api.state.currentTrackId).toBe(12)
      if (command === 'previous') expect(api.state.currentTrackId).toBe(10)
      if (command === 'seek') expect(api.state.currentTime).toBe(30)
      if (command === 'seek-ratio') expect(api.state.currentTime).toBe(90)
      const currentId = api.state.currentTrackId
      const queueIds = api.state.queue.map((t) => t.id)
      const audioCalls = vi.mocked(deps.getAudioUrl).mock.calls.length
      resolve([target])
      await pending
      expect(api.state.currentTrackId).toBe(currentId)
      expect(api.state.queue.map((t) => t.id)).toEqual(queueIds)
      expect(deps.getAudioUrl).toHaveBeenCalledTimes(audioCalls)
    } finally {
      scope.stop()
      controller.dispose()
    }
  })

  it('allows pending album playback after natural time and playing updates', async () => {
    const controller = createPlaybackController(deps)
    const api = controller.api
    const scope = effectScope()
    let resolve!: (tracks: TrackListItem[]) => void
    const catalog = new Promise<TrackListItem[]>((done) => {
      resolve = done
    })
    const target = { ...frozenTracks([1])[0], trackNo: 1, discNo: 1 } as TrackListItem
    try {
      api.setPlaybackMode('sequential')
      await api.playTrackFromQueue(frozenTracks([10]), 10)
      const actions = scope.run(() =>
        useAlbumDetailPlayback({
          albumArtist: ref('Artist'),
          albumTitle: ref('Album'),
          tracks: ref([target]),
          albumTracks: ref([target]),
          ensurePlaybackCatalog: () => catalog,
          playbackCatalogRevision: ref(0),
          playback: api,
        }),
      )!
      const pending = actions.playTrack(1)
      expect(api.state.currentTrackId).toBe(10)
      expect(deps.getAudioUrl).not.toHaveBeenCalledWith(1)
      const callbacks = vi.mocked(deps.createAudioRuntime!).mock.calls[0][0]
      callbacks.onTimeUpdate({ currentTime: 25, duration: 180 })
      callbacks.onPlayingChange(true)
      expect(api.state.currentTrackId).toBe(10)
      resolve([target])
      await pending
      expect(api.state.currentTrackId).toBe(1)
    } finally {
      scope.stop()
      controller.dispose()
    }
  })

  it.each(['plain', 'reactive', 'frozen', 'mixed'] as const)(
    'reuses a converted %s catalog queue across selections and history',
    async (kind) => {
      const tracks = frozenTracks()
      if (kind === 'mixed') tracks[1] = { ...tracks[1] }
      const queue = kind === 'reactive' || kind === 'mixed' ? reactive(tracks) : tracks
      if (kind === 'frozen') Object.freeze(queue)
      const controller = createPlaybackController(deps)
      const { api } = controller
      try {
        await api.playTrackFromQueue(queue, 1, { playbackMode: 'shuffle', shufflePool: queue })
        const converted = api.state.queue
        const firstSession = api.queueSession.value!.id
        for (const id of [2, 3, 1, 2]) {
          await api.playTrackFromQueue(queue, id, { shufflePool: queue })
          expect(api.state.queue).toBe(converted)
        }
        expect(api.queueSession.value!.id).toBeGreaterThan(firstSession)
        await api.playPrevious()
        expect(api.state.currentTrackId).toBe(1)
        expect(api.state.queue).toBe(converted)
        expect(tracks.filter(Object.isFrozen)).toHaveLength(kind === 'mixed' ? 2 : 3)
      } finally {
        controller.dispose()
      }
    },
  )

  it.each(['reorder', 'append', 'remove', 'replace', 'mutable'] as const)(
    'adopts a catalog queue after %s without changing its history',
    async (change) => {
      const tracks = frozenTracks()
      const controller = createPlaybackController(deps)
      const { api } = controller
      try {
        await api.playTrackFromQueue(tracks, 1, { playbackMode: 'shuffle', shufflePool: tracks })
        const previous = api.state.queue
        if (change === 'reorder') tracks.reverse()
        if (change === 'append') tracks.push(...frozenTracks([4]))
        if (change === 'remove') tracks.pop()
        if (change === 'replace') tracks[1] = Object.freeze({ ...tracks[1], title: 'Replacement' })
        if (change === 'mutable')
          tracks.splice(0, tracks.length, ...tracks.map((track) => ({ ...track })))
        await api.playTrackFromQueue(tracks, 2, { shufflePool: tracks })
        expect(api.state.queue).not.toBe(previous)
        expect(api.state.queue.map(({ id, title }) => ({ id, title }))).toEqual(
          tracks.map(({ id, title }) => ({ id, title })),
        )
        expect(previous.map(({ id, title }) => ({ id, title }))).toEqual(
          [1, 2, 3].map((id) => ({ id, title: `Track ${id}` })),
        )
        await api.playPrevious()
        expect(api.state.currentTrackId).toBe(1)
        expect(api.state.queue).toBe(previous)
        const random = vi.spyOn(Math, 'random').mockReturnValue(0.999)
        try {
          await api.playNext()
          expect(api.state.currentTrackId).toBe(3)
          expect(api.state.currentTrack?.title).toBe('Track 3')
        } finally {
          random.mockRestore()
        }
      } finally {
        controller.dispose()
      }
    },
  )

  it('keeps different catalog snapshots and inserted queues separate', async () => {
    const tracks = frozenTracks()
    const nextSnapshot = frozenTracks().map((track) =>
      Object.freeze({ ...track, title: 'New ' + track.id }),
    )
    const controller = createPlaybackController(deps)
    const { api } = controller
    try {
      await api.playTrackFromQueue(tracks, 1, { playbackMode: 'shuffle' })
      const original = api.state.queue
      api.insertTrackAfterCurrent(frozenTracks([4])[0])
      expect(api.state.queue.map(({ id }) => id)).toEqual([1, 4, 2, 3])
      expect(original.map(({ id }) => id)).toEqual([1, 2, 3])
      await api.playTrackFromQueue(tracks, 2)
      expect(api.state.queue).toBe(original)
      await api.playTrackFromQueue(nextSnapshot, 3)
      expect(api.state.queue).not.toBe(original)
      expect(api.state.currentTrack?.title).toBe('New 3')
      await api.playPrevious()
      expect(api.state.queue).toBe(original)
      expect(api.state.currentTrack?.title).toBe('Track 2')
    } finally {
      controller.dispose()
    }
  })

  it.each(['pause', 'toggle', 'manual', 'previous', 'dispose'] as const)(
    'ignores a late random next result after %s',
    async (action) => {
      let resolveNext!: (track: PlaybackTrack) => void
      vi.mocked(deps.getRandomTrack).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNext = resolve
        }),
      )
      const tracks: PlaybackTrack[] = [1, 2, 3].map((id) => ({
        id,
        title: String(id),
        artist: 'A',
        album: 'Album',
        albumArtist: 'A',
        durationSeconds: 120,
        artworkCacheKey: null,
      }))
      const controller = createPlaybackController(deps)
      const runtime = vi.mocked(deps.createAudioRuntime!).mock.results[0].value
      await controller.api.playTrackFromQueue(tracks, 1, { playbackMode: 'shuffle' })
      // The injected runtime does not emit playing callbacks automatically.
      vi.mocked(deps.createAudioRuntime!).mock.calls[0][0].onPlayingChange(true)
      const pending = controller.api.playNext()
      expect(controller.api.isPlaybackPending.value).toBe(true)
      if (action === 'pause') controller.api.pause()
      if (action === 'toggle') await controller.api.togglePlayPause()
      if (action === 'manual') await controller.api.playTrackFromQueue(tracks, 3)
      if (action === 'previous') await controller.api.playPrevious()
      if (action === 'dispose') controller.dispose()
      resolveNext(tracks[1])
      await pending
      expect(controller.api.state.currentTrackId).toBe(action === 'manual' ? 3 : 1)
      expect(runtime.start).toHaveBeenCalledTimes(action === 'manual' ? 2 : 1)
      expect(controller.api.isPlaybackPending.value).toBe(false)
      if (action === 'pause' || action === 'toggle')
        expect(controller.api.state.isPlaying).toBe(false)
      controller.dispose()
    },
  )

  it('ignores a superseded next failure without unlocking the latest selection', async () => {
    let rejectOld!: (error: Error) => void
    let resolveNew!: (track: PlaybackTrack) => void
    vi.mocked(deps.getRandomTrack)
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectOld = reject
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNew = resolve
        }),
      )
    const track: PlaybackTrack = {
      id: 1,
      title: 'Song',
      artist: 'A',
      album: 'Album',
      albumArtist: 'A',
      durationSeconds: 120,
      artworkCacheKey: null,
    }
    const controller = createPlaybackController(deps)
    await controller.api.playTrackFromQueue([track], 1, { playbackMode: 'shuffle' })
    const old = controller.api.playNext()
    const latest = controller.api.playNext()
    rejectOld(new Error('old selection failed'))
    await old
    expect(controller.api.state.error).toBeNull()
    expect(controller.api.isPlaybackPending.value).toBe(true)
    resolveNew({ ...track, id: 2 })
    await latest
    expect(controller.api.state.currentTrackId).toBe(2)
    expect(controller.api.isPlaybackPending.value).toBe(false)
    controller.dispose()
  })

  describe('navigation edits during pending playback', () => {
    function createTracks(ids: number[]): PlaybackTrack[] {
      return ids.map((id) => ({
        id,
        title: `Song ${id}`,
        artist: 'Artist',
        album: 'Album',
        albumArtist: 'Artist',
        durationSeconds: 10,
        artworkCacheKey: null,
      }))
    }

    const edits = [
      { action: 'mode', queueIds: [1, 2, 3], mode: 'sequential', nextId: 2 },
      { action: 'insert', queueIds: [1, 4, 2, 3], mode: 'shuffle', nextId: 4 },
      { action: 'insert-many', queueIds: [1, 4, 5, 2, 3], mode: 'shuffle', nextId: 4 },
      { action: 'replace', queueIds: [1, 4, 2, 3], mode: 'sequential', nextId: 4 },
      { action: 'missing', queueIds: [1, 2], mode: 'shuffle', nextId: 2 },
    ] as const

    function editNavigation(api: PlaybackPublicApi, action: (typeof edits)[number]['action']) {
      if (action === 'mode') api.setPlaybackMode('sequential')
      if (action === 'insert') api.insertTrackAfterCurrent(createTracks([4])[0])
      if (action === 'insert-many') api.insertTracksAfterCurrent(createTracks([4, 5]))
      if (action === 'replace') {
        expect(
          api.replaceCurrentPlaybackQueue({
            expectedSessionId: api.queueSession.value!.id,
            expectedTrackId: 1,
            expectedQueueTrackIds: [1, 2, 3],
            queue: createTracks([1, 4, 2, 3]),
            playbackMode: 'sequential',
          }),
        ).toBe(true)
      }
      if (action === 'missing') {
        vi.mocked(deps.onLibraryChanged).mock.calls[0][0]({
          reason: 'track-missing',
          trackIds: [3],
          filePaths: [],
        })
      }
    }

    it.each(
      edits.flatMap((edit) =>
        (['result', 'error'] as const).map((outcome) => ({ ...edit, outcome })),
      ),
    )('preserves $action after a late next $outcome', async (edit) => {
      let resolveNext!: (track: PlaybackTrack) => void
      let rejectNext!: (error: Error) => void
      vi.mocked(deps.getRandomTrack).mockReturnValueOnce(
        new Promise((resolve, reject) => {
          resolveNext = resolve
          rejectNext = reject
        }),
      )
      const tracks = createTracks([1, 2, 3])
      const controller = createPlaybackController(deps)
      const { api } = controller
      const runtime = vi.mocked(deps.createAudioRuntime!).mock.results[0].value
      await api.playTrackFromQueue(tracks, 1, { playbackMode: 'shuffle' })
      vi.mocked(deps.createAudioRuntime!).mock.calls[0][0].onPlayingChange(true)
      const pending = api.playNext()
      expect(api.isPlaybackPending.value).toBe(true)

      editNavigation(api, edit.action)
      expect(api.isPlaybackPending.value).toBe(false)
      if (edit.outcome === 'result') resolveNext(tracks[2])
      else rejectNext(new Error('outdated next selection failed'))
      await pending

      expect(api.state.queue.map((track) => track.id)).toEqual(edit.queueIds)
      expect(api.state.currentTrackId).toBe(1)
      expect(api.state.currentIndex).toBe(0)
      expect(api.state.playbackMode).toBe(edit.mode)
      expect(api.state.isPlaying).toBe(true)
      expect(api.state.error).toBeNull()
      expect(api.isPlaybackPending.value).toBe(false)
      expect(runtime.start).toHaveBeenCalledTimes(1)

      vi.mocked(deps.getRandomTrack).mockResolvedValueOnce(tracks[1])
      await api.playNext()
      expect(api.state.currentTrackId).toBe(edit.nextId)
      expect(api.isPlaybackPending.value).toBe(false)
      if (edit.action === 'insert-many') {
        await api.playNext()
        expect(api.state.currentTrackId).toBe(5)
      }
      controller.dispose()
    })

    it.each(['result', 'error'] as const)(
      'does not let a cancelled next %s unlock a newer audio load',
      async (outcome) => {
        let resolveNext!: (track: PlaybackTrack) => void
        let rejectNext!: (error: Error) => void
        let resolveUrl!: (value: { url: string }) => void
        vi.mocked(deps.getRandomTrack).mockReturnValueOnce(
          new Promise((resolve, reject) => {
            resolveNext = resolve
            rejectNext = reject
          }),
        )
        const tracks = createTracks([1, 2, 3])
        const controller = createPlaybackController(deps)
        const { api } = controller
        await api.playTrackFromQueue(tracks, 1, { playbackMode: 'shuffle' })
        const old = api.playNext()
        api.setPlaybackMode('sequential')
        vi.mocked(deps.getAudioUrl).mockReturnValueOnce(
          new Promise((resolve) => {
            resolveUrl = resolve
          }),
        )
        const newer = api.playNext()
        await vi.waitFor(() => expect(api.state.currentTrackId).toBe(2))
        if (outcome === 'result') resolveNext(tracks[2])
        else rejectNext(new Error('outdated next selection failed'))
        await old
        expect(api.state.currentTrackId).toBe(2)
        expect(api.state.queue.map((track) => track.id)).toEqual([1, 2, 3])
        expect(api.state.playbackMode).toBe('sequential')
        expect(api.state.error).toBeNull()
        expect(api.isPlaybackPending.value).toBe(true)
        resolveUrl({ url: 'audio://2' })
        await newer
        expect(api.isPlaybackPending.value).toBe(false)
        controller.dispose()
      },
    )

    it.each(
      (['shuffle', 'album-shuffle'] as const).flatMap((mode) =>
        (['mode', 'insert'] as const).flatMap((action) =>
          (['result', 'error'] as const).map((outcome) => ({ mode, action, outcome })),
        ),
      ),
    )('ignores a natural-ended $mode $outcome after $action', async (testCase) => {
      let resolveNext!: (track: PlaybackTrack) => void
      let rejectNext!: (error: Error) => void
      const selection = new Promise<PlaybackTrack>((resolve, reject) => {
        resolveNext = resolve
        rejectNext = reject
      })
      if (testCase.mode === 'shuffle') {
        vi.mocked(deps.getRandomTrack).mockReturnValueOnce(selection)
      } else {
        vi.mocked(deps.getRandomAlbumTracks).mockImplementationOnce(async () => ({
          albumArtist: 'Artist',
          album: 'Album',
          tracks: [await selection],
        }))
      }
      const controller = createPlaybackController(deps)
      const { api } = controller
      const runtimeFactory = vi.mocked(deps.createAudioRuntime!)
      const runtime = runtimeFactory.mock.results[0].value
      const tracks = createTracks([1, 2, 3])
      await api.playTrackFromQueue(tracks, 1, { playbackMode: testCase.mode })
      runtimeFactory.mock.calls[0][0].onEnded(null)
      await vi.waitFor(() =>
        expect(
          testCase.mode === 'shuffle' ? deps.getRandomTrack : deps.getRandomAlbumTracks,
        ).toHaveBeenCalledTimes(1),
      )
      expect(api.isPlaybackPending.value).toBe(true)
      editNavigation(api, testCase.action)
      expect(api.isPlaybackPending.value).toBe(false)
      if (testCase.outcome === 'result') resolveNext(tracks[2])
      else rejectNext(new Error('outdated natural advance failed'))
      // onEnded dispatches without returning its promise; drain its microtasks.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(api.state.currentTrackId).toBe(1)
      expect(api.state.queue.map((track) => track.id)).toEqual(
        testCase.action === 'mode' ? [1, 2, 3] : [1, 4, 2, 3],
      )
      expect(api.state.playbackMode).toBe(testCase.action === 'mode' ? 'sequential' : testCase.mode)
      expect(api.state.error).toBeNull()
      expect(api.isPlaybackPending.value).toBe(false)
      expect(runtime.start).toHaveBeenCalledTimes(1)
      await api.playNext()
      expect(api.state.currentTrackId).toBe(testCase.action === 'mode' ? 2 : 4)
      expect(api.isPlaybackPending.value).toBe(false)
      controller.dispose()
    })

    it('keeps an accepted next track loading when mode and inserted next track change', async () => {
      let resolveUrl!: (value: { url: string }) => void
      const controller = createPlaybackController(deps)
      const { api } = controller
      const runtime = vi.mocked(deps.createAudioRuntime!).mock.results[0].value
      const tracks = createTracks([1, 2, 3])
      await api.playTrackFromQueue(tracks, 1)
      vi.mocked(deps.getAudioUrl).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveUrl = resolve
        }),
      )
      const pending = api.playNext()
      await vi.waitFor(() => expect(api.state.currentTrackId).toBe(2))
      api.setPlaybackMode('repeat-all')
      api.insertTrackAfterCurrent(createTracks([4])[0])
      expect(api.isPlaybackPending.value).toBe(true)
      resolveUrl({ url: 'audio://2' })
      await pending
      expect(runtime.start).toHaveBeenLastCalledWith(2, 'audio://2', expect.any(Object))
      expect(api.state.currentTrackId).toBe(2)
      expect(api.state.queue.map((track) => track.id)).toEqual([1, 2, 4, 3])
      expect(api.state.playbackMode).toBe('repeat-all')
      expect(api.isPlaybackPending.value).toBe(false)
      await api.playNext()
      expect(api.state.currentTrackId).toBe(4)
      expect(api.isPlaybackPending.value).toBe(false)
      controller.dispose()
    })

    it('keeps a pending decision when insertion and queue replacement are rejected', async () => {
      let resolveNext!: (track: PlaybackTrack) => void
      vi.mocked(deps.getRandomTrack).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNext = resolve
        }),
      )
      const tracks = createTracks([1, 2, 3])
      const controller = createPlaybackController(deps)
      const { api } = controller
      await api.playTrackFromQueue(tracks, 1, { playbackMode: 'shuffle' })
      const pending = api.playNext()
      api.insertTrackAfterCurrent(tracks[0])
      api.insertTracksAfterCurrent([])
      expect(
        api.replaceCurrentPlaybackQueue({
          expectedSessionId: api.queueSession.value!.id,
          expectedTrackId: 1,
          expectedQueueTrackIds: [1, 999],
          queue: tracks,
          playbackMode: 'sequential',
        }),
      ).toBe(false)
      expect(api.isPlaybackPending.value).toBe(true)
      resolveNext(tracks[2])
      await pending
      expect(api.state.currentTrackId).toBe(3)
      expect(api.state.playbackMode).toBe('shuffle')
      expect(api.isPlaybackPending.value).toBe(false)
      controller.dispose()
    })

    it.each(
      edits.flatMap((edit) => ['url', 'start', 'resume'].map((phase) => ({ ...edit, phase }))),
    )(
      'lets the current track finish $phase after $action and keeps statistics and prefetch active',
      async (edit) => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
        const controller = createPlaybackController(deps)
        try {
          const { api } = controller
          api.setPlaybackMode('sequential')
          const runtimeFactory = vi.mocked(deps.createAudioRuntime!)
          const runtime = runtimeFactory.mock.results[0].value
          const callbacks = runtimeFactory.mock.calls[0][0]
          const tracks = createTracks([1, 2, 3])
          let snapshot: PlaybackAudioSnapshot = {
            kind: 'idle',
            trackId: null,
            currentTime: 0,
            duration: 0,
            isPlaying: false,
            hasCurrentData: false,
          }
          runtime.getSnapshot.mockImplementation(() => snapshot)
          function reportPlaying() {
            snapshot = {
              kind: 'mpv',
              trackId: 1,
              currentTime: 0,
              duration: 10,
              isPlaying: true,
              hasCurrentData: true,
            }
            callbacks.onPlayingChange(true)
          }
          runtime.start.mockImplementation(async () => reportPlaying())
          runtime.pause.mockImplementation(() => {
            snapshot.isPlaying = false
            callbacks.onPlayingChange(false)
          })
          let finish!: () => void
          let pending: Promise<void>
          if (edit.phase === 'url') {
            vi.mocked(deps.getAudioUrl).mockReturnValueOnce(
              new Promise((resolve) => {
                finish = () => resolve({ url: 'audio://1' })
              }),
            )
            pending = api.playTrackFromQueue(tracks, 1)
          } else if (edit.phase === 'start') {
            runtime.start.mockImplementationOnce(
              () =>
                new Promise<void>((resolve) => {
                  finish = () => {
                    reportPlaying()
                    resolve()
                  }
                }),
            )
            pending = api.playTrackFromQueue(tracks, 1)
            await vi.waitFor(() => expect(runtime.start).toHaveBeenCalledTimes(1))
          } else {
            await api.playTrackFromQueue(tracks, 1)
            api.pause()
            runtime.scheduleNext.mockClear()
            runtime.resume.mockImplementationOnce(
              () =>
                new Promise<void>((resolve) => {
                  finish = () => {
                    reportPlaying()
                    resolve()
                  }
                }),
            )
            pending = api.play()
          }
          expect(api.isPlaybackPending.value).toBe(true)
          editNavigation(api, edit.action)
          expect(api.isPlaybackPending.value).toBe(true)
          finish()
          await pending
          await vi.waitFor(() => expect(runtime.scheduleNext).toHaveBeenCalled())
          expect(api.state.queue.map((track) => track.id)).toEqual(edit.queueIds)
          expect(api.state.currentTrackId).toBe(1)
          expect(api.state.currentIndex).toBe(0)
          expect(api.state.playbackMode).toBe('sequential')
          expect(api.state.isPlaying).toBe(true)
          expect(api.isPlaybackPending.value).toBe(false)
          expect(runtime.start).toHaveBeenCalledTimes(1)
          expect(runtime.scheduleNext).toHaveBeenLastCalledWith(
            edit.nextId,
            `audio://${edit.nextId}`,
            expect.any(Object),
          )
          await vi.advanceTimersByTimeAsync(6_000)
          expect(deps.recordEffectivePlay).toHaveBeenCalledTimes(1)
          expect(deps.recordEffectivePlay).toHaveBeenCalledWith(
            expect.objectContaining({ trackId: 1 }),
          )
        } finally {
          controller.dispose()
          vi.useRealTimers()
        }
      },
    )
  })

  it('initializes with default volume and gapless settings from storage', () => {
    storageMap.set('auralis-volume', '0.6')
    storageMap.set('auralis-gapless-playback-enabled', 'true')
    const controller = createPlaybackController(deps)

    expect(controller.api.state.volume).toBe(0.6)
    expect(controller.api.state.playbackMode).toBe('repeat-all')
    expect(controller.api.gaplessPlaybackEnabled.value).toBe(true)
    expect(controller.api.state.queue).toEqual([])
    expect(controller.api.state.currentIndex).toBe(-1)
  })

  it('defaults soft transitions off and persists changes while invalidating pending playback', () => {
    const controller = createPlaybackController(deps)
    const runtime = vi.mocked(deps.createAudioRuntime!).mock.results[0].value
    expect(controller.api.softTransitionEnabled.value).toBe(false)
    controller.api.setSoftTransitionEnabled(true)
    expect(storageMap.get('auralis-soft-transition-enabled')).toBe('true')
    expect(runtime.cancelScheduledNext).toHaveBeenCalled()
    controller.dispose()
    const restored = createPlaybackController(deps)
    expect(restored.api.softTransitionEnabled.value).toBe(true)
    restored.api.setSoftTransitionEnabled(false)
    expect(storageMap.get('auralis-soft-transition-enabled')).toBe('false')
    restored.dispose()
  })

  it.each([null, '', 'no', 'NaN', 'Infinity', '0', '6.5', '2.1'])(
    'defaults an absent or invalid soft-transition duration %s to two seconds',
    (stored) => {
      if (stored !== null) storageMap.set('auralis-soft-transition-duration-seconds', stored)
      const controller = createPlaybackController(deps)
      expect(controller.api.softTransitionDurationSeconds.value).toBe(2)
      controller.dispose()
    },
  )

  it('persists duration independently of the disabled soft-transition setting', () => {
    const controller = createPlaybackController(deps)
    const runtime = vi.mocked(deps.createAudioRuntime!).mock.results[0].value
    runtime.cancelScheduledNext.mockClear()
    controller.api.setSoftTransitionDurationSeconds(5.5)
    expect(controller.api.softTransitionDurationSeconds.value).toBe(5.5)
    expect(storageMap.get('auralis-soft-transition-duration-seconds')).toBe('5.5')
    expect(runtime.cancelScheduledNext).not.toHaveBeenCalled()
    for (const invalid of [0, 6.5, 2.1, NaN, Infinity])
      controller.api.setSoftTransitionDurationSeconds(invalid)
    expect(controller.api.softTransitionDurationSeconds.value).toBe(5.5)
    controller.dispose()
    const restored = createPlaybackController(deps)
    expect(restored.api.softTransitionDurationSeconds.value).toBe(5.5)
    restored.dispose()
  })

  it('replans playing transitions once and uses paused duration changes after resume', async () => {
    const controller = createPlaybackController(deps)
    const runtime = vi.mocked(deps.createAudioRuntime!).mock.results[0].value
    const snapshot = {
      kind: 'mpv',
      trackId: 1,
      currentTime: 0,
      duration: 180,
      isPlaying: true,
      hasCurrentData: true,
    } as PlaybackAudioSnapshot
    runtime.getSnapshot.mockImplementation(() => snapshot)
    runtime.scheduleNext.mockResolvedValue(true)
    const callbacks = vi.mocked(deps.createAudioRuntime!).mock.calls[0][0]
    runtime.start.mockImplementation(async () => callbacks.onPlayingChange(true))
    runtime.resume.mockImplementation(async () => callbacks.onPlayingChange(true))
    controller.api.setPlaybackMode('sequential')
    controller.api.setSoftTransitionEnabled(true)
    await controller.api.playTrackFromQueue(frozenTracks(), 1)
    await vi.waitFor(() => expect(runtime.scheduleNext).toHaveBeenCalled())
    runtime.scheduleNext.mockClear()
    runtime.cancelScheduledNext.mockClear()
    controller.api.setSoftTransitionDurationSeconds(6)
    await vi.waitFor(() => expect(runtime.scheduleNext).toHaveBeenCalledOnce())
    expect(runtime.scheduleNext).toHaveBeenLastCalledWith(
      2,
      'audio://2',
      expect.objectContaining({ softTransitionDurationSeconds: 6 }),
    )
    const cancellations = runtime.cancelScheduledNext.mock.calls.length
    controller.api.setSoftTransitionDurationSeconds(6)
    expect(runtime.cancelScheduledNext).toHaveBeenCalledTimes(cancellations)
    controller.api.pause()
    snapshot.isPlaying = false
    runtime.scheduleNext.mockClear()
    runtime.cancelScheduledNext.mockClear()
    controller.api.setSoftTransitionDurationSeconds(1.5)
    expect(runtime.scheduleNext).not.toHaveBeenCalled()
    expect(runtime.cancelScheduledNext).not.toHaveBeenCalled()
    snapshot.isPlaying = true
    await controller.api.play()
    await vi.waitFor(() => expect(runtime.scheduleNext).toHaveBeenCalledOnce())
    expect(runtime.scheduleNext).toHaveBeenLastCalledWith(
      2,
      'audio://2',
      expect.objectContaining({ softTransitionDurationSeconds: 1.5 }),
    )
    controller.dispose()
  })

  it('updates volume, persists to storage, and supports mute toggle', () => {
    const controller = createPlaybackController(deps)
    controller.api.setVolume(0.4)

    expect(controller.api.state.volume).toBe(0.4)
    expect(deps.storage.setItem).toHaveBeenCalledWith('auralis-volume', '0.4')

    controller.api.toggleMute()
    expect(controller.api.state.isMuted).toBe(true)

    controller.api.toggleMute()
    expect(controller.api.state.isMuted).toBe(false)
    expect(controller.api.state.volume).toBe(0.4)
  })

  it('supports selecting tracks and setting playback modes', () => {
    const controller = createPlaybackController(deps)
    controller.api.selectTrack(42)
    expect(controller.api.state.selectedTrackId).toBe(42)

    controller.api.setPlaybackMode('shuffle')
    expect(controller.api.state.playbackMode).toBe('shuffle')
  })

  it.each<PlaybackMode>(['sequential', 'repeat-all', 'repeat-one', 'shuffle', 'album-shuffle'])(
    'keeps the current CD session and audio preparation when reselecting %s',
    async (mode) => {
      const controller = createPlaybackController(deps)
      const { api } = controller
      const track: PlaybackTrack = {
        id: 1,
        title: 'Song',
        artist: 'A',
        albumArtist: 'A',
        album: 'Album',
        durationSeconds: 120,
        artworkCacheKey: null,
      }
      await api.playTrackFromQueue([track], 1, { source: 'cd', playbackMode: mode })
      const runtime = vi.mocked(deps.createAudioRuntime!).mock.results[0].value
      const session = api.queueSession.value
      const cancellations = runtime.cancelScheduledNext.mock.calls.length
      vi.mocked(deps.createAudioRuntime!).mock.calls[0][0].onTimeUpdate({
        currentTime: 42,
        duration: api.state.duration,
      })
      api.setPlaybackMode(mode)
      expect(api.queueSession.value).toBe(session)
      expect(api.state.currentTrackId).toBe(1)
      expect(api.state.currentTime).toBe(42)
      expect(runtime.cancelScheduledNext).toHaveBeenCalledTimes(cancellations)
      controller.dispose()
    },
  )

  it('keeps the unfinished shuffle round when the current mode is selected again', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    const controller = createPlaybackController(deps)
    try {
      const tracks: PlaybackTrack[] = [1, 2, 3].map((id) => ({
        id,
        title: String(id),
        artist: 'A',
        albumArtist: 'A',
        album: 'Album',
        durationSeconds: 120,
        artworkCacheKey: null,
      }))
      await controller.api.playTrackFromQueue(tracks, 1, {
        playbackMode: 'shuffle',
        shufflePool: tracks,
        shuffleCycle: true,
      })
      const round = [controller.api.state.currentTrackId]
      await controller.api.playNext()
      round.push(controller.api.state.currentTrackId)
      controller.api.setPlaybackMode('shuffle')
      await controller.api.playNext()
      round.push(controller.api.state.currentTrackId)
      expect(round.sort()).toEqual([1, 2, 3])
    } finally {
      controller.dispose()
      random.mockRestore()
    }
  })

  it('keeps a pending random navigation when the current mode is selected again', async () => {
    let resolveNext!: (track: PlaybackTrack) => void
    vi.mocked(deps.getRandomTrack).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNext = resolve
      }),
    )
    const track: PlaybackTrack = {
      id: 1,
      title: 'Song',
      artist: 'A',
      albumArtist: 'A',
      album: 'Album',
      durationSeconds: 120,
      artworkCacheKey: null,
    }
    const controller = createPlaybackController(deps)
    await controller.api.playTrackFromQueue([track], 1, { playbackMode: 'shuffle' })
    const pending = controller.api.playNext()
    controller.api.setPlaybackMode('shuffle')
    expect(controller.api.isPlaybackPending.value).toBe(true)
    resolveNext({ ...track, id: 2 })
    await pending
    expect(controller.api.state.currentTrackId).toBe(2)
    expect(controller.api.isPlaybackPending.value).toBe(false)
    controller.dispose()
  })

  it('replaces the queue and history with the chosen CD album and keeps shuffle inside it', async () => {
    const controller = createPlaybackController(deps)
    const tracks: PlaybackTrack[] = [1, 2, 3, 9].map((id) => ({
      id,
      title: String(id),
      artist: 'A',
      albumArtist: 'A',
      album: 'CD',
      artworkCacheKey: null,
      durationSeconds: 10,
    }))
    await controller.api.playTrackFromQueue([tracks[3]], 9)
    const album = tracks.slice(0, 3)
    await controller.api.playTrackFromQueue(album, 2, {
      shufflePool: album,
      shuffleCycle: true,
      playbackMode: 'shuffle',
      replaceHistory: true,
    })
    expect(controller.api.state.queue.map((track) => track.id)).toEqual([1, 2, 3])
    const round = [controller.api.state.currentTrackId]
    await controller.api.playNext()
    round.push(controller.api.state.currentTrackId)
    await controller.api.playNext()
    round.push(controller.api.state.currentTrackId)
    expect(round.sort()).toEqual([1, 2, 3])
    for (let i = 0; i < 5; i++) await controller.api.playPrevious()
    expect(controller.api.state.currentTrackId).not.toBe(9)
    expect(deps.getRandomTrack).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('allows safe multiple dispose calls (idempotence)', () => {
    const controller = createPlaybackController(deps)
    expect(() => {
      controller.dispose()
      controller.dispose()
    }).not.toThrow()
  })

  it('preserves previous shuffle pool in history when switching queues and restoring with playPrevious', async () => {
    const controller = createPlaybackController(deps)
    controller.api.setPlaybackMode('shuffle')

    const track1: PlaybackTrack = {
      id: 1,
      title: 'T1',
      artist: 'A',
      album: 'Alb',
      albumArtist: 'A',
      durationSeconds: 120,
      artworkCacheKey: null,
    }
    const track2: PlaybackTrack = {
      id: 2,
      title: 'T2',
      artist: 'A',
      album: 'Alb',
      albumArtist: 'A',
      durationSeconds: 120,
      artworkCacheKey: null,
    }
    const track3: PlaybackTrack = {
      id: 3,
      title: 'T3',
      artist: 'B',
      album: 'AlbB',
      albumArtist: 'B',
      durationSeconds: 120,
      artworkCacheKey: null,
    }

    const oldShufflePool = [track1, track2]
    const newShufflePool = [track3]

    // 1. Play in old queue with oldShufflePool
    await controller.api.playTrackFromQueue([track1, track2], 1, { shufflePool: oldShufflePool })
    expect(controller.api.state.currentTrackId).toBe(1)

    // 2. Switch to new queue with newShufflePool
    await controller.api.playTrackFromQueue([track3], 3, { shufflePool: newShufflePool })
    expect(controller.api.state.currentTrackId).toBe(3)

    // 3. User hits Previous
    await controller.api.playPrevious()

    // 4. Track 1 should be restored with old queue
    expect(controller.api.state.currentTrackId).toBe(1)
    expect(controller.api.state.queue.map((t) => t.id)).toEqual([1, 2])

    // 5. Next should use the restored old shuffle pool, not the newer pool containing track 3
    await controller.api.playNext()
    expect(controller.api.state.currentTrackId).toBe(2)
  })

  it('provides clearError action to clear error state without external direct mutation', async () => {
    const controller = createPlaybackController(deps)
    vi.mocked(deps.getAudioUrl).mockRejectedValueOnce(new Error('Some test error'))
    await controller.api.playTrackFromQueue(frozenTracks(), 1)
    expect(controller.api.state.error).toBe('Some test error')

    controller.api.clearError()
    expect(controller.api.state.error).toBeNull()
    controller.dispose()
  })

  it('cancels a pending audio URL on pause and allows an explicit play retry', async () => {
    let resolveUrl!: (value: { url: string }) => void
    vi.mocked(deps.getAudioUrl).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUrl = resolve
      }),
    )
    const controller = createPlaybackController(deps)
    const runtime = vi.mocked(deps.createAudioRuntime!).mock.results[0].value
    const track: PlaybackTrack = {
      id: 1,
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      albumArtist: 'Artist',
      durationSeconds: 120,
      artworkCacheKey: null,
    }
    const pending = controller.api.playTrackFromQueue([track], 1)
    expect(controller.api.isPlaybackPending.value).toBe(true)
    controller.api.pause()
    expect(controller.api.isPlaybackPending.value).toBe(false)
    resolveUrl({ url: 'audio://cancelled' })
    await pending
    expect(runtime.start).not.toHaveBeenCalled()
    expect(controller.api.state.isPlaying).toBe(false)
    expect(controller.api.state.currentTrackId).toBe(1)

    await controller.api.play()
    expect(runtime.start).toHaveBeenCalledWith(1, 'audio://1', expect.any(Object))
    controller.dispose()
  })

  it('ignores a cancelled URL failure without unlocking a newer playback request', async () => {
    let rejectOld!: (error: Error) => void
    let resolveNew!: (value: { url: string }) => void
    vi.mocked(deps.getAudioUrl)
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectOld = reject
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNew = resolve
        }),
      )
    const controller = createPlaybackController(deps)
    const track: PlaybackTrack = {
      id: 1,
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      albumArtist: 'Artist',
      durationSeconds: 120,
      artworkCacheKey: null,
    }
    const old = controller.api.playTrackFromQueue([track], 1)
    controller.api.pause()
    const newer = controller.api.play()
    rejectOld(new Error('cancelled URL failed'))
    await old
    expect(controller.api.state.error).toBeNull()
    expect(controller.api.isPlaybackPending.value).toBe(true)
    resolveNew({ url: 'audio://new' })
    await newer
    expect(controller.api.isPlaybackPending.value).toBe(false)
    controller.dispose()
  })

  describe('replaceCurrentPlaybackQueue', () => {
    function createTracks(ids: number[]): PlaybackTrack[] {
      return ids.map((id) => ({
        id,
        title: `Song ${id}`,
        artist: 'Artist',
        album: 'Album',
        albumArtist: 'Artist',
        durationSeconds: 120,
        artworkCacheKey: null,
      }))
    }

    it.each([
      'same-queue',
      'other-then-same',
      'new-cd-session',
      'mode',
      'insert',
      'insert-many',
    ] as const)('rejects the old CD session after %s takes over playback', async (takeover) => {
      const controller = createPlaybackController(deps)
      const { api } = controller
      const tracks = createTracks([1, 2])
      await api.playTrackFromQueue(tracks, 1, { source: 'cd', playbackMode: 'sequential' })
      const sessionId = api.queueSession.value!.id
      expect(api.queueSession.value!.source).toBe('cd')

      if (takeover === 'other-then-same') {
        await api.playTrackFromQueue(createTracks([9, 10]), 9)
      }
      if (takeover === 'same-queue' || takeover === 'other-then-same') {
        await api.playTrackFromQueue(createTracks([1, 2]), 1)
        expect(api.queueSession.value!.source).toBe('default')
      } else if (takeover === 'new-cd-session') {
        await api.playTrackFromQueue(tracks, 1, { source: 'cd' })
      } else if (takeover === 'mode') {
        api.setPlaybackMode('repeat-one')
        expect(api.queueSession.value).toBeNull()
      } else if (takeover === 'insert') {
        api.insertTrackAfterCurrent(createTracks([3])[0])
        expect(api.queueSession.value).toBeNull()
      } else if (takeover === 'insert-many') {
        api.insertTracksAfterCurrent(createTracks([3, 4]))
        expect(api.queueSession.value).toBeNull()
      }

      const runtime = vi.mocked(deps.createAudioRuntime!).mock.results[0].value
      const queue = api.state.queue
      vi.mocked(deps.createAudioRuntime!).mock.calls[0][0].onTimeUpdate({
        currentTime: 42,
        duration: api.state.duration,
      })
      const starts = runtime.start.mock.calls.length
      const cancellations = runtime.cancelScheduledNext.mock.calls.length
      const replaced = api.replaceCurrentPlaybackQueue({
        expectedSessionId: sessionId,
        expectedTrackId: 1,
        expectedQueueTrackIds: queue.map((track) => track.id),
        queue: createTracks([1, 2, 3, 4]),
        playbackMode: 'repeat-all',
      })

      expect(replaced).toBe(false)
      expect(api.state.queue).toBe(queue)
      expect(api.state.playbackMode).toBe(takeover === 'mode' ? 'repeat-one' : 'sequential')
      expect(api.state.currentTime).toBe(42)
      expect(runtime.start).toHaveBeenCalledTimes(starts)
      expect(runtime.cancelScheduledNext).toHaveBeenCalledTimes(cancellations)
      controller.dispose()
    })

    it('preserves the CD session through natural advance, pause/resume and queue replacement', async () => {
      const controller = createPlaybackController(deps)
      const { api } = controller
      const runtimeFactory = vi.mocked(deps.createAudioRuntime!)
      const runtime = runtimeFactory.mock.results[0].value
      const callbacks = runtimeFactory.mock.calls[0][0]
      await api.playTrackFromQueue(createTracks([1, 2, 3]), 1, {
        source: 'cd',
        playbackMode: 'sequential',
        replaceHistory: true,
      })
      const session = api.queueSession.value
      callbacks.onEnded(null)
      await vi.waitFor(() => {
        expect(api.state.currentTrackId).toBe(2)
        expect(api.isPlaybackPending.value).toBe(false)
      })
      expect(api.queueSession.value).toBe(session)

      api.pause()
      await api.play()
      expect(api.queueSession.value).toBe(session)
      callbacks.onTimeUpdate({ currentTime: 45, duration: 120 })
      callbacks.onPlayingChange(true)
      const starts = runtime.start.mock.calls.length
      const recorded = vi.mocked(deps.recordEffectivePlay).mock.calls.length
      expect(
        api.replaceCurrentPlaybackQueue({
          expectedSessionId: session!.id,
          expectedTrackId: 2,
          expectedQueueTrackIds: [1, 2, 3],
          queue: createTracks([1, 2]),
          playbackMode: 'repeat-all',
        }),
      ).toBe(true)
      expect(api.queueSession.value).toBe(session)
      expect(api.state.currentTrackId).toBe(2)
      expect(api.state.currentIndex).toBe(1)
      expect(api.state.queue.map((track) => track.id)).toEqual([1, 2])
      expect(api.state.currentTime).toBe(45)
      expect(api.state.isPlaying).toBe(true)
      expect(runtime.start).toHaveBeenCalledTimes(starts)
      expect(deps.recordEffectivePlay).toHaveBeenCalledTimes(recorded)
      controller.dispose()
    })

    it('replaces queue and mode in-place when expectations match', async () => {
      const controller = createPlaybackController(deps)
      const runtime = vi.mocked(deps.createAudioRuntime!).mock.results[0].value
      const initialTracks = createTracks([1, 2])
      await controller.api.playTrackFromQueue(initialTracks, 1, { playbackMode: 'repeat-all' })
      vi.mocked(deps.createAudioRuntime!).mock.calls[0][0].onPlayingChange(true)
      expect(runtime.start).toHaveBeenCalledTimes(1)

      const extendedTracks = createTracks([1, 2, 3, 4])
      const replaced = controller.api.replaceCurrentPlaybackQueue({
        expectedSessionId: controller.api.queueSession.value!.id,
        expectedTrackId: 1,
        expectedQueueTrackIds: [1, 2],
        queue: extendedTracks,
        playbackMode: 'sequential',
      })

      expect(replaced).toBe(true)
      expect(controller.api.state.queue.map((t) => t.id)).toEqual([1, 2, 3, 4])
      expect(controller.api.state.currentIndex).toBe(0)
      expect(controller.api.state.playbackMode).toBe('sequential')
      expect(controller.api.state.currentTrackId).toBe(1)
      // Audio runtime should NOT be restarted
      expect(runtime.start).toHaveBeenCalledTimes(1)
      expect(runtime.cancelScheduledNext).toHaveBeenCalled()
      controller.dispose()
    })

    it('rejects replacement when expected track ID does not match current track', async () => {
      const controller = createPlaybackController(deps)
      const tracks = createTracks([1, 2])
      await controller.api.playTrackFromQueue(tracks, 1, { playbackMode: 'repeat-all' })

      const replaced = controller.api.replaceCurrentPlaybackQueue({
        expectedSessionId: controller.api.queueSession.value!.id,
        expectedTrackId: 2,
        expectedQueueTrackIds: [1, 2],
        queue: createTracks([1, 2, 3]),
        playbackMode: 'sequential',
      })

      expect(replaced).toBe(false)
      expect(controller.api.state.queue.map((t) => t.id)).toEqual([1, 2])
      expect(controller.api.state.playbackMode).toBe('repeat-all')
      controller.dispose()
    })

    it('rejects replacement when expected queue IDs do not match current queue', async () => {
      const controller = createPlaybackController(deps)
      const tracks = createTracks([1, 2])
      await controller.api.playTrackFromQueue(tracks, 1, { playbackMode: 'repeat-all' })

      const replaced = controller.api.replaceCurrentPlaybackQueue({
        expectedSessionId: controller.api.queueSession.value!.id,
        expectedTrackId: 1,
        expectedQueueTrackIds: [1, 999],
        queue: createTracks([1, 2, 3]),
        playbackMode: 'sequential',
      })

      expect(replaced).toBe(false)
      expect(controller.api.state.queue.map((t) => t.id)).toEqual([1, 2])
      controller.dispose()
    })

    it('rejects replacement when new queue does not contain the current track', async () => {
      const controller = createPlaybackController(deps)
      const tracks = createTracks([1, 2])
      await controller.api.playTrackFromQueue(tracks, 1, { playbackMode: 'repeat-all' })

      const replaced = controller.api.replaceCurrentPlaybackQueue({
        expectedSessionId: controller.api.queueSession.value!.id,
        expectedTrackId: 1,
        expectedQueueTrackIds: [1, 2],
        queue: createTracks([3, 4]),
        playbackMode: 'sequential',
      })

      expect(replaced).toBe(false)
      expect(controller.api.state.queue.map((t) => t.id)).toEqual([1, 2])
      controller.dispose()
    })
  })
})
