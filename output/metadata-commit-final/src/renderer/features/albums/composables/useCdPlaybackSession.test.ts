import { describe, expect, it, vi } from 'vitest'
import { reactive, shallowRef } from 'vue'
import type { PlaybackQueueSession } from '@renderer/features/playback/runtime/playbackController'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { CdAlbumInfo } from '../types/cdAlbumInfo'
import { useCdPlaybackSession } from './useCdPlaybackSession'

function fixture() {
  const track = (id: number) => ({ id }) as TrackListItem
  const albums = shallowRef([
    { key: 'one', tracks: [track(1), track(2)] },
    { key: 'two', tracks: [track(3), track(4)] },
    { key: 'three', tracks: [track(5)] },
  ] as CdAlbumInfo[])
  const focusedAlbum = shallowRef<CdAlbumInfo | null>(albums.value[1])
  const state = reactive({ currentTrackId: null as number | null, queue: [track(9)] })
  const queueSession = shallowRef<PlaybackQueueSession | null>(null)
  const playTrackFromQueue = vi.fn(async () => {})
  const replaceCurrentPlaybackQueue = vi.fn(() => true)
  const togglePlayPause = vi.fn(async () => {})
  const playback = {
    state,
    queueSession,
    playTrackFromQueue,
    replaceCurrentPlaybackQueue,
    togglePlayPause,
  }
  let unavailable = false
  return {
    ...useCdPlaybackSession({ albums, focusedAlbum, playback, isUnavailable: () => unavailable }),
    albums,
    focusedAlbum,
    state,
    queueSession,
    playTrackFromQueue,
    replaceCurrentPlaybackQueue,
    togglePlayPause,
    setUnavailable: (value: boolean) => {
      unavailable = value
    },
  }
}

describe('useCdPlaybackSession', () => {
  it('starts the catalog queue from the focused album and replaces history', () => {
    const f = fixture()
    f.playCdTrack(4)
    expect(f.playTrackFromQueue).toHaveBeenCalledWith(
      [...f.albums.value[1].tracks, ...f.albums.value[2].tracks],
      4,
      {
        source: 'cd',
        playbackMode: 'sequential',
        replaceHistory: true,
        shufflePool: undefined,
        shuffleCycle: undefined,
      },
    )
    expect(f.state.queue.map((t) => t.id)).toEqual([9])
  })

  it('ignores tracks outside the focused album and a removed focus', () => {
    const f = fixture()
    f.playCdTrack(1)
    f.playCdTrack(99)
    f.focusedAlbum.value = null
    f.playCdTrack(4)
    expect(f.playTrackFromQueue).not.toHaveBeenCalled()
  })

  it('cycles local modes without changing an unrelated or missing playback session', () => {
    const f = fixture()
    f.state.currentTrackId = 3
    f.cycleMode()
    expect(f.cdMode.value).toBe('repeat-all')
    f.queueSession.value = { id: 7, source: 'default' }
    f.cycleMode()
    expect(f.cdMode.value).toBe('shuffle')
    f.queueSession.value = { id: 8, source: 'cd' }
    f.state.currentTrackId = null
    f.cycleMode()
    expect(f.cdMode.value).toBe('sequential')
    f.state.currentTrackId = 99
    f.cycleMode()
    expect(f.cdMode.value).toBe('catalog-sequential')
    expect(f.replaceCurrentPlaybackQueue).not.toHaveBeenCalled()
  })

  it('keeps session, track and queue guards when rebuilding all four modes', () => {
    const f = fixture()
    f.state.currentTrackId = 3
    f.state.queue = [...f.albums.value[1].tracks, ...f.albums.value[2].tracks]
    f.queueSession.value = { id: 42, source: 'cd' }
    const expected = [
      { playbackMode: 'repeat-all', queue: f.albums.value[1].tracks },
      {
        playbackMode: 'shuffle',
        queue: f.albums.value[1].tracks,
        shufflePool: f.albums.value[1].tracks,
        shuffleCycle: true,
      },
      { playbackMode: 'sequential', queue: f.albums.value[1].tracks },
      { playbackMode: 'sequential', queue: f.state.queue },
    ]
    for (const plan of expected) {
      f.cycleMode()
      expect(f.replaceCurrentPlaybackQueue).toHaveBeenLastCalledWith({
        expectedSessionId: 42,
        expectedTrackId: 3,
        expectedQueueTrackIds: [3, 4, 5],
        shufflePool: undefined,
        shuffleCycle: undefined,
        ...plan,
      })
    }
  })

  it('matches the live track across catalog and focus changes and guards disc toggles', () => {
    const f = fixture()
    expect(f.browsingPlaybackAlbumIndex.value).toBe(-1)
    expect(f.toggleCdPlayback()).toBe(false)
    f.state.currentTrackId = 3
    expect(f.browsingPlaybackAlbumIndex.value).toBe(1)
    expect(f.ringTrackMatches.value).toBe(true)
    expect(f.toggleCdPlayback()).toBe(true)
    f.setUnavailable(true)
    expect(f.toggleCdPlayback()).toBe(false)
    f.setUnavailable(false)
    f.focusedAlbum.value = f.albums.value[0]
    expect(f.toggleCdPlayback()).toBe(false)
    f.albums.value = []
    expect(f.browsingPlaybackAlbumIndex.value).toBe(-1)
    expect(f.togglePlayPause).toHaveBeenCalledOnce()
  })
})
