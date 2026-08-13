import { describe, expect, it } from 'vitest'
import { resolveLibraryRefreshAnchorTrackId } from './libraryRefreshAnchor'

describe('resolveLibraryRefreshAnchorTrackId', () => {
  const hasTrack = (id: number): boolean => id >= 100 && id < 200

  it('prioritises the real viewport anchor over keyboard focus and playback state', () => {
    expect(
      resolveLibraryRefreshAnchorTrackId({
        candidates: [105, 101, 102, 103],
        hasTrack,
      }),
    ).toBe(105)
  })

  it('skips stale candidates and falls back to the first valid one', () => {
    expect(
      resolveLibraryRefreshAnchorTrackId({
        candidates: [10, null, 101, 102],
        hasTrack,
      }),
    ).toBe(101)
  })

  it('returns null when no candidate survives the refreshed list', () => {
    expect(
      resolveLibraryRefreshAnchorTrackId({
        candidates: [10, null, 20],
        hasTrack,
      }),
    ).toBeNull()
  })

  it('accepts an empty candidate list', () => {
    expect(resolveLibraryRefreshAnchorTrackId({ candidates: [], hasTrack })).toBeNull()
  })
})
