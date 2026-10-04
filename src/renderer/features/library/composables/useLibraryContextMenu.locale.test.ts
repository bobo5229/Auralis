import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { i18n } from '@renderer/i18n'
import { useLibraryContextMenu } from './useLibraryContextMenu'

afterEach(() => {
  i18n.global.locale.value = 'zh-Hans'
  vi.unstubAllGlobals()
})
describe('localized library menu feedback', () => {
  it('refreshes open errors and success feedback while preserving the user playlist name and operations', async () => {
    vi.stubGlobal('window', { dispatchEvent: vi.fn(), setTimeout, clearTimeout })
    vi.stubGlobal(
      'CustomEvent',
      class {
        constructor(public type: string) {}
      },
    )
    const addTracksToPlaylist = vi.fn(async () => undefined)
    const options: Parameters<typeof useLibraryContextMenu>[0] = {
      tracks: ref([]),
      isScopedPlaylist: () => false,
      getTrackById: () => null,
      getAlbumGroupByTrackId: () => null,
      currentTrackId: () => null,
      selectedTrackId: () => null,
      onTrackActivated: vi.fn(),
      playTrackFromQueue: vi.fn(),
      insertTrackAfterCurrent: vi.fn(),
      insertTracksAfterCurrent: vi.fn(),
      scrollToTrackById: async () => undefined,
      openMetadataEditor: vi.fn(),
      setMetadataReturnTarget: vi.fn(),
      setViewSwitchReturnTarget: vi.fn(),
      restoreFocus: async () => undefined,
      t: (key, values) => i18n.global.t(key, values ?? {}),
      listSidebarItems: async () => {
        throw new Error('raw IPC error')
      },
      createPlaylist: async () => ({ id: 1, name: '夜航 / My collection' }),
      addTracksToPlaylist,
    }
    const state = useLibraryContextMenu(options)
    await state.loadRegularPlaylistItems()
    expect(state.playlistLoadError.value).toBe('加载歌单失败')
    state.onOpenContextMenu(42, { clientX: 0, clientY: 0 } as MouseEvent)
    await state.onCreatePlaylistAndAddContextTracks()
    expect(state.addToPlaylistFeedback.value?.message).toBe('已添加到「夜航 / My collection」')
    i18n.global.locale.value = 'en'
    expect(state.playlistLoadError.value).toBe('Could not load playlists. Try again.')
    expect(state.addToPlaylistFeedback.value?.message).toBe('Added to 夜航 / My collection')
    expect(addTracksToPlaylist).toHaveBeenCalledExactlyOnceWith(1, [42])
    state.dispose()
  })
})
