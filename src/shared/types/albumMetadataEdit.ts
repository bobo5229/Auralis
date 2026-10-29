import type { FileTagValues } from './trackMetadata'
export const ALBUM_EDIT_FIELDS = [
  'albumTitle',
  'albumArtistDisplay',
  'genreDisplay',
  'releaseDate',
] as const
export type AlbumEditField = (typeof ALBUM_EDIT_FIELDS)[number]
export interface AlbumEditOperation {
  mode: 'keep' | 'replace' | 'clear' | 'add' | 'remove'
  value?: string | null
}
export type AlbumEditOperations = Partial<Record<AlbumEditField, AlbumEditOperation>>
export type AlbumEditState =
  | 'preparing'
  | 'ready'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'failed'
export type AlbumEditItemState =
  | 'pending'
  | 'ready'
  | 'blocked'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'unexecuted'
export interface AlbumEditItem {
  trackId: number
  fileName: string
  status: AlbumEditItemState
  reason?: string
  before?: FileTagValues
  after?: FileTagValues
  changes?: Partial<FileTagValues>
}
export interface AlbumEditTask {
  taskId: string
  albumTitle: string
  state: AlbumEditState
  total: number
  processed: number
  expiresAt: number
  items: AlbumEditItem[]
  operations: AlbumEditOperations
  skipBlocked: boolean
  previewed: boolean
}
export interface AlbumEditPrepareRequest {
  album?: { title: string; artist: string }
  retryTaskId?: string
}
export type AlbumEditReply =
  | { ok: true; task: AlbumEditTask | null }
  | {
      ok: false
      reason: 'busy' | 'too-many-tracks' | 'expired' | 'not-found' | 'blocked' | 'invalid'
    }
export interface AlbumEditProgress {
  taskId: string
  state: AlbumEditState
  total: number
  processed: number
  item?: Pick<AlbumEditItem, 'trackId' | 'status' | 'reason'>
}
