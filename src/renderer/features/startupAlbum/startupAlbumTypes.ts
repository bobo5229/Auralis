import type { RandomAlbumTracksResult } from '@shared/types/playback'
import type { createCardScene } from './rendering/scene'

export interface StartupAlbumPresentation {
  album: RandomAlbumTracksResult
  cover: HTMLImageElement | null
  createScene: typeof createCardScene | null
}
