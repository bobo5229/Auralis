import { inject, provide, type InjectionKey } from 'vue'

export interface AlbumArtworkPublisher {
  set: (owner: symbol, key: string | null) => void
  clear: (owner: symbol) => void
}
const key: InjectionKey<AlbumArtworkPublisher> = Symbol('album-detail-artwork')

export function provideAlbumDetailArtwork(publish: AlbumArtworkPublisher): void {
  provide(key, publish)
}

export function useAlbumDetailArtworkPublisher(): AlbumArtworkPublisher | undefined {
  return inject(key, undefined)
}
