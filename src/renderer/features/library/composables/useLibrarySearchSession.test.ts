import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { resolveHiddenLibrarySearchBarRect } from '../utils/librarySearchHover'
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
    composer: null,
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

function createSession(overrides?: {
  disposed?: boolean
  scrollToTrackIndex?: (index: number, isRequestCurrent?: () => boolean) => Promise<void>
}) {
  let disposed = overrides?.disposed ?? false
  const scrollToTrackIndex = overrides?.scrollToTrackIndex ?? vi.fn(async () => undefined)
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

    expect(scrollToTrackIndex).toHaveBeenCalledWith(0, expect.any(Function))
    expect(session.searchOutcome.value).toEqual({
      kind: 'matched',
      index: 1,
      total: 2,
      wrapped: false,
    })

    await session.jumpToNextSearchMatch()
    expect(scrollToTrackIndex).toHaveBeenCalledWith(2, expect.any(Function))
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

  it('reveals the search bar only inside its centered box, then hides after leaving with no focus or query', () => {
    const { session } = createSession()
    const containerRect = {
      top: 100,
      bottom: 600,
      left: 0,
      right: 800,
      width: 800,
      height: 500,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    }
    const container = {
      getBoundingClientRect: () => containerRect,
    } as unknown as HTMLElement
    const hidden = resolveHiddenLibrarySearchBarRect(containerRect)

    function move(clientX: number, clientY: number): void {
      session.onLibraryListMouseMove({
        currentTarget: container,
        clientX,
        clientY,
      } as unknown as MouseEvent)
    }

    move(50, 120)
    expect(session.isSearchZoneHovered.value).toBe(false)
    expect(session.shouldRenderSearchBar.value).toBe(false)

    move(750, 120)
    expect(session.shouldRenderSearchBar.value).toBe(false)

    move((hidden.left + hidden.right) / 2, hidden.top + 4)
    expect(session.isSearchZoneHovered.value).toBe(true)
    expect(session.shouldRenderSearchBar.value).toBe(true)

    const barEl = {
      getBoundingClientRect: () => hidden,
    } as unknown as HTMLElement
    session.searchRootRef.value = barEl

    move(50, 120)
    expect(session.shouldRenderSearchBar.value).toBe(false)

    move(400, hidden.top + 4)
    expect(session.shouldRenderSearchBar.value).toBe(true)

    move(400, 200)
    expect(session.isSearchZoneHovered.value).toBe(false)
    expect(session.shouldRenderSearchBar.value).toBe(false)
  })

  it('matches the mounted search bar width on a narrow panel', () => {
    const { session } = createSession()
    const containerRect = {
      top: 20,
      bottom: 400,
      left: 40,
      right: 340,
      width: 300,
      height: 380,
      x: 40,
      y: 20,
      toJSON: () => ({}),
    }
    const container = {
      getBoundingClientRect: () => containerRect,
    } as unknown as HTMLElement
    const barRect = resolveHiddenLibrarySearchBarRect(containerRect)
    session.searchRootRef.value = {
      getBoundingClientRect: () => barRect,
    } as unknown as HTMLElement

    function move(clientX: number, clientY: number): void {
      session.onLibraryListMouseMove({
        currentTarget: container,
        clientX,
        clientY,
      } as unknown as MouseEvent)
    }

    expect(barRect.right - barRect.left).toBe(252)
    move(barRect.left, barRect.top + 8)
    expect(session.shouldRenderSearchBar.value).toBe(true)
    move(barRect.left - 1, barRect.top + 8)
    expect(session.shouldRenderSearchBar.value).toBe(false)
    move(barRect.right + 1, barRect.top + 8)
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

  it('resets outcome and cursor when query changes to another non-empty string after match', async () => {
    const { session, scrollToTrackIndex } = createSession()
    session.scheduleLibrarySearchIndex(tracks)
    session.searchQuery.value = 'al'

    // First Enter -> matches Alpha (index 0)
    await session.jumpToNextSearchMatch()
    expect(scrollToTrackIndex).toHaveBeenCalledWith(0, expect.any(Function))
    expect(session.searchOutcome.value).toEqual({
      kind: 'matched',
      index: 1,
      total: 2,
      wrapped: false,
    })

    // Modify to another non-empty query -> immediate reset to idle
    session.searchQuery.value = 'bet'
    await nextTick()
    expect(session.searchOutcome.value).toEqual({ kind: 'idle' })

    // Second Enter -> matches Beta (index 1) using new query
    await session.jumpToNextSearchMatch()
    expect(scrollToTrackIndex).toHaveBeenCalledWith(1, expect.any(Function))
    expect(session.searchOutcome.value).toEqual({
      kind: 'matched',
      index: 1,
      total: 1,
      wrapped: false,
    })

    // Consecutive Enter -> cycles properly
    await session.jumpToNextSearchMatch()
    expect(session.searchOutcome.value).toEqual({
      kind: 'matched',
      index: 1,
      total: 1,
      wrapped: true,
    })
  })

  it('resets outcome when query changes to another non-empty string after not-found', async () => {
    const { session } = createSession()
    session.scheduleLibrarySearchIndex(tracks)
    session.searchQuery.value = 'gamma'

    // Enter -> not found
    await session.jumpToNextSearchMatch()
    expect(session.searchOutcome.value).toEqual({ kind: 'not-found' })

    // Modify to another non-empty query -> outcome immediately reset to idle
    session.searchQuery.value = 'alp'
    await nextTick()
    expect(session.searchOutcome.value).toEqual({ kind: 'idle' })

    // Enter -> matches Alpha (first of Alpha & Alpine)
    await session.jumpToNextSearchMatch()
    expect(session.searchOutcome.value).toEqual({
      kind: 'matched',
      index: 1,
      total: 2,
      wrapped: false,
    })
  })

  it('resets outcome and cursor when query is cleared', async () => {
    const { session } = createSession()
    session.scheduleLibrarySearchIndex(tracks)
    session.searchQuery.value = 'al'

    await session.jumpToNextSearchMatch()
    expect(session.searchOutcome.value).toMatchObject({ kind: 'matched' })

    // Clear input -> resets to idle
    session.searchQuery.value = ''
    await nextTick()
    expect(session.searchOutcome.value).toEqual({ kind: 'idle' })

    // Enter on empty query stays idle
    await session.jumpToNextSearchMatch()
    expect(session.searchOutcome.value).toEqual({ kind: 'idle' })
  })

  it('clears stale outcome on data snapshot update, re-evaluating on next Enter and cycling', async () => {
    const { session, scrollToTrackIndex } = createSession()
    session.scheduleLibrarySearchIndex(tracks)
    session.searchQuery.value = 'al'

    // First Enter -> matches Alpha (index 0)
    await session.jumpToNextSearchMatch()
    expect(session.searchOutcome.value).toEqual({
      kind: 'matched',
      index: 1,
      total: 2,
      wrapped: false,
    })

    // Snapshot commit triggers resetMatchCursor() which clears outcome
    session.resetMatchCursor()
    expect(session.searchOutcome.value).toEqual({ kind: 'idle' })

    // New tracks where Alpha is removed, only Alpine remains
    const updatedTracks = [createTrack(2, 'Beta'), createTrack(3, 'Alpine')]
    session.scheduleLibrarySearchIndex(updatedTracks)

    // Next Enter uses new snapshot from start
    await session.jumpToNextSearchMatch()
    expect(scrollToTrackIndex).toHaveBeenLastCalledWith(1, expect.any(Function)) // Alpine is at index 1 of updatedTracks
    expect(session.searchOutcome.value).toEqual({
      kind: 'matched',
      index: 1,
      total: 1,
      wrapped: false,
    })

    // Consecutive Enter cycles properly
    await session.jumpToNextSearchMatch()
    expect(session.searchOutcome.value).toEqual({
      kind: 'matched',
      index: 1,
      total: 1,
      wrapped: true,
    })
  })

  it('invalidates pending scroll request when query changes during scroll wait', async () => {
    let releaseScroll!: () => void
    let notifyScrollCalled!: () => void
    const scrollCalled = new Promise<void>((resolve) => {
      notifyScrollCalled = resolve
    })
    let capturedIsCurrent: (() => boolean) | undefined
    const scrollToTrackIndex = vi.fn((_index: number, isRequestCurrent?: () => boolean) => {
      capturedIsCurrent = isRequestCurrent
      notifyScrollCalled()
      return new Promise<void>((resolve) => {
        releaseScroll = resolve
      })
    })
    const { session } = createSession({ scrollToTrackIndex })
    session.scheduleLibrarySearchIndex(tracks)
    session.searchQuery.value = 'al'

    const searchPromise = session.jumpToNextSearchMatch()
    await scrollCalled
    expect(capturedIsCurrent).toBeDefined()
    expect(capturedIsCurrent!()).toBe(true)

    // User modifies query while scroll is waiting
    session.searchQuery.value = 'alp'
    await nextTick()

    // Old request is now invalidated
    expect(capturedIsCurrent!()).toBe(false)
    releaseScroll()
    await searchPromise
  })

  it('invalidates previous scroll request when another search is initiated while waiting', async () => {
    const capturedCheckers: Array<(() => boolean) | undefined> = []
    const resolvers: Array<() => void> = []
    let notifyFirstScroll!: () => void
    const firstScrollCalled = new Promise<void>((resolve) => {
      notifyFirstScroll = resolve
    })
    let notifySecondScroll!: () => void
    const secondScrollCalled = new Promise<void>((resolve) => {
      notifySecondScroll = resolve
    })

    let callCount = 0
    const scrollToTrackIndex = vi.fn((_index: number, isRequestCurrent?: () => boolean) => {
      callCount += 1
      capturedCheckers.push(isRequestCurrent)
      if (callCount === 1) notifyFirstScroll()
      else if (callCount === 2) notifySecondScroll()
      return new Promise<void>((resolve) => {
        resolvers.push(resolve)
      })
    })
    const { session } = createSession({ scrollToTrackIndex })
    session.scheduleLibrarySearchIndex(tracks)
    session.searchQuery.value = 'al'

    // First search
    const firstSearch = session.jumpToNextSearchMatch()
    await firstScrollCalled
    expect(capturedCheckers.length).toBe(1)
    expect(capturedCheckers[0]!()).toBe(true)

    // User presses Enter again before first scroll finishes
    const secondSearch = session.jumpToNextSearchMatch()
    await secondScrollCalled
    expect(capturedCheckers.length).toBe(2)

    // First request is invalidated, second request is current
    expect(capturedCheckers[0]!()).toBe(false)
    expect(capturedCheckers[1]!()).toBe(true)

    resolvers.forEach((r) => r())
    await Promise.all([firstSearch, secondSearch])
  })

  it('invalidates pending scroll request when snapshot is committed during scroll wait', async () => {
    let releaseScroll!: () => void
    let notifyScrollCalled!: () => void
    const scrollCalled = new Promise<void>((resolve) => {
      notifyScrollCalled = resolve
    })
    let capturedIsCurrent: (() => boolean) | undefined
    const scrollToTrackIndex = vi.fn((_index: number, isRequestCurrent?: () => boolean) => {
      capturedIsCurrent = isRequestCurrent
      notifyScrollCalled()
      return new Promise<void>((resolve) => {
        releaseScroll = resolve
      })
    })
    const { session } = createSession({ scrollToTrackIndex })
    session.scheduleLibrarySearchIndex(tracks)
    session.searchQuery.value = 'al'

    const searchPromise = session.jumpToNextSearchMatch()
    await scrollCalled
    expect(capturedIsCurrent!()).toBe(true)

    // Snapshot committed -> resetMatchCursor
    session.resetMatchCursor()

    expect(capturedIsCurrent!()).toBe(false)
    releaseScroll()
    await searchPromise
  })

  it('invalidates pending scroll request when search is cleared during scroll wait', async () => {
    let releaseScroll!: () => void
    let notifyScrollCalled!: () => void
    const scrollCalled = new Promise<void>((resolve) => {
      notifyScrollCalled = resolve
    })
    let capturedIsCurrent: (() => boolean) | undefined
    const scrollToTrackIndex = vi.fn((_index: number, isRequestCurrent?: () => boolean) => {
      capturedIsCurrent = isRequestCurrent
      notifyScrollCalled()
      return new Promise<void>((resolve) => {
        releaseScroll = resolve
      })
    })
    const { session } = createSession({ scrollToTrackIndex })
    session.scheduleLibrarySearchIndex(tracks)
    session.searchQuery.value = 'al'

    const searchPromise = session.jumpToNextSearchMatch()
    await scrollCalled
    expect(capturedIsCurrent!()).toBe(true)

    session.clearSearch()

    expect(capturedIsCurrent!()).toBe(false)
    releaseScroll()
    await searchPromise
  })

  it('does not scroll for old requests and correctly scrolls for the latest search request', async () => {
    let scrollTop = 0
    const scrollToTrackIndex = vi.fn(async (index: number, isRequestCurrent?: () => boolean) => {
      await nextTick()
      if (isRequestCurrent && !isRequestCurrent()) return
      scrollTop = (index + 1) * 100
    })
    const { session } = createSession({ scrollToTrackIndex })
    session.scheduleLibrarySearchIndex(tracks) // 0: Alpha, 1: Beta, 2: Alpine
    session.searchQuery.value = 'al'

    // Trigger 1st match (Alpha at index 0)
    const firstSearch = session.jumpToNextSearchMatch()
    // Immediately change query to 'bet' and trigger 2nd match
    session.searchQuery.value = 'bet'
    await nextTick()
    const secondSearch = session.jumpToNextSearchMatch()

    await Promise.all([firstSearch, secondSearch])

    // scrollTop should be set for Beta (index 1 -> 200), not Alpha (index 0 -> 100)
    expect(scrollTop).toBe(200)
  })

  it('discards stale search request when query is changed and restored back while awaiting search index', async () => {
    const scrollToTrackIndex = vi.fn(async () => undefined)
    const { session } = createSession({ scrollToTrackIndex })

    // Schedule index build (deferred by setTimeout/yieldToMain in createLibrarySearchIndexIncrementally)
    session.scheduleLibrarySearchIndex(tracks)
    session.searchQuery.value = 'al'

    // First search initiated while index is still pending
    const firstSearch = session.jumpToNextSearchMatch()

    // Query changed to another text and restored back to 'al' while awaiting index
    session.searchQuery.value = 'beta'
    await nextTick()
    session.searchQuery.value = 'al'
    await nextTick()

    // Wait for firstSearch to finish
    await firstSearch

    // The first search must be discarded: outcome must not be updated to matched, scroll not invoked
    expect(session.searchOutcome.value).toEqual({ kind: 'idle' })
    expect(scrollToTrackIndex).not.toHaveBeenCalled()

    // Now index is ready, user presses Enter again for current query
    await session.jumpToNextSearchMatch()
    expect(session.searchOutcome.value).toEqual({
      kind: 'matched',
      index: 1,
      total: 2,
      wrapped: false,
    })
    expect(scrollToTrackIndex).toHaveBeenCalledTimes(1)
  })
})
