import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import type { LibraryAlbumGroup } from '../types/libraryAlbumGroup'
import { useLibraryContextMenu } from './useLibraryContextMenu'

function createTrack(id: number, title = `Track ${id}`): TrackListItem {
  return {
    id,
    title,
    artist: null,
    album: `Album ${id}`,
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

function createPlaylist(id: number, name = `List ${id}`): SidebarPlaylistItem {
  return {
    kind: 'playlist',
    id,
    name,
    viewMode: 'flat',
    sortOrder: 0,
    trackCount: 0,
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  }
}

function createMouseEvent(clientX = 12, clientY = 34): MouseEvent {
  return { clientX, clientY } as MouseEvent
}

function createMenu() {
  const tracks = [createTrack(1), createTrack(2), createTrack(3)]
  const group: LibraryAlbumGroup = {
    key: 'album',
    album: 'Album 1',
    albumArtist: 'Artist',
    releaseDate: null,
    artworkCacheKey: null,
    tracks: [tracks[0], tracks[1]],
    firstTrackIndex: 0,
  }
  const selectTrack = vi.fn()
  const playTrackFromQueue = vi.fn(async () => undefined)
  const insertTrackAfterCurrent = vi.fn()
  const insertTracksAfterCurrent = vi.fn()
  const scrollToTrackById = vi.fn(async () => undefined)
  const openMetadataEditor = vi.fn(async () => undefined)
  const setMetadataReturnTarget = vi.fn()
  const setViewSwitchReturnTarget = vi.fn()
  const restoreFocus = vi.fn(async () => undefined)
  const onTrackActivated = vi.fn()
  const listSidebarItems = vi.fn(async () => [
    createPlaylist(9),
    { ...createPlaylist(8), kind: 'smart' as const },
  ])
  const createPlaylistApi = vi.fn(async () => ({ id: 11, name: 'New' }))
  const addTracksToPlaylist = vi.fn(async () => undefined)
  const getLibraryRoots = vi.fn(async () => [{ id: 4 }])
  const startLibraryScan = vi.fn(async () => undefined)
  const dispatchEvent = vi.fn()

  vi.stubGlobal(
    'CustomEvent',
    class CustomEvent<T = unknown> {
      readonly type: string
      readonly detail: T | undefined
      constructor(type: string, init?: { detail?: T }) {
        this.type = type
        this.detail = init?.detail
      }
    },
  )
  vi.stubGlobal('window', {
    clearTimeout,
    setTimeout,
    dispatchEvent,
  })

  const menu = useLibraryContextMenu({
    tracks: { value: tracks },
    isScopedPlaylist: () => false,
    getTrackById: (id) => tracks.find((track) => track.id === id) ?? null,
    getAlbumGroupByTrackId: (id) => (id === 1 || id === 2 ? group : null),
    currentTrackId: () => 2,
    onTrackActivated,
    playTrackFromQueue,
    insertTrackAfterCurrent,
    insertTracksAfterCurrent,
    scrollToTrackById,
    openMetadataEditor,
    setMetadataReturnTarget,
    setViewSwitchReturnTarget,
    restoreFocus,
    t: (key, values) => (values ? `${key}:${JSON.stringify(values)}` : key),
    listSidebarItems,
    createPlaylist: createPlaylistApi,
    addTracksToPlaylist,
    getLibraryRoots,
    startLibraryScan,
  })

  return {
    menu,
    tracks,
    group,
    selectTrack,
    playTrackFromQueue,
    insertTrackAfterCurrent,
    insertTracksAfterCurrent,
    scrollToTrackById,
    openMetadataEditor,
    setMetadataReturnTarget,
    setViewSwitchReturnTarget,
    restoreFocus,
    onTrackActivated,
    listSidebarItems,
    addTracksToPlaylist,
    startLibraryScan,
    dispatchEvent,
  }
}

describe('useLibraryContextMenu', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('opens a track menu and loads regular playlists', async () => {
    const { menu, onTrackActivated, listSidebarItems } = createMenu()

    menu.onOpenContextMenu(1, createMouseEvent(), 'track', 'keyboard')
    await Promise.resolve()

    expect(onTrackActivated).toHaveBeenCalledWith(1)
    expect(menu.contextMenu.value?.trackId).toBe(1)
    expect(menu.contextMenuAnchor.value.openReason).toBe('keyboard')
    expect(listSidebarItems).toHaveBeenCalledOnce()
    expect(menu.regularPlaylistItems.value).toEqual([
      expect.objectContaining({ id: 9, kind: 'playlist' }),
    ])
  })

  it('restores focus when closing a keyboard menu, without metadata or view-switch handoff', () => {
    const { menu, restoreFocus, setMetadataReturnTarget, setViewSwitchReturnTarget } = createMenu()
    menu.onOpenContextMenu(1, createMouseEvent(), 'track', 'keyboard')

    menu.closeContextMenu()

    expect(menu.contextMenu.value).toBeNull()
    expect(restoreFocus).toHaveBeenCalledWith(
      { trackId: 1, source: 'track', openReason: 'keyboard' },
      true,
    )
    expect(setMetadataReturnTarget).not.toHaveBeenCalled()
    expect(setViewSwitchReturnTarget).not.toHaveBeenCalled()
  })

  it('hands the return target to metadata or view-switch without restoring focus', () => {
    const { menu, restoreFocus, setMetadataReturnTarget, setViewSwitchReturnTarget } = createMenu()
    menu.onOpenContextMenu(1, createMouseEvent(), 'album-artwork', 'pointer')
    menu.closeContextMenu('metadata-dialog')
    expect(setMetadataReturnTarget).toHaveBeenCalledWith({
      trackId: 1,
      source: 'album-artwork',
      openReason: 'pointer',
    })
    expect(restoreFocus).not.toHaveBeenCalled()

    menu.onOpenContextMenu(1, createMouseEvent(), 'track', 'keyboard')
    menu.closeContextMenu('view-switch')
    expect(setViewSwitchReturnTarget).toHaveBeenCalledWith({
      trackId: 1,
      source: 'track',
      openReason: 'keyboard',
    })
    expect(restoreFocus).not.toHaveBeenCalled()
  })

  it('plays the album queue when the artwork menu is used', async () => {
    const { menu, playTrackFromQueue, group } = createMenu()
    menu.onOpenContextMenu(1, createMouseEvent(), 'album-artwork')
    await menu.onContextMenuPlay()

    expect(playTrackFromQueue).toHaveBeenCalledWith(group.tracks, 1, { shufflePool: undefined })
    expect(menu.contextMenu.value).toBeNull()
  })

  it('adds context tracks to a playlist and closes after the feedback timer', async () => {
    const { menu, addTracksToPlaylist, dispatchEvent } = createMenu()
    menu.onOpenContextMenu(1, createMouseEvent(), 'track')
    await menu.onAddContextTracksToPlaylist(createPlaylist(9, 'Night'))

    expect(addTracksToPlaylist).toHaveBeenCalledWith(9, [1])
    expect(dispatchEvent).toHaveBeenCalled()
    expect(menu.addToPlaylistFeedback.value?.playlistId).toBe(9)

    vi.advanceTimersByTime(1200)
    expect(menu.contextMenu.value).toBeNull()
  })

  it('starts a library scan from the first root', async () => {
    const { menu, startLibraryScan } = createMenu()
    menu.onOpenContextMenu(1, createMouseEvent())
    await menu.onRefreshLibrary()

    expect(startLibraryScan).toHaveBeenCalledWith(4)
    expect(menu.contextMenu.value).toBeNull()
    expect(menu.isStartingLibraryRefresh.value).toBe(false)
  })
})
