import { describe, expect, it, vi } from 'vitest'
import type { AuralisApi } from '@shared/ipc/api'
import type { TrackListItem } from '@shared/types/libraryScan'
import { createCdAlbumCatalogSession } from './cdAlbumCatalogSession'

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
