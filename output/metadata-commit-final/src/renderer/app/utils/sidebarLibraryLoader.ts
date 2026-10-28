import { watch, type Ref } from 'vue'
import type { LibraryStats } from '@shared/types/app'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import type { SmartPlaylist, SmartPlaylistTrackCount } from '@shared/types/smartPlaylist'

function usesPlayStats(playlist: SmartPlaylist): boolean {
  if (!('preset' in playlist.rule)) return false
  return ['recentPlayed', 'mostListened', 'recentFrequent'].includes(playlist.rule.preset)
}

export function createSidebarLibraryLoader(options: {
  playlistItems: Ref<SidebarPlaylistItem[]>
  smartPlaylists: Ref<SmartPlaylist[]>
  libraryStats: Ref<LibraryStats>
  getStats: () => Promise<LibraryStats>
  listSidebarItems: () => Promise<SidebarPlaylistItem[]>
  listSmartPlaylists: () => Promise<SmartPlaylist[]>
  listSmartTrackCounts: () => Promise<SmartPlaylistTrackCount[]>
}) {
  let disposed = false
  let assigning = false
  let itemsRevision = 0
  let loadGeneration = 0
  let statsRevision = 0
  let appliedStatsRevision = -1
  let appliedCountsGeneration = -1
  let countsTask: Promise<void> | null = null
  const stopWatching = watch(
    options.playlistItems,
    () => {
      if (!assigning) itemsRevision += 1
    },
    { flush: 'sync' },
  )

  function assignItems(items: SidebarPlaylistItem[]): void {
    assigning = true
    try {
      options.playlistItems.value = items
    } finally {
      assigning = false
    }
  }

  function statisticsPlaylistIds(): Set<number> {
    return new Set(
      options.smartPlaylists.value.filter(usesPlayStats).map((playlist) => playlist.id),
    )
  }

  function refreshCounts(): Promise<void> {
    if (disposed || statisticsPlaylistIds().size === 0) return Promise.resolve()
    if (countsTask) {
      return countsTask.then(() => {
        // An event can arrive after the pump commits, before its finally clears
        // the task. Keep that last event instead of joining an already-done load.
        if (statsRevision !== appliedStatsRevision || loadGeneration !== appliedCountsGeneration) {
          return refreshCounts()
        }
        return undefined
      })
    }
    countsTask = (async () => {
      while (!disposed && statisticsPlaylistIds().size > 0) {
        const revision = statsRevision
        const generation = loadGeneration
        const counts = await options.listSmartTrackCounts()
        if (disposed) return
        // A newer event or collection load supersedes this response. Coalesce
        // all events that arrived in flight into one more count query.
        if (revision !== statsRevision || generation !== loadGeneration) continue
        const ids = statisticsPlaylistIds()
        const byId = new Map(counts.map((count) => [count.playlistId, count.trackCount]))
        let changed = false
        const items = options.playlistItems.value.map((item) => {
          const count = item.kind === 'smart' && ids.has(item.id) ? byId.get(item.id) : undefined
          if (count === undefined || count === item.trackCount) return item
          changed = true
          return { ...item, trackCount: count }
        })
        // Merge into the current order, including an optimistic reorder or a
        // collection edit that happened while the query was in flight.
        if (changed) assignItems(items)
        appliedStatsRevision = revision
        appliedCountsGeneration = generation
        return
      }
    })().finally(() => {
      countsTask = null
    })
    return countsTask
  }

  async function load(includeStats: boolean): Promise<void> {
    if (disposed) return
    const generation = ++loadGeneration
    const revision = itemsRevision
    const statistics = statsRevision
    const [items, smart, stats] = await Promise.all([
      options.listSidebarItems(),
      options.listSmartPlaylists(),
      includeStats ? options.getStats() : Promise.resolve(null),
    ])
    if (disposed || generation !== loadGeneration) return
    if (stats) options.libraryStats.value = stats
    // Reordering/deleting has its own authoritative result and reconciliation.
    // A list query started before that mutation must not restore its old order.
    if (revision !== itemsRevision) return
    options.smartPlaylists.value = smart
    if (statistics === statsRevision) {
      assignItems(items)
    } else {
      const ids = statisticsPlaylistIds()
      const currentCounts = new Map(
        options.playlistItems.value
          .filter((item) => item.kind === 'smart')
          .map((item) => [item.id, item.trackCount]),
      )
      assignItems(
        items.map((item) =>
          item.kind === 'smart' && ids.has(item.id)
            ? { ...item, trackCount: currentCounts.get(item.id) ?? 0 }
            : item,
        ),
      )
      await refreshCounts()
    }
  }

  return {
    loadPlaylists: () => load(false),
    loadStats: () => load(true),
    refreshPlayStats: () => {
      statsRevision += 1
      return refreshCounts()
    },
    dispose: () => {
      disposed = true
      loadGeneration += 1
      stopWatching()
    },
  }
}
