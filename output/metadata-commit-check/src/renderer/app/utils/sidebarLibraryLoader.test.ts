import { createRenderer, defineComponent, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import type {
  SmartPlaylist,
  SmartPlaylistRule,
  SmartPlaylistTrackCount,
} from '@shared/types/smartPlaylist'
import { createSidebarLibraryLoader } from './sidebarLibraryLoader'
import { useSidebarPlaylistReorder } from './useSidebarPlaylistReorder'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}
function smart(id: number, rule: SmartPlaylistRule): SmartPlaylist {
  return {
    id,
    rule,
    name: `Smart ${id}`,
    viewMode: 'flat',
    sortOrder: id,
    createdAt: '',
    updatedAt: '',
  }
}
function item(
  id: number,
  kind: SidebarPlaylistItem['kind'] = 'smart',
  trackCount = 0,
): SidebarPlaylistItem {
  return { ...smart(id, { preset: 'mostListened' }), kind, trackCount }
}
function fixture(initialSmart = [smart(1, { preset: 'mostListened' })]) {
  const playlistItems = ref<SidebarPlaylistItem[]>([item(1)])
  const smartPlaylists = ref(initialSmart)
  const libraryStats = ref({ trackCount: 8, albumCount: 2 })
  const listSidebarItems = vi.fn(async () => [item(1)])
  const listSmartPlaylists = vi.fn(async () => initialSmart)
  const listSmartTrackCounts = vi.fn(
    async (): Promise<SmartPlaylistTrackCount[]> => [{ playlistId: 1, trackCount: 1 }],
  )
  const getStats = vi.fn(async () => ({ trackCount: 8, albumCount: 2 }))
  const loader = createSidebarLibraryLoader({
    playlistItems,
    smartPlaylists,
    libraryStats,
    listSidebarItems,
    listSmartPlaylists,
    listSmartTrackCounts,
    getStats,
  })
  return {
    loader,
    playlistItems,
    smartPlaylists,
    libraryStats,
    listSidebarItems,
    listSmartPlaylists,
    listSmartTrackCounts,
    getStats,
  }
}

describe('sidebarLibraryLoader', () => {
  it('refreshes only statistics consumers, including clearing counts, without reloading sidebar or library totals', async () => {
    const f = fixture([
      smart(1, { preset: 'recentPlayed', days: 7 }),
      smart(2, { preset: 'mostListened' }),
      smart(3, { preset: 'recentFrequent', days: 7 }),
      smart(4, { preset: 'recentAdded', days: 7 }),
      smart(5, { conditions: [{ field: 'genre', value: 'Rock' }] }),
    ])
    f.playlistItems.value = [
      item(6, 'playlist', 6),
      ...[1, 2, 3, 4, 5].map((id) => item(id, 'smart', id)),
    ]
    f.listSmartTrackCounts.mockResolvedValue(
      [1, 2, 3, 4, 5].map((playlistId) => ({ playlistId, trackCount: 0 })),
    )
    await f.loader.refreshPlayStats()
    expect(f.playlistItems.value.map((entry) => entry.trackCount)).toEqual([6, 0, 0, 0, 4, 5])
    expect(f.getStats).not.toHaveBeenCalled()
    expect(f.listSidebarItems).not.toHaveBeenCalled()
    expect(f.listSmartPlaylists).not.toHaveBeenCalled()
    f.loader.dispose()
  })

  it('does not query counts when no smart rule consumes playback statistics', async () => {
    const f = fixture([smart(1, { preset: 'recentAdded', days: 7 })])
    await f.loader.refreshPlayStats()
    expect(f.listSmartTrackCounts).not.toHaveBeenCalled()
    f.loader.dispose()
  })

  it('coalesces in-flight events and discards counts captured before reset', async () => {
    const f = fixture()
    const gate = deferred<SmartPlaylistTrackCount[]>()
    f.listSmartTrackCounts
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValue([{ playlistId: 1, trackCount: 0 }])
    const pending = f.loader.refreshPlayStats()
    void f.loader.refreshPlayStats()
    void f.loader.refreshPlayStats()
    gate.resolve([{ playlistId: 1, trackCount: 4 }])
    await pending
    expect(f.playlistItems.value[0].trackCount).toBe(0)
    expect(f.listSmartTrackCounts).toHaveBeenCalledTimes(2)
    f.loader.dispose()
  })

  it('keeps a final reset event arriving after count commit but before task cleanup', async () => {
    const f = fixture()
    const gate = deferred<SmartPlaylistTrackCount[]>()
    f.listSmartTrackCounts
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValue([{ playlistId: 1, trackCount: 0 }])
    const first = f.loader.refreshPlayStats()
    gate.resolve([{ playlistId: 1, trackCount: 1 }])
    await Promise.resolve()
    expect(f.playlistItems.value[0].trackCount).toBe(1)
    const reset = f.loader.refreshPlayStats()
    await Promise.all([first, reset])
    expect(f.playlistItems.value[0].trackCount).toBe(0)
    expect(f.listSmartTrackCounts).toHaveBeenCalledTimes(2)
    f.loader.dispose()
  })

  it('merges an asynchronous count result into current order and preserves additions, deletion and metadata', async () => {
    const f = fixture([smart(1, { preset: 'mostListened' }), smart(2, { preset: 'mostListened' })])
    const gate = deferred<SmartPlaylistTrackCount[]>()
    f.playlistItems.value = [item(1), item(2), item(3, 'playlist')]
    f.listSmartTrackCounts.mockImplementation(() => gate.promise)
    const pending = f.loader.refreshPlayStats()
    f.playlistItems.value = [
      item(3, 'playlist'),
      { ...item(2), name: 'Renamed', sortOrder: 0 },
      item(4, 'playlist'),
    ]
    gate.resolve([
      { playlistId: 1, trackCount: 99 },
      { playlistId: 2, trackCount: 2 },
    ])
    await pending
    expect(f.playlistItems.value.map((entry) => entry.id)).toEqual([3, 2, 4])
    expect(f.playlistItems.value[1]).toMatchObject({ name: 'Renamed', sortOrder: 0, trackCount: 2 })
    f.loader.dispose()
  })

  it('reconciles a statistics event while initial playlist rules are loading', async () => {
    const f = fixture([])
    f.playlistItems.value = []
    const gate = deferred<SidebarPlaylistItem[]>()
    f.listSidebarItems.mockImplementation(() => gate.promise)
    f.listSmartPlaylists.mockResolvedValue([smart(1, { preset: 'mostListened' })])
    const loading = f.loader.loadStats()
    await f.loader.refreshPlayStats()
    expect(f.listSmartTrackCounts).not.toHaveBeenCalled()
    gate.resolve([item(1)])
    await loading
    expect(f.playlistItems.value[0].trackCount).toBe(1)
    expect(f.listSmartTrackCounts).toHaveBeenCalledOnce()
    f.loader.dispose()
  })

  it('keeps newer counts when an older full list resolves after a playback event', async () => {
    const f = fixture()
    const gate = deferred<SidebarPlaylistItem[]>()
    f.listSidebarItems.mockImplementation(() => gate.promise)
    const loading = f.loader.loadStats()
    await f.loader.refreshPlayStats()
    expect(f.playlistItems.value[0].trackCount).toBe(1)
    gate.resolve([item(1, 'smart', 0)])
    await loading
    expect(f.playlistItems.value[0].trackCount).toBe(1)
    f.loader.dispose()
  })

  it('does not overwrite a reorder or deletion with an older full-list response', async () => {
    const f = fixture()
    const gate = deferred<SidebarPlaylistItem[]>()
    f.listSidebarItems.mockImplementation(() => gate.promise)
    const loading = f.loader.loadStats()
    f.playlistItems.value = [item(3, 'playlist'), item(1)]
    gate.resolve([item(1), item(2, 'playlist')])
    await loading
    expect(f.playlistItems.value.map((entry) => entry.id)).toEqual([3, 1])
    f.loader.dispose()
  })

  it('reconciles counts updated during the real reorder save without restoring old counts or order', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
    const f = fixture()
    f.playlistItems.value = [item(1), item(2, 'playlist')]
    const counts = deferred<SmartPlaylistTrackCount[]>()
    const saved = deferred<SidebarPlaylistItem[]>()
    f.listSmartTrackCounts.mockImplementation(() => counts.promise)
    f.listSidebarItems.mockResolvedValue([item(2, 'playlist'), item(1, 'smart', 7)])
    let reorder!: ReturnType<typeof useSidebarPlaylistReorder>
    const renderer = createRenderer({
      patchProp: () => undefined,
      insert: () => undefined,
      remove: () => undefined,
      createElement: () => ({}),
      createText: () => ({}),
      createComment: () => ({}),
      setText: () => undefined,
      setElementText: () => undefined,
      parentNode: () => null,
      nextSibling: () => null,
    })
    const app = renderer.createApp(
      defineComponent({
        setup() {
          reorder = useSidebarPlaylistReorder({
            playlistItems: f.playlistItems,
            persistOrder: () => saved.promise,
            reload: () => f.loader.loadPlaylists(),
          })
          return () => null
        },
      }),
    )
    try {
      app.mount({})
      const refreshing = f.loader.refreshPlayStats()
      reorder.move(f.playlistItems.value[0], 1)
      counts.resolve([{ playlistId: 1, trackCount: 7 }])
      await refreshing
      // The server's reorder result may have captured its counts before the
      // playback event. The real reorder coordinator must reconcile that result.
      saved.resolve([item(2, 'playlist'), item(1, 'smart', 0)])
      await vi.waitFor(() => expect(reorder.isSaving.value).toBe(false))
      expect(f.playlistItems.value.map((entry) => [entry.id, entry.trackCount])).toEqual([
        [2, 0],
        [1, 7],
      ])
      expect(f.listSidebarItems).toHaveBeenCalledOnce()
    } finally {
      app.unmount()
      f.loader.dispose()
      vi.unstubAllGlobals()
    }
  })

  it('rejects an older full refresh after a newer collection load', async () => {
    const f = fixture()
    const gate = deferred<SidebarPlaylistItem[]>()
    f.listSidebarItems.mockImplementationOnce(() => gate.promise).mockResolvedValue([item(2)])
    const older = f.loader.loadStats()
    await f.loader.loadPlaylists()
    gate.resolve([item(1)])
    await older
    expect(f.playlistItems.value.map((entry) => entry.id)).toEqual([2])
    f.loader.dispose()
  })

  it.each(['counts', 'list'])(
    'cannot commit an asynchronous %s result after disposal',
    async (kind) => {
      const f = fixture()
      const counts = deferred<SmartPlaylistTrackCount[]>()
      const items = deferred<SidebarPlaylistItem[]>()
      f.listSmartTrackCounts.mockImplementation(() => counts.promise)
      f.listSidebarItems.mockImplementation(() => items.promise)
      const loading = kind === 'counts' ? f.loader.refreshPlayStats() : f.loader.loadStats()
      f.loader.dispose()
      counts.resolve([{ playlistId: 1, trackCount: 10 }])
      items.resolve([item(3)])
      await loading
      expect(f.playlistItems.value).toEqual([item(1)])
    },
  )
})
