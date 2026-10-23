export type DuetAssignment = 'unassigned' | 'performer-1' | 'performer-2' | 'together'
export type DuetLineAssignment = DuetAssignment | 'mixed' | 'unknown'

export interface DuetPerformer {
  id: string
  name: string | null
  type: string | null
}

export interface DuetLine {
  /** Opaque identity within this revision; independent of text and timestamps. */
  id: string
  xmlId: string | null
  text: string
  timing: { begin: string | null; end: string | null; duration: string | null }
  assignment: DuetLineAssignment
  performerIds: string[]
  editable: boolean
}

export interface DuetIssue {
  code:
    | 'unsupported-performers'
    | 'invalid-agent'
    | 'duplicate-id'
    | 'unknown-performer'
    | 'unsupported-structure'
  lineId?: string
  performerId?: string
}

export interface DuetLyricsSnapshot {
  revision: string
  performers: DuetPerformer[]
  roles: { performer1: string | null; performer2: string | null; together: string | null }
  lines: DuetLine[]
  editable: boolean
  issues: DuetIssue[]
}

export interface DuetEditResult {
  text: string
  changed: boolean
  snapshot: DuetLyricsSnapshot
}

export interface ConfigureDuetRequest {
  expectedRevision: string
  performer1Name: string
  performer2Name: string
  /** Optional group label. Omission preserves an existing label. */
  togetherName?: string
}

export interface RenameDuetPerformerRequest {
  expectedRevision: string
  performerId: string
  name: string
}

export interface AssignDuetLinesRequest {
  expectedRevision: string
  lineIds: string[]
  assignment: DuetAssignment
}

export class DuetLyricsError extends Error {
  constructor(
    readonly code:
      | 'invalid-ttml'
      | 'invalid-request'
      | 'stale-revision'
      | 'unsupported-document'
      | 'unknown-performer'
      | 'unknown-line'
      | 'read-only-line'
      | 'unconfigured-role'
      | 'unsupported-inheritance',
    message: string,
  ) {
    super(message)
    this.name = 'DuetLyricsError'
  }
}
