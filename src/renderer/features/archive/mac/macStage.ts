export interface ArchiveStageRoot {
  host: HTMLElement
  coverDragging?: boolean
  getElementById<T extends HTMLElement = HTMLElement>(id: string): T | null
  querySelector<T extends Element = Element>(selector: string): T | null
  onGeometry?: (geometry: { settled: boolean; points: Array<{ x: number; y: number }> }) => void
  onSelection?: (index: number) => void
}

export interface ArchiveStageAlbumInput {
  id: string | number
  title: string
  artist: string
  playCount: number
  minutes: number
  artworkUrl?: string | null
  coverCanvas?: HTMLCanvasElement | null
}

export interface ArchiveStageController {
  setAlbums(albums: ArchiveStageAlbumInput[]): void
  select(index: number): void
  inspect(): { settled: boolean; points: Array<{ x: number; y: number }> } | null
  dispose(): void
}

// The renderer owns the approved demo's geometry, materials and hologram animation.
import { mountArchiveStage as mountRenderer } from './macStageRenderer.js'
export function mountArchiveStage(root: ArchiveStageRoot): ArchiveStageController {
  return mountRenderer(root)
}
