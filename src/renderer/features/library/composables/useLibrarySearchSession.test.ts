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

  it('keeps search bar visible while hovering top 48px zone from left, center and right, regardless of mount state', () => {
    const { session } = createSession()
    const container = {
      getBoundingClientRect: () => ({
        top: 100,
        bottom: 600,
        left: 0,
        right: 800,
        width: 800,
        height: 500,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      }),
    } as unknown as HTMLElement

    // 1. Initial hover in top left (x=50, y=120)
    session.onLibraryListMouseMove({
      currentTarget: container,
      clientX: 50,
      clientY: 120,
    } as unknown as MouseEvent)
    expect(session.isSearchZoneHovered.value).toBe(true)
    expect(session.shouldRenderSearchBar.value).toBe(true)

    // 2. Bar element mounts (centered at x=400, width=360: left=220, right=580)
    const barEl = {
      getBoundingClientRect: () => ({
        top: 108,
        bottom: 146,
        left: 220,
        right: 580,
        width: 360,
        height: 38,
        x: 220,
        y: 108,
        toJSON: () => ({}),
      }),
    } as unknown as HTMLElement
    session.searchRootRef.value = barEl

    // 3. Mouse moves continuously across top: left (x=50), right (x=750), center (x=400)
    for (const clientX of [50, 750, 400, 300, 600]) {
      session.onLibraryListMouseMove({
        currentTarget: container,
        clientX,
        clientY: 120,
      } as unknown as MouseEvent)
      expect(session.isSearchZoneHovered.value).toBe(true)
      expect(session.shouldRenderSearchBar.value).toBe(true)
    }

    // 4. Mouse leaves top 48px area (y = 200)
    session.onLibraryListMouseMove({
      currentTarget: container,
      clientX: 400,
      clientY: 200,
    } as unknown as MouseEvent)
    expect(session.isSearchZoneHovered.value).toBe(false)
    expect(session.shouldRenderSearchBar.value).toBe(false)
  })

  it('keeps search bar permanently visible when focused or having query even when mouse moves away', () => {
    const { session } = createSession()
    session.onSearchInputFocus()
    expect(session.isSearchFocused.value).toBe(true)
    expect(session.shouldRenderSearchBar.value).toBe(true)

    session.onLibraryListMouseLeave()
    expect(session.shouldRenderSearchBar.value).toBe(true)

    // Clicking inside search bar keeps focus
    const barEl = {
      contains: vi.fn((target: unknown) => target === barEl),
    } as unknown as HTMLElement
    session.searchRootRef.value = barEl

    // Clicking outside dismisses focus when query is empty
    class FakeNode {}
    const originalNode = globalThis.Node
    globalThis.Node = FakeNode as unknown as typeof Node
    try {
      const outsideEl = new FakeNode()
      session.onDocumentPointerDown({ target: outsideEl } as unknown as PointerEvent)
      expect(session.isSearchFocused.value).toBe(false)
      expect(session.shouldRenderSearchBar.value).toBe(false)
    } finally {
      globalThis.Node = originalNode
    }
  })

  it('preserves search bar visibility when query is non-empty even after clicking outside', () => {
    const { session } = createSession()
    session.searchQuery.value = 'query text'
    expect(session.hasSearchQuery.value).toBe(true)
    expect(session.shouldRenderSearchBar.value).toBe(true)

    class FakeNode {}
    const originalNode = globalThis.Node
    globalThis.Node = FakeNode as unknown as typeof Node
    try {
      const outsideEl = new FakeNode()
      session.onDocumentPointerDown({ target: outsideEl } as unknown as PointerEvent)
      // Focus lost, but query remains -> keeps visible
      expect(session.isSearchFocused.value).toBe(false)
      expect(session.shouldRenderSearchBar.value).toBe(true)
    } finally {
      globalThis.Node = originalNode
    }
  })

  it('handles Escape key: clears query first, then dismisses focus on second Escape', () => {
    const { session } = createSession()
    session.searchQuery.value = 'hello'
    session.onSearchInputFocus()
    expect(session.shouldRenderSearchBar.value).toBe(true)

    // 1st Escape -> Clears query
    session.onSearchKeydown(createKeydown('Escape'))
    expect(session.searchQuery.value).toBe('')
    expect(session.isSearchFocused.value).toBe(true)

    // 2nd Escape -> Dismisses focus
    session.onSearchKeydown(createKeydown('Escape'))
    expect(session.isSearchFocused.value).toBe(false)
    expect(session.shouldRenderSearchBar.value).toBe(false)
  })
})
