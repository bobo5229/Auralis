import { describe, expect, it } from 'vitest'
import {
  LIBRARY_PLAYLISTS_CHANGED_EVENT,
  LIBRARY_SMART_PLAYLISTS_CHANGED_EVENT,
  isSameLibraryRouteScope,
  shouldRefreshLibraryForExternalPlaylistEvent,
} from './libraryRouteScope'

describe('isSameLibraryRouteScope', () => {
  it('matches route kinds and scoped ids', () => {
    expect(isSameLibraryRouteScope({ kind: 'library' }, { kind: 'library' })).toBe(true)
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
        LIBRARY_PLAYLISTS_CHANGED_EVENT,
      ),
    ).toBe(true)
    expect(
      shouldRefreshLibraryForExternalPlaylistEvent(
        { kind: 'smart-playlist', id: 3 },
        LIBRARY_SMART_PLAYLISTS_CHANGED_EVENT,
      ),
    ).toBe(true)
  })

  it('ignores all-songs, cross-kind, and unknown events', () => {
    expect(
      shouldRefreshLibraryForExternalPlaylistEvent(
        { kind: 'library' },
        LIBRARY_PLAYLISTS_CHANGED_EVENT,
      ),
    ).toBe(false)
    expect(
      shouldRefreshLibraryForExternalPlaylistEvent(
        { kind: 'playlist', id: 3 },
        LIBRARY_SMART_PLAYLISTS_CHANGED_EVENT,
      ),
    ).toBe(false)
    expect(
      shouldRefreshLibraryForExternalPlaylistEvent(
        { kind: 'smart-playlist', id: 3 },
        LIBRARY_PLAYLISTS_CHANGED_EVENT,
      ),
    ).toBe(false)
    expect(
      shouldRefreshLibraryForExternalPlaylistEvent({ kind: 'playlist', id: 3 }, 'unrelated'),
    ).toBe(false)
  })
})
