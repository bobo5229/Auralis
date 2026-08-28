import { describe, expect, it, vi } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { useLibrarySearchSession } from './useLibrarySearchSession'

function createTrack(id: number, title: string): TrackListItem {
  return {
    id,
    title,
    artist: null,
    album: null,
    albumArtist: null,
    trackNo: null,
    discNo: null,
    releaseDate: null,
    copyright: null,
    durationSeconds: null,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-08-28T00:00:00.000Z',
  }
}

function createKeydown(key: string): KeyboardEvent {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent
}

function createSession(overrides?: { disposed?: boolean }) {
  let disposed = overrides?.disposed ?? false
  const scrollToTrackIndex = vi.fn(async () => undefined)
  const session = useLibrarySearchSession({
    isDisposed: () => disposed,
    isLibrarySurface: () => true,
    isInteractiveTarget: () => false,
    scrollToTrackIndex,
  })

  return {
    session,
    scrollToTrackIndex,
    dispose: () => {
      disposed = true
      session.invalidate()
    },
  }
}

const tracks = [createTrack(1, 'Alpha'), createTrack(2, 'Beta'), createTrack(3, 'Alpine')]

describe('useLibrarySearchSession', () => {
  it('keeps an idle outcome and does not scroll for an empty query', async () => {
    const { session, scrollToTrackIndex } = createSession()
    session.scheduleLibrarySearchIndex(tracks)
    session.searchQuery.value = '   '

    await session.jumpToNextSearchMatch()

    expect(session.searchOutcome.value).toEqual({ kind: 'idle' })
    expect(scrollToTrackIndex).not.toHaveBeenCalled()
  })

  it('scrolls to the next prefix match after the index is ready', async () => {
    const { session, scrollToTrackIndex } = createSession()
    session.scheduleLibrarySearchIndex(tracks)
    session.searchQuery.value = 'al'

    await session.jumpToNextSearchMatch()

    expect(scrollToTrackIndex).toHaveBeenCalledWith(0)
    expect(session.searchOutcome.value).toEqual({
      kind: 'matched',
      index: 1,
      total: 2,
      wrapped: false,
    })

    await session.jumpToNextSearchMatch()
    expect(scrollToTrackIndex).toHaveBeenCalledWith(2)
  })

  it('does not scroll when the index generation expires during the jump', async () => {
    const { session, scrollToTrackIndex } = createSession()
    session.scheduleLibrarySearchIndex(tracks)
    session.searchQuery.value = 'al'

    const jump = session.jumpToNextSearchMatch()
    session.invalidate()
    await jump

    expect(scrollToTrackIndex).not.toHaveBeenCalled()
  })

  it('clears the query and outcome on Escape', () => {
    const { session } = createSession()
    session.searchQuery.value = 'al'
    session.searchOutcome.value = { kind: 'not-found' }

    session.onSearchKeydown(createKeydown('Escape'))

    expect(session.searchQuery.value).toBe('')
    expect(session.searchOutcome.value).toEqual({ kind: 'idle' })
    expect(session.hasSearchQuery.value).toBe(false)
  })
})
