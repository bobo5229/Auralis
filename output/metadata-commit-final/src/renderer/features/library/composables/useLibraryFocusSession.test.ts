import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, ref, shallowRef } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import { createLibraryCatalogViewIndex } from '../utils/libraryCatalogViewIndex'
import { useLibraryViewport } from './useLibraryViewport'
import { useLibraryFocusSession } from './useLibraryFocusSession'

const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
const query = vi.fn<(selector: string) => HTMLElement | null>()
const cleanups: Array<() => void> = []
function element() {
  return { focus: vi.fn() } as unknown as HTMLElement
}
function track(id: number): TrackListItem {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Artist',
    albumArtist: 'Artist',
    album: 'Album',
    trackNo: id,
    discNo: 1,
    releaseDate: null,
    copyright: null,
    composer: null,
    bitrateBps: null,
    durationSeconds: 180,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-01-01',
  }
}
async function settle() {
  for (let i = 0; i < 10; i++) {
    await nextTick()
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach((callback) => callback(i))
    await Promise.resolve()
  }
}
function fixture(realViewport = false) {
  const tracks = shallowRef([track(1), track(2), track(3)])
  const index = computed(() => createLibraryCatalogViewIndex(tracks.value, () => 300))
  const selected = ref<number | null>(null)
  const current = ref<number | null>(null)
  const menuOpen = ref(false)
  const editorOpen = ref(false)
  const container = Object.assign(new EventTarget(), {
    focus: vi.fn(),
    scrollTop: 0,
    clientHeight: 100,
    scrollHeight: 5000,
    isConnected: true,
  })
  const scrollRef = shallowRef(container as unknown as HTMLElement)
  let generation = 4
  const port = {
    scrollToTrackById: vi.fn<
      (trackId: number, isRequestCurrent?: () => boolean, startGeneration?: number) => Promise<void>
    >(async () => undefined),
    captureScrollGeneration: vi.fn(() => generation),
    isScrollInputCancelled: vi.fn((start: number) => generation !== start),
  }
  const scope = effectScope()
  const viewport = realViewport
    ? scope.run(() =>
        useLibraryViewport({
          tracks,
          scrollRef,
          derivedIndex: index,
          albumGroups: computed(() => index.value.albumGroups),
          virtualAlbumGroups: computed(() => []),
          isCoverView: ref(false),
          currentTrackId: () => current.value,
          selectedTrackId: () => selected.value,
          isDisposed: () => false,
        }),
      )!
    : port
  cleanups.push(() => {
    if ('dispose' in viewport) viewport.dispose()
    scope.stop()
  })
  const select = vi.fn()
  const play = vi.fn()
  const interactive = vi.fn(() => false)
  const group = vi.fn(
    (id: number) => index.value.albumGroups.find((g) => g.tracks.some((t) => t.id === id)) ?? null,
  )
  const session = useLibraryFocusSession({
    tracks,
    derivedIndex: index,
    scrollRef,
    viewport,
    selectedTrackId: () => selected.value,
    currentTrackId: () => current.value,
    getAlbumGroupByTrackId: group,
    isInteractiveTarget: interactive,
    isContextMenuOpen: () => menuOpen.value,
    isMetadataEditorOpen: () => editorOpen.value,
    selectTrack: select,
    playTrack: play,
  })
  function key(value: string, patch: Partial<KeyboardEvent> = {}) {
    const event = { key: value, preventDefault: vi.fn(), ...patch } as unknown as KeyboardEvent
    session.onListShellKeyDown(event)
    return event
  }
  return {
    ...session,
    tracks,
    selected,
    current,
    menuOpen,
    editorOpen,
    port,
    container,
    viewport,
    select,
    play,
    interactive,
    group,
    key,
    interrupt: () => generation++,
  }
}
beforeEach(() => {
  frames.clear()
  query.mockReset().mockReturnValue(null)
  const requestFrame = (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  }
  vi.stubGlobal('requestAnimationFrame', requestFrame)
  vi.stubGlobal('window', {
    requestAnimationFrame: requestFrame,
    cancelAnimationFrame: (id: number) => frames.delete(id),
  })
  vi.stubGlobal('document', { querySelector: query })
})
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
})

describe('useLibraryFocusSession', () => {
  it('does not read page callbacks or start effects during construction', () => {
    const f = fixture()
    expect(f.keyboardFocusTrackId.value).toBeNull()
    expect(f.port.scrollToTrackById).not.toHaveBeenCalled()
    expect(f.interactive).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
  })
  it('keeps valid keyboard focus ahead of selected/current tracks and reads replacement snapshots', () => {
    const f = fixture()
    f.selected.value = 2
    f.current.value = 3
    f.onRowFocus(1)
    expect(f.ensureKeyboardFocusTrackId()).toBe(1)
    f.tracks.value = [track(2), track(3)]
    expect(f.ensureKeyboardFocusTrackId()).toBe(2)
    f.selected.value = 99
    f.tracks.value = [track(3)]
    expect(f.ensureKeyboardFocusTrackId()).toBe(3)
    f.tracks.value = []
    expect(f.ensureKeyboardFocusTrackId()).toBeNull()
    expect(f.select).not.toHaveBeenCalled()
    expect(f.play).not.toHaveBeenCalled()
  })
  it.each([
    ['ArrowDown', 1, 2],
    ['ArrowUp', 3, 2],
    ['Home', 3, 1],
    ['End', 1, 3],
    ['ArrowUp', 1, 1],
    ['ArrowDown', 3, 3],
  ])(
    'moves/clamps %s from %i to %i, scrolls before DOM focus, and does not activate',
    async (key, from, to) => {
      const f = fixture()
      const row = element()
      query.mockReturnValue(row)
      f.onRowFocus(from)
      expect(f.key(key).preventDefault).toHaveBeenCalledOnce()
      expect(f.keyboardFocusTrackId.value).toBe(to)
      expect(f.port.scrollToTrackById).toHaveBeenCalledExactlyOnceWith(to)
      expect(row.focus).not.toHaveBeenCalled()
      await settle()
      expect(query).toHaveBeenCalledWith(`[data-track-id="${to}"]`)
      expect(row.focus).toHaveBeenCalledOnce()
      expect(f.select).not.toHaveBeenCalled()
      expect(f.play).not.toHaveBeenCalled()
    },
  )
  it.each(['prevented', 'composing', '229', 'interactive', 'menu', 'editor'])(
    'ignores shell keys for %s',
    async (condition) => {
      const f = fixture()
      const patch =
        condition === 'prevented'
          ? { defaultPrevented: true }
          : condition === 'composing'
            ? { isComposing: true }
            : condition === '229'
              ? { keyCode: 229 }
              : {}
      if (condition === 'interactive') f.interactive.mockReturnValue(true)
      if (condition === 'menu') f.menuOpen.value = true
      if (condition === 'editor') f.editorOpen.value = true
      for (const key of ['ArrowDown', ' ', 'Enter'])
        expect(f.key(key, patch).preventDefault).not.toHaveBeenCalled()
      await settle()
      expect(f.port.scrollToTrackById).not.toHaveBeenCalled()
      expect(f.select).not.toHaveBeenCalled()
      expect(f.play).not.toHaveBeenCalled()
    },
  )
  it('selects on Space and delegates Enter once using the live fallback ID', () => {
    const f = fixture()
    f.selected.value = 2
    expect(f.key(' ').preventDefault).toHaveBeenCalledOnce()
    expect(f.select).toHaveBeenCalledExactlyOnceWith(2)
    f.onRowFocus(3)
    expect(f.key('Enter').preventDefault).toHaveBeenCalledOnce()
    expect(f.play).toHaveBeenCalledExactlyOnceWith(3)
    expect(f.key('Escape').preventDefault).not.toHaveBeenCalled()
  })
  it('leaves keys and focus untouched for an empty list', async () => {
    const f = fixture()
    f.tracks.value = []
    f.key('ArrowDown')
    expect(f.key('Enter').preventDefault).not.toHaveBeenCalled()
    expect(f.key(' ').preventDefault).not.toHaveBeenCalled()
    await settle()
    expect(query).not.toHaveBeenCalled()
    expect(f.port.scrollToTrackById).not.toHaveBeenCalled()
  })
  it('ignores a null restore target', async () => {
    const f = fixture()
    await f.restoreLibraryFocus(null)
    expect(f.port.captureScrollGeneration).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })
  it('restores after scroll, nextTick and frame using the captured viewport generation', async () => {
    const f = fixture()
    const row = element()
    query.mockReturnValue(row)
    const restored = f.restoreLibraryFocus({ trackId: 2, source: 'track' })
    expect(f.keyboardFocusTrackId.value).toBe(2)
    expect(f.port.scrollToTrackById).toHaveBeenCalledExactlyOnceWith(2, undefined, 4)
    expect(row.focus).not.toHaveBeenCalled()
    await settle()
    await restored
    expect(f.port.isScrollInputCancelled).toHaveBeenCalledWith(4)
    expect(row.focus).toHaveBeenCalledWith(undefined)
  })
  it('skips scroll and scheduled work for pointer restoration and prevents browser scroll', async () => {
    const f = fixture()
    const row = element()
    query.mockReturnValue(row)
    const result = f.restoreLibraryFocus({ trackId: 2, source: 'track' }, false)
    expect(row.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(f.port.scrollToTrackById).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
    await result
  })
  it.each([
    [2, 3, 2],
    [99, 3, 3],
    [null, 99, 1],
  ])(
    'falls back from a removed target using selected=%s/current=%s to %i',
    async (selected, current, expected) => {
      const f = fixture()
      f.selected.value = selected
      f.current.value = current
      f.onRowFocus(3)
      await f.restoreLibraryFocus({ trackId: 99, source: 'album-artwork' }, false)
      expect(f.keyboardFocusTrackId.value).toBe(expected)
      expect(query).toHaveBeenCalledExactlyOnceWith(`[data-track-id="${expected}"]`)
      expect(f.group).not.toHaveBeenCalled()
    },
  )
  it('focuses the empty container without replacing the existing focus ID', async () => {
    const f = fixture()
    f.onRowFocus(2)
    f.tracks.value = []
    await f.restoreLibraryFocus({ trackId: 2, source: 'track' })
    expect(f.container.focus).toHaveBeenCalledWith()
    expect(f.keyboardFocusTrackId.value).toBe(2)
    expect(f.port.scrollToTrackById).not.toHaveBeenCalled()
  })
  it('prefers the album artwork for its first track', async () => {
    const f = fixture()
    const artwork = element()
    query.mockImplementation((selector) =>
      selector.includes('data-first-track-id') ? artwork : null,
    )
    await f.restoreLibraryFocus({ trackId: 1, source: 'album-artwork' }, false)
    expect(query).toHaveBeenCalledExactlyOnceWith('[data-first-track-id="1"] .album-cover-artwork')
    expect(artwork.focus).toHaveBeenCalledWith({ preventScroll: true })
  })
  it('finds artwork by stable album key for a non-first track before trying the row', async () => {
    const f = fixture()
    const artwork = element()
    const albumKey = f.group(2)!.key
    query.mockImplementation((selector) =>
      selector === `[data-album-key="${albumKey}"] .album-cover-artwork` ? artwork : null,
    )
    await f.restoreLibraryFocus({ trackId: 2, source: 'album-artwork' }, false)
    expect(query.mock.calls.map(([selector]) => selector)).toEqual([
      '[data-first-track-id="2"] .album-cover-artwork',
      `[data-album-key="${albumKey}"] .album-cover-artwork`,
    ])
    expect(artwork.focus).toHaveBeenCalledOnce()
  })
  it('falls back to the track then container when artwork is absent', async () => {
    const f = fixture()
    const row = element()
    query.mockImplementation((selector) => (selector === '[data-track-id="2"]' ? row : null))
    await f.restoreLibraryFocus({ trackId: 2, source: 'album-artwork' }, false)
    expect(row.focus).toHaveBeenCalledOnce()
    query.mockReturnValue(null)
    await f.restoreLibraryFocus({ trackId: 2, source: 'track' }, false)
    expect(f.container.focus).toHaveBeenCalledWith({ preventScroll: true })
  })
  it('does not focus after user input invalidates a scrolling restore', async () => {
    const f = fixture()
    const restored = f.restoreLibraryFocus({ trackId: 2, source: 'track' })
    f.interrupt()
    await settle()
    await restored
    expect(query).not.toHaveBeenCalled()
    expect(f.container.focus).not.toHaveBeenCalled()
  })
  it('consumes the pending view-switch return target once, before asynchronous restore completes', async () => {
    const f = fixture()
    f.setViewSwitchReturnTarget({ trackId: 2, source: 'album-artwork' })
    f.onViewSwitchComplete(1)
    f.onViewSwitchComplete(3)
    expect(f.port.scrollToTrackById.mock.calls.map(([id]) => id)).toEqual([2, 3])
    await settle()
    expect(
      query.mock.calls.some(
        ([selector]) => selector === '[data-first-track-id="2"] .album-cover-artwork',
      ),
    ).toBe(true)
    expect(query.mock.calls.some(([selector]) => selector === '[data-track-id="3"]')).toBe(true)
  })
  it('shares real viewport cancellation when wheel input arrives between scroll and focus', async () => {
    const f = fixture(true)
    const restored = f.restoreLibraryFocus({ trackId: 3, source: 'track' })
    await nextTick()
    f.container.dispatchEvent(new Event('wheel'))
    await settle()
    await restored
    expect(f.container.scrollTop).toBe(0)
    expect(query).not.toHaveBeenCalled()
    expect(f.container.focus).not.toHaveBeenCalled()
  })
})
