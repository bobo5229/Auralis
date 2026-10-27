export const MAX_LRC_EDITOR_CHARACTERS = 128 * 1024

export interface LrcEditorState {
  sessionId: string
  trackId: number
  revision: string
  text: string
  format: 'plain' | 'lrc'
  canSaveTag: boolean
  /** Embedded TTML is protected from tag replacement; LRC sidecar saves remain available. */
  tagWriteProtected?: boolean
}

export interface SaveLrcEditor {
  sessionId: string
  expectedRevision: string
  text: string
  target: 'tag' | 'file'
}

export interface LrcEditorSaved {
  trackId: number
  backupPath: string | null
  cacheUpdated: boolean
  /** Another higher-priority source may still be selected by the existing resolver. */
  active: boolean
  writeWarning: boolean
}

export type LyricsEditorErrorCode =
  | 'track-unavailable'
  | 'outside-library'
  | 'unsupported-file'
  | 'unsupported-format'
  | 'unsupported-document'
  | 'invalid-request'
  | 'stale-revision'
  | 'session-expired'
  | 'too-many-sessions'
  | 'busy'
  | 'file-changed'
  | 'save-failed'
  | 'recovery-required'

export type LyricsEditorResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: LyricsEditorErrorCode; recoveryBackupPath?: string }
