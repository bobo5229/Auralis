import type { PlaybackMode } from '@renderer/features/playback/types'
import type { TrackListItem } from '@shared/types/libraryScan'

export type CdPlaybackMode = 'catalog-sequential' | 'repeat-all' | 'shuffle' | 'sequential'

export const CD_PLAYBACK_MODES: readonly CdPlaybackMode[] = [
  'catalog-sequential',
  'repeat-all',
  'shuffle',
  'sequential',
] as const

export function getNextCdPlaybackMode(current: CdPlaybackMode): CdPlaybackMode {
  const index = CD_PLAYBACK_MODES.indexOf(current)
  if (index === -1) return 'catalog-sequential'
  return CD_PLAYBACK_MODES[(index + 1) % CD_PLAYBACK_MODES.length]
}

export interface CdPlaybackPlan {
  queue: TrackListItem[]
  playbackMode: PlaybackMode
  shufflePool?: TrackListItem[]
  shuffleCycle?: boolean
}

export function buildCdPlaybackPlan(
  albums: { tracks: TrackListItem[] }[],
  trackId: number,
  mode: CdPlaybackMode,
): CdPlaybackPlan | null {
  const albumIndex = albums.findIndex((album) => album.tracks.some((track) => track.id === trackId))
  if (albumIndex === -1) {
    return null
  }
  const currentAlbum = albums[albumIndex]

  if (mode === 'catalog-sequential') {
    const queue = albums.slice(albumIndex).flatMap((album) => album.tracks)
    return {
      queue,
      playbackMode: 'sequential',
    }
  }

  if (mode === 'repeat-all') {
    return {
      queue: currentAlbum.tracks,
      playbackMode: 'repeat-all',
    }
  }

  if (mode === 'shuffle') {
    return {
      queue: currentAlbum.tracks,
      playbackMode: 'shuffle',
      shufflePool: currentAlbum.tracks,
      shuffleCycle: true,
    }
  }

  return {
    queue: currentAlbum.tracks,
    playbackMode: 'sequential',
  }
}
