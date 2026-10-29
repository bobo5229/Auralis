import { inject, provide, type InjectionKey } from 'vue'
export interface AlbumMetadataEditorRequest {
  album?: { title: string; artist: string }
  returnFocusTo?: HTMLElement | null
}
export type AlbumMetadataEditorAccess = { open: (request: AlbumMetadataEditorRequest) => void }
const key: InjectionKey<AlbumMetadataEditorAccess> = Symbol('album-metadata-editor')
export function provideAlbumMetadataEditor(access: AlbumMetadataEditorAccess): void {
  provide(key, access)
}
export function useAlbumMetadataEditor(): AlbumMetadataEditorAccess | null {
  return inject(key, null)
}
