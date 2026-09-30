export interface StageAlbum {
  title: string
  artist: string
  artworkUrl: string | null
  playCount: number
  durationSeconds: number
}
export function mountArchiveStage(root: ShadowRoot): {
  setAlbums(items: StageAlbum[]): void
  dispose(): void
}
