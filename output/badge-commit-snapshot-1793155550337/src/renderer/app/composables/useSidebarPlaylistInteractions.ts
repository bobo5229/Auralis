import type { AuralisApi } from '@shared/ipc/api'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import type { PlaybackPublicApi } from '@renderer/features/playback/composables/usePlayback'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

interface SidebarPlaylistInteractionsOptions {
  api: {
    playlists: Pick<AuralisApi['playlists'], 'getDetail'>
    smartPlaylists: Pick<AuralisApi['smartPlaylists'], 'getDetail'>
  }
  playback: Pick<PlaybackPublicApi, 'playTrackFromQueue' | 'clearError'>
  shouldSuppressClick: (event: MouseEvent) => boolean
  setPendingActive: (path: string) => void
  cancelPlaylistReorder: (immediate?: boolean) => void
  movePlaylist: (item: SidebarPlaylistItem, direction: -1 | 1) => void
  openPlaylistContextMenu: (item: SidebarPlaylistItem, event: MouseEvent) => void
  getPlaylistPath: (item: SidebarPlaylistItem) => string
}

export function useSidebarPlaylistInteractions({
  api: auralis,
  playback,
  shouldSuppressClick,
  setPendingActive,
  cancelPlaylistReorder,
  movePlaylist,
  openPlaylistContextMenu,
  getPlaylistPath,
}: SidebarPlaylistInteractionsOptions) {
  function onPlaylistClick(event: MouseEvent, path: string): void {
    if (shouldSuppressClick(event)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    setPendingActive(path)
  }
  async function playRandomPlaylistTrack(item: SidebarPlaylistItem): Promise<void> {
    try {
      const detail =
        item.kind === 'playlist'
          ? await auralis.playlists.getDetail(item.id)
          : await auralis.smartPlaylists.getDetail(item.id)
      const tracks = detail?.tracks ?? []
      if (tracks.length === 0) return

      const track = tracks[Math.floor(Math.random() * tracks.length)]
      await playback.playTrackFromQueue(tracks, track.id, { shufflePool: tracks })
    } catch (error) {
      // 播放错误无 UI 消费方，仅打日志（原始 message 不直出，避免英文混排）。
      rendererDiagnostics.error({
        scope: 'sidebar.playlist',
        message: 'Failed to play a random playlist track',
        cause: error,
      })
      playback.clearError()
    }
  }
  function onPlaylistDoubleClick(item: SidebarPlaylistItem, event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    if (shouldSuppressClick(event)) return
    void playRandomPlaylistTrack(item)
  }
  function onPlaylistKeydown(item: SidebarPlaylistItem, event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
    if (
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown')
    ) {
      event.preventDefault()
      event.stopPropagation()
      cancelPlaylistReorder(true)
      movePlaylist(item, event.key === 'ArrowUp' ? -1 : 1)
    } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault()
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      openPlaylistContextMenu(
        item,
        new MouseEvent('contextmenu', {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }),
      )
    } else if (event.key === 'Enter') setPendingActive(getPlaylistPath(item))
  }
  return { onPlaylistClick, onPlaylistDoubleClick, onPlaylistKeydown }
}
