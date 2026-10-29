import { computed, onBeforeUnmount, onMounted, readonly, ref } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { LibraryStats } from '@shared/types/app'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import {
  createSidebarPlaylistCollection,
  type SidebarPlaylistOrder,
} from '../utils/sidebarPlaylistCollection'
import type { SmartPlaylist } from '@shared/types/smartPlaylist'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { createSidebarLibraryLoader } from '../utils/sidebarLibraryLoader'

type SidebarLibraryApi = {
  library: Pick<AuralisApi['library'], 'getStats' | 'onChanged'>
  playlists: Pick<AuralisApi['playlists'], 'listSidebarItems' | 'onChanged'>
  smartPlaylists: Pick<AuralisApi['smartPlaylists'], 'list' | 'listTrackCounts'>
}

export function useSidebarLibraryData(auralis: SidebarLibraryApi) {
  const playlists = createSidebarPlaylistCollection()
  const playlistOrder: SidebarPlaylistOrder = playlists
  const smartPlaylists = ref<SmartPlaylist[]>([])
  const smartPlaylistKinds = computed(
    () =>
      new Map(
        smartPlaylists.value.map((playlist) => [
          playlist.id,
          'preset' in playlist.rule ? playlist.rule.preset : 'custom',
        ]),
      ),
  )
  const libraryStats = ref<LibraryStats>({ trackCount: 0, albumCount: 0 })
  const sidebarLibraryLoader = createSidebarLibraryLoader({
    playlists,
    smartPlaylists,
    libraryStats,
    getStats: () => auralis.library.getStats(),
    listSidebarItems: () => auralis.playlists.listSidebarItems(),
    listSmartPlaylists: () => auralis.smartPlaylists.list(),
    listSmartTrackCounts: () => auralis.smartPlaylists.listTrackCounts(),
  })
  let unsubscribePlaylistsChanged: (() => void) | null = null
  let unsubscribeLibraryChanged: (() => void) | null = null
  async function loadSidebarPlaylists(): Promise<void> {
    await sidebarLibraryLoader.loadPlaylists()
  }
  async function loadSidebarStats(): Promise<void> {
    await sidebarLibraryLoader.loadStats()
  }
  function getPlaylistIcon(
    item: SidebarPlaylistItem,
  ): 'playlist' | 'recentPlayed' | 'mostListened' | 'recentAdded' | 'custom' {
    if (item.kind === 'playlist') return 'playlist'
    const kind = smartPlaylistKinds.value.get(item.id)
    return kind === 'recentPlayed' || kind === 'mostListened' || kind === 'recentAdded'
      ? kind
      : 'custom'
  }
  onMounted(() => {
    void loadSidebarStats()
    unsubscribeLibraryChanged = auralis.library.onChanged((event) => {
      if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') {
        void sidebarLibraryLoader.refreshPlayStats().catch((cause: unknown) => {
          rendererDiagnostics.error({
            scope: 'sidebar.playlist',
            message: 'Failed to refresh playback playlist counts',
            cause,
          })
        })
        return
      }
      void loadSidebarStats()
    })
    unsubscribePlaylistsChanged = auralis.playlists.onChanged((event) => {
      if (event.reason === 'view-mode-updated' || event.reason === 'reordered') return
      void loadSidebarStats()
    })
  })
  onBeforeUnmount(() => {
    sidebarLibraryLoader.dispose()
    playlists.dispose()
    unsubscribeLibraryChanged?.()
    unsubscribeLibraryChanged = null
    unsubscribePlaylistsChanged?.()
    unsubscribePlaylistsChanged = null
  })
  return {
    playlistItems: playlists.items,
    playlistOrder,
    removePlaylist: playlists.remove,
    libraryStats: readonly(libraryStats),
    loadSidebarPlaylists,
    getPlaylistIcon,
  }
}
