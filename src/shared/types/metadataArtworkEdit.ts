export interface EditableEmbeddedPicture {
  index: number
  cacheKey: string | null
  mimeType: string
  type: string | null
  description: string | null
  width: number
  height: number
  bytes: number
}
export interface MetadataArtworkSnapshot {
  pictures: EditableEmbeddedPicture[]
  fallbackSource: 'directory' | 'album' | 'none'
  fallbackCacheKey: string | null
  supported: boolean
}
export interface ImportedMetadataArtwork {
  imageToken: string
  cacheKey: string
  mimeType: string
  width: number
  height: number
  bytes: number
}
export type MetadataArtworkChange =
  | { kind: 'add'; imageToken: string }
  | { kind: 'replace'; index: number; imageToken: string }
  | { kind: 'remove'; index: number }
export type ArtworkEditorReply<T> =
  | { ok: true; value: T }
  | {
      ok: false
      reason:
        | 'metadata-conflict'
        | 'unsupported-format'
        | 'invalid-image'
        | 'image-too-large'
        | 'limit-exceeded'
        | 'unavailable'
    }
