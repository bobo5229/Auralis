import { describe, expect, it } from 'vitest'
import { shouldRefetchLyricsOnLibraryChange } from './shouldRefetchLyricsOnLibraryChange'

const currentTrackId = 42

describe('shouldRefetchLyricsOnLibraryChange', () => {
  it('returns true when the current track is in a track-added event', () => {
    expect(
      shouldRefetchLyricsOnLibraryChange({
        currentTrackId,
        reason: 'track-added',
        trackIds: [7, currentTrackId, 99],
      }),
    ).toBe(true)
  })

  it('returns true when the current track is in a track-restored event', () => {
    expect(
      shouldRefetchLyricsOnLibraryChange({
        currentTrackId,
        reason: 'track-restored',
        trackIds: [currentTrackId],
      }),
    ).toBe(true)
  })

  it('returns true for the existing metadata-refresh, file-change, and track-relocated reasons', () => {
    for (const reason of ['metadata-refresh', 'file-change', 'track-relocated'] as const) {
      expect(
        shouldRefetchLyricsOnLibraryChange({
          currentTrackId,
          reason,
          trackIds: [currentTrackId],
        }),
      ).toBe(true)
    }
  })

  it('returns false when the current track is not in trackIds', () => {
    expect(
      shouldRefetchLyricsOnLibraryChange({
        currentTrackId,
        reason: 'track-added',
        trackIds: [1, 2, 3],
      }),
    ).toBe(false)
  })

  it('returns false when there is no current track', () => {
    expect(
      shouldRefetchLyricsOnLibraryChange({
        currentTrackId: null,
        reason: 'track-added',
        trackIds: [currentTrackId],
      }),
    ).toBe(false)
  })

  it('returns false for play-stats-updated, play-stats-reset, and track-missing even when the id matches', () => {
    for (const reason of ['play-stats-updated', 'play-stats-reset', 'track-missing'] as const) {
      expect(
        shouldRefetchLyricsOnLibraryChange({
          currentTrackId,
          reason,
          trackIds: [currentTrackId],
        }),
      ).toBe(false)
    }
  })
})
