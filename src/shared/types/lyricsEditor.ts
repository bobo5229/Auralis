/** Phase one: no names or chorus-editing capability crosses IPC. */
export type LyricsAssignment = 'unassigned' | 'performer-1' | 'performer-2'

export const MAX_LRC_EDITOR_CHARACTERS = 128 * 1024

export interface LrcEditorState {
  sessionId: string
  trackId: number
  revision: string
  text: string
  format: 'plain' | 'lrc' | 'ttml'
  canSaveTag: boolean
}

export interface SaveLrcEditor {
  sessionId: string
  expectedRevision: string
  text: string
  target: 'tag' | 'file' | 'ttml'
}

export interface LrcEditorSaved {
  trackId: number
  savedFormat: 'lrc' | 'ttml'
  conversionWarnings: string[]
  backupPath: string | null
  cacheUpdated: boolean
  /** Another higher-priority source may still be selected by the existing resolver. */
  active: boolean
  writeWarning: boolean
}

export interface PlaybackLyricLine {
  id: string
  /** ID used by the editor; multiple displayed lines may belong to one paragraph. */
  editorLineId: string
  timeSeconds: number
  endTimeSeconds: number | null
  text: string
  performer: 1 | 2 | null
}

export interface TtmlPlaybackLyrics {
  lines: PlaybackLyricLine[]
  error: 'invalid-ttml' | 'unsupported-timing' | null
}

export interface LyricsEditorLine {
  id: string
  text: string
  timeSeconds: number | null
  assignment: LyricsAssignment | 'unsupported'
  editable: boolean
}

export interface LyricsEditorState {
  sessionId: string
  trackId: number
  revision: string
  dirty: boolean
  editable: boolean
  lines: LyricsEditorLine[]
  issues: string[]
}

export interface AssignLyricsEditorLines {
  sessionId: string
  expectedRevision: string
  /** At most 10,000 IDs per call. Split larger selections using returned revisions. */
  lineIds: string[]
  assignment: LyricsAssignment
}

export interface SaveLyricsEditor {
  sessionId: string
  expectedRevision: string
}

export interface LyricsEditorSaved {
  trackId: number
  /** A successful save closes the session, including a no-op save. */
  written: boolean
  savedPath: string | null
  backupPath: string | null
  /** A file can be saved successfully while the database needs reconciliation. */
  cacheUpdated: boolean
}

export type LyricsEditorErrorCode =
  | 'invalid-lrc'
  | 'untimed-lines'
  | 'track-unavailable'
  | 'outside-library'
  | 'unsupported-file'
  | 'no-timed-lyrics'
  | 'invalid-ttml'
  | 'unsupported-timing'
  | 'unsupported-document'
  | 'read-only-line'
  | 'unknown-line'
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
