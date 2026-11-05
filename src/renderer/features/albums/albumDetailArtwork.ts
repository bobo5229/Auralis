import { inject, provide, type InjectionKey } from 'vue'
import type { AlbumColorAnchor } from './albumColorPreferences'

export interface AlbumArtworkPublisher {
  set: (
    owner: symbol,
    key: string | null,
    anchors?: AlbumColorAnchor[],
    identity?: { artist: string; title: string },
  ) => void
  clear: (owner: symbol) => void
}
const key: InjectionKey<AlbumArtworkPublisher> = Symbol('album-detail-artwork')

export function provideAlbumDetailArtwork(publish: AlbumArtworkPublisher): void {
  provide(key, publish)
}

export function useAlbumDetailArtworkPublisher(): AlbumArtworkPublisher | undefined {
  return inject(key, undefined)
}
