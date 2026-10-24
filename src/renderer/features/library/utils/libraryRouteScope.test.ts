import { describe, expect, it } from 'vitest'
import {
  isSameLibraryRouteScope,
  shouldRefreshLibraryForExternalPlaylistEvent,
} from './libraryRouteScope'

describe('isSameLibraryRouteScope', () => {
  it('matches route kinds and scoped ids', () => {
    expect(isSameLibraryRouteScope({ kind: 'library' }, { kind: 'library' })).toBe(true)
    expect(
      isSameLibraryRouteScope(
        { kind: 'recent-added', range: 7 },
        { kind: 'recent-added', range: 7 },
      ),
    ).toBe(true)
    expect(
      isSameLibraryRouteScope(
        { kind: 'recent-added', range: 7 },
        { kind: 'recent-added', range: 30 },
      ),
    ).toBe(false)
    expect(
      isSameLibraryRouteScope({ kind: 'recent-added', range: 'all' }, { kind: 'library' }),
    ).toBe(false)
    expect(isSameLibraryRouteScope({ kind: 'playlist', id: 7 }, { kind: 'playlist', id: 7 })).toBe(
      true,
    )
    expect(
      isSameLibraryRouteScope({ kind: 'smart-playlist', id: 7 }, { kind: 'smart-playlist', id: 8 }),
    ).toBe(false)
    expect(
      isSameLibraryRouteScope({ kind: 'playlist', id: 7 }, { kind: 'smart-playlist', id: 7 }),
    ).toBe(false)
  })
})

describe('shouldRefreshLibraryForExternalPlaylistEvent', () => {
  it('refreshes only the matching playlist surface', () => {
    expect(
      shouldRefreshLibraryForExternalPlaylistEvent(
        { kind: 'playlist', id: 3 },
        { kind: 'playlist', playlistId: 3, reason: 'renamed' },
      ),
    ).toBe(true)
    expect(
      shouldRefreshLibraryForExternalPlaylistEvent(
        { kind: 'smart-playlist', id: 3 },
        { kind: 'smart', playlistId: 3, reason: 'renamed' },
      ),
    ).toBe(true)
  })

  it('ignores all-songs, cross-kind, and unknown events', () => {
    expect(
      shouldRefreshLibraryForExternalPlaylistEvent(
        { kind: 'library' },
        { kind: 'playlist', playlistId: 3, reason: 'renamed' },
      ),
    ).toBe(false)
    expect(
      shouldRefreshLibraryForExternalPlaylistEvent(
        { kind: 'playlist', id: 3 },
        { kind: 'smart', playlistId: 3, reason: 'renamed' },
      ),
    ).toBe(false)
    expect(
      shouldRefreshLibraryForExternalPlaylistEvent(
        { kind: 'smart-playlist', id: 3 },
        { kind: 'playlist', playlistId: 3, reason: 'renamed' },
      ),
    ).toBe(false)
    expect(
      shouldRefreshLibraryForExternalPlaylistEvent(
        { kind: 'recent-added', range: 7 },
        { kind: 'playlist', playlistId: 3, reason: 'renamed' },
      ),
    ).toBe(false)
    expect(
      shouldRefreshLibraryForExternalPlaylistEvent(
        { kind: 'playlist', id: 3 },
        { kind: 'collection', reason: 'reordered' },
      ),
    ).toBe(false)
  })
})
