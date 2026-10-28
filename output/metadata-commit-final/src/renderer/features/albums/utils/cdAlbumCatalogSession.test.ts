import { describe, expect, it, vi } from 'vitest'
import type { AuralisApi } from '@shared/ipc/api'
import type { TrackListItem } from '@shared/types/libraryScan'
import { createLibraryCatalogViewIndex } from '@renderer/features/library/utils/libraryCatalogViewIndex'
import { createCdAlbumCatalogSession } from './cdAlbumCatalogSession'
import { buildCdAlbumIndex } from './cdAlbumIndex'
import { buildCdPlaybackPlan } from './cdPlaybackQueue'

type CatalogLibrary = Pick<AuralisApi['library'], 'getTracks' | 'onChanged'>

function track(album: string): TrackListItem {
  return { id: 1, album, albumArtist: 'Artist', artist: 'Artist', title: 'Song' } as TrackListItem
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('CD album catalog session', () => {
  it('reuses songs page album and track order in both CD views and sequential playback', async () => {
    const song = (id: number, patch: Partial<TrackListItem>): TrackListItem => ({
      ...track('Zeta'),
      id,
      title: `Song ${id}`,
      albumArtist: 'Artist 2',
      releaseDate: '2020',
      discNo: 1,
      trackNo: 1,
      ...patch,
    })
    // Simulate getTracks' already ordered result; main-process sorting has its own tests.
    const orderedTracks = [
      song(4, { discNo: null, trackNo: null }),
      song(3, { trackNo: null }),
      song(1, { title: 'Zeta' }),
      song(2, { album: 'Alpha' }),
      song(5, { title: 'Alpha' }),
      song(6, { album: 'No date', releaseDate: null }),
      song(7, { albumArtist: 'Artist 10', album: 'Natural number order' }),
      song(8, { albumArtist: '周杰伦', album: 'Chinese artist' }),
      song(9, { albumArtist: '2Pac', album: 'Numeric artist' }),
      song(10, { albumArtist: null, artist: 'Fallback artist', album: 'No artist' }),
    ]
    const songsGroups = createLibraryCatalogViewIndex(orderedTracks, () => 1).albumGroups
    const session = createCdAlbumCatalogSession({
      getTracks: vi.fn().mockResolvedValue(orderedTracks),
      onChanged: () => () => undefined,
    })
    const albums = await session.load()
    expect(albums.map((item) => item.title)).toEqual(songsGroups.map((item) => item.album))
    expect(albums.map((item) => item.tracks.map((song) => song.id))).toEqual(
      songsGroups.map((item) => item.tracks.map((song) => song.id)),
    )
    // Same-date albums keep their first track's order rather than title order.
    expect(albums.slice(0, 3).map((item) => item.title)).toEqual(['Zeta', 'Alpha', 'No date'])
    expect(albums[0].tracks.map((item) => item.id)).toEqual([4, 3, 1, 5])

    for (const columns of [1, 4, 6]) {
      const model = buildCdAlbumIndex(albums, columns)
      const indexAlbums = model.rows.flatMap((row) => {
        if (row.type === 'albums') return row.albums
        if (row.type === 'shared') return row.blocks.flatMap((block) => block.albums)
        return []
      })
      expect(indexAlbums.map((item) => item.key)).toEqual(albums.map((item) => item.key))
    }
    const plan = buildCdPlaybackPlan(albums, albums[0].tracks[0].id, 'catalog-sequential')
    expect(plan?.queue.map((item) => item.id)).toEqual(
      songsGroups.flatMap((item) => item.tracks.map((song) => song.id)),
    )
    session.clear()
  })

  it('shares one read across views and reloads only after a library change', async () => {
    let notify: (event: { reason: string }) => void = () => undefined
    const stop = vi.fn()
    const getTracks = vi
      .fn()
      .mockResolvedValueOnce([track('First')])
      .mockResolvedValueOnce([track('Second')])
    const library = {
      getTracks,
      onChanged: vi.fn((listener: typeof notify) => {
        notify = listener
        return stop
      }),
    } as unknown as CatalogLibrary
    const session = createCdAlbumCatalogSession(library)
    const onChange = vi.fn()
    session.subscribe(onChange)

    const [first, otherView] = await Promise.all([session.load(), session.load()])
    expect(first).toBe(otherView)
    expect(first[0].title).toBe('First')
    expect(getTracks).toHaveBeenCalledTimes(1)
    expect((await session.load())[0].title).toBe('First')
    expect(getTracks).toHaveBeenCalledTimes(1)

    notify({ reason: 'play-stats-updated' })
    expect(onChange).not.toHaveBeenCalled()
    notify({ reason: 'scan-completed' })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect((await session.load())[0].title).toBe('Second')
    expect(getTracks).toHaveBeenCalledTimes(2)

    session.clear()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('discards an outdated read and publishes the latest revision', async () => {
    const first = deferred<TrackListItem[]>()
    let notify: (event: { reason: string }) => void = () => undefined
    const getTracks = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce([track('Updated')])
    const library = {
      getTracks,
      onChanged: (listener: typeof notify) => {
        notify = listener
        return () => undefined
      },
    } as unknown as CatalogLibrary
    const session = createCdAlbumCatalogSession(library)
    const loading = session.load()
    notify({ reason: 'metadata-updated' })
    first.resolve([track('Outdated')])

    expect((await loading)[0].title).toBe('Updated')
    expect(getTracks).toHaveBeenCalledTimes(2)
    session.clear()
  })

  it('does not refill a cleared session from an old in-flight request', async () => {
    const first = deferred<TrackListItem[]>()
    const getTracks = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce([track('New session')])
    const library = {
      getTracks,
      onChanged: () => () => undefined,
    } as unknown as CatalogLibrary
    const session = createCdAlbumCatalogSession(library)
    const oldRequest = session.load()
    session.clear()
    const freshRequest = session.load()
    first.resolve([track('Old session')])

    expect(await oldRequest).toEqual([])
    expect((await freshRequest)[0].title).toBe('New session')
    expect(getTracks).toHaveBeenCalledTimes(2)
    session.clear()
  })
})
