import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import type {
  AssignLyricsEditorLines,
  LyricsEditorSaved,
  LyricsEditorState,
  SaveLyricsEditor,
  RetimeLyricsEditorLines,
} from '@shared/types/lyricsEditor'
import type { LyricsFormat } from '@shared/types/libraryScan'
import { assignDuetLines, ensureDuetPerformerSlots, readDuetLyrics } from './duetLyrics'
import type { DuetLyricsSnapshot } from './duetTypes'
import { convertLrcToTtml } from './lyricsConversion'
import { readTtmlPlayback } from './ttmlPlayback'
import { LyricsEditorError } from './lyricsEditorError'
import { MAX_LYRICS_CHARACTERS } from './ttmlDocument'
import { readDuetDocument } from './duetDocument'
import { retimeTtmlLines, timingEditableLines } from './ttmlLineTiming'
import {
  audioIdentity,
  authorizeLyricsPath,
  captureLyricsFiles,
  pathKey,
  publishLyricsFile,
  sameIdentity,
  sameLyricFiles,
  type FileIdentity,
  type LyricFile,
} from './lyricsEditorFiles'

interface EditorSource {
  lyricsText: string
  lyricsFormat: LyricsFormat
  durationMs?: number
}
export interface LyricsEditorDependencies {
  getFilePath(trackId: number): string | null
  getRoots(): string[]
  /** Fresh metadata/sidecar read, under the application's audio read lease. */
  readSource(filePath: string): Promise<EditorSource | null>
  /** Updates both lyrics caches and broadcasts the existing library change event. */
  persist(trackId: number, dbFilePath: string, text: string): Promise<boolean>
  now?: () => number
}
interface Session {
  id: string
  owner: number
  trackId: number
  dbFilePath: string
  filePath: string
  audio: FileIdentity
  sidecars: LyricFile[]
  target: LyricFile
  text: string
  cleanText: string
  snapshot: DuetLyricsSnapshot
  touched: number
  busy: boolean
}
const MAX_SESSIONS = 8
const SESSION_IDLE_MS = 30 * 60 * 1000

/** Owner-bound, bounded drafts. Playback state is deliberately not a dependency. */
export class LyricsEditorService {
  private readonly sessions = new Map<string, Session>()
  private readonly savingPaths = new Set<string>()
  private readonly ownerVersions = new Map<number, number>()
  private readonly now: () => number
  private opening = 0

  private assertDraftBudget(text: string, cleanText: string, replacing?: string): void {
    let total = text.length + cleanText.length
    for (const [id, draft] of this.sessions)
      if (id !== replacing) total += draft.text.length + draft.cleanText.length
    if (total > MAX_LYRICS_CHARACTERS * 4) throw new LyricsEditorError('too-many-sessions')
  }

  constructor(private readonly dependencies: LyricsEditorDependencies) {
    this.now = dependencies.now ?? Date.now
  }

  private prune(): void {
    for (const [id, session] of this.sessions) {
      if (!session.busy && this.now() - session.touched > SESSION_IDLE_MS) this.sessions.delete(id)
    }
  }

  private session(owner: number, id: string, revision?: string): Session {
    this.prune()
    const session = this.sessions.get(id)
    if (!session || session.owner !== owner) throw new LyricsEditorError('session-expired')
    if (session.busy) throw new LyricsEditorError('busy')
    if (revision !== undefined && revision !== session.snapshot.revision)
      throw new LyricsEditorError('stale-revision')
    session.touched = this.now()
    return session
  }

  private state(session: Session): LyricsEditorState {
    const playback = readTtmlPlayback(session.text)
    const timingIds = timingEditableLines(readDuetDocument(session.text))
    const times = new Map<string, number>()
    for (const line of playback.lines)
      if (!times.has(line.editorLineId)) times.set(line.editorLineId, line.timeSeconds)
    return {
      sessionId: session.id,
      trackId: session.trackId,
      revision: session.snapshot.revision,
      dirty: session.text !== session.cleanText,
      editable: session.snapshot.editable && !playback.error,
      issues: [
        ...new Set([
          ...session.snapshot.issues.map((issue) => issue.code),
          ...(playback.error ? [playback.error] : []),
        ]),
      ],
      lines: session.snapshot.lines.map((line) => {
        const supported = ['unassigned', 'performer-1', 'performer-2'].includes(line.assignment)
        return {
          id: line.id,
          text: line.text,
          timeSeconds: times.get(line.id) ?? null,
          assignment: supported
            ? (line.assignment as LyricsEditorState['lines'][number]['assignment'])
            : 'unsupported',
          editable: session.snapshot.editable && line.editable && supported && !playback.error,
          timingEditable:
            session.snapshot.editable &&
            line.editable &&
            supported &&
            !playback.error &&
            timingIds.has(line.id),
        }
      }),
    }
  }

  private async assertUnchanged(session: Session, movedPath?: string): Promise<void> {
    if (this.dependencies.getFilePath(session.trackId) !== session.dbFilePath)
      throw new LyricsEditorError('file-changed')
    let canonical: string
    try {
      canonical = await authorizeLyricsPath(session.dbFilePath, this.dependencies.getRoots())
    } catch (error) {
      if (error instanceof LyricsEditorError && error.code === 'track-unavailable')
        throw new LyricsEditorError('file-changed')
      throw error
    }
    if (
      pathKey(canonical) !== pathKey(session.filePath) ||
      !sameIdentity(session.audio, await audioIdentity(canonical))
    )
      throw new LyricsEditorError('file-changed')
    if (!sameLyricFiles(session.sidecars, await captureLyricsFiles(canonical), movedPath))
      throw new LyricsEditorError('file-changed')
  }

  async open(owner: number, trackId: number): Promise<LyricsEditorState> {
    this.prune()
    if (this.sessions.size + this.opening >= MAX_SESSIONS)
      throw new LyricsEditorError('too-many-sessions')
    this.opening++
    const ownerVersion = this.ownerVersions.get(owner) ?? 0
    try {
      const dbFilePath = this.dependencies.getFilePath(trackId)
      const filePath = await authorizeLyricsPath(dbFilePath, this.dependencies.getRoots())
      if (!dbFilePath) throw new LyricsEditorError('track-unavailable')
      const audio = await audioIdentity(filePath)
      const sidecars = await captureLyricsFiles(filePath)
      const existingTtml = sidecars.find(
        (file) => extname(file.path).toLowerCase() === '.ttml' && file.identity,
      )
      // Existing (even malformed) TTML must be opened explicitly, never silently overwritten by a fallback LRC.
      const source: EditorSource | null =
        existingTtml?.text !== null && existingTtml?.text !== undefined
          ? { lyricsText: existingTtml.text, lyricsFormat: 'ttml' }
          : await this.dependencies.readSource(filePath)
      if (!source || !['lrc', 'ttml'].includes(source.lyricsFormat))
        throw new LyricsEditorError('no-timed-lyrics')
      let text =
        source.lyricsFormat === 'lrc'
          ? convertLrcToTtml(
              source.lyricsText,
              source.durationMs === undefined ? {} : { durationMs: source.durationMs },
            ).text
          : source.lyricsText
      let snapshot = readDuetLyrics(text)
      if (snapshot.editable) {
        const prepared = ensureDuetPerformerSlots(text, snapshot.revision)
        text = prepared.text
        snapshot = prepared.snapshot
      }
      const target =
        existingTtml ?? sidecars.find((file) => extname(file.path).toLowerCase() === '.ttml')!
      const session: Session = {
        id: randomUUID(),
        owner,
        trackId,
        dbFilePath,
        filePath,
        audio,
        sidecars,
        target,
        text,
        cleanText: text,
        snapshot,
        touched: this.now(),
        busy: false,
      }
      await this.assertUnchanged(session)
      if ((this.ownerVersions.get(owner) ?? 0) !== ownerVersion)
        throw new LyricsEditorError('session-expired')
      this.assertDraftBudget(text, text)
      // Baseline content hashes are sufficient after opening; do not retain four raw sidecar copies.
      for (const file of sidecars) file.text = null
      this.sessions.set(session.id, session)
      return this.state(session)
    } finally {
      this.opening--
    }
  }

  assign(owner: number, request: AssignLyricsEditorLines): LyricsEditorState {
    const session = this.session(owner, request.sessionId, request.expectedRevision)
    if (
      !['unassigned', 'performer-1', 'performer-2'].includes(request.assignment) ||
      !Array.isArray(request.lineIds) ||
      request.lineIds.length > 10000 ||
      request.lineIds.some((id) => typeof id !== 'string')
    )
      throw new LyricsEditorError('invalid-request')
    const view = this.state(session)
    if (!view.editable) throw new LyricsEditorError('unsupported-document')
    const lines = new Map(view.lines.map((line) => [line.id, line]))
    for (const id of request.lineIds) {
      const line = lines.get(id)
      if (!line) throw new LyricsEditorError('unknown-line')
      if (!line.editable) throw new LyricsEditorError('read-only-line')
    }
    const edited = assignDuetLines(session.text, {
      expectedRevision: request.expectedRevision,
      lineIds: request.lineIds,
      assignment: request.assignment,
    })
    this.assertDraftBudget(edited.text, session.cleanText, session.id)
    session.text = edited.text
    session.snapshot = edited.snapshot
    return this.state(session)
  }

  retime(owner: number, request: RetimeLyricsEditorLines): LyricsEditorState {
    const session = this.session(owner, request.sessionId, request.expectedRevision)
    if (
      !Array.isArray(request.lineIds) ||
      !request.lineIds.length ||
      request.lineIds.length > 10000 ||
      request.lineIds.some((id) => typeof id !== 'string')
    )
      throw new LyricsEditorError('invalid-request')
    const view = this.state(session)
    if (!view.editable) throw new LyricsEditorError('unsupported-document')
    const lines = new Map(view.lines.map((line) => [line.id, line]))
    for (const id of request.lineIds) {
      const line = lines.get(id)
      if (!line) throw new LyricsEditorError('unknown-line')
      if (!line.editable) throw new LyricsEditorError('read-only-line')
      if (!line.timingEditable) throw new LyricsEditorError('unsupported-timing')
    }
    const text = retimeTtmlLines(session.text, request)
    this.assertDraftBudget(text, session.cleanText, session.id)
    session.text = text
    session.snapshot = readDuetLyrics(text)
    return this.state(session)
  }

  async save(owner: number, request: SaveLyricsEditor): Promise<LyricsEditorSaved> {
    const session = this.session(owner, request.sessionId, request.expectedRevision)
    const key = pathKey(session.filePath)
    if (this.savingPaths.has(key)) throw new LyricsEditorError('busy')
    if (session.text === session.cleanText) {
      this.sessions.delete(session.id)
      return {
        trackId: session.trackId,
        written: false,
        savedPath: null,
        backupPath: null,
        cacheUpdated: true,
      }
    }
    if (!this.state(session).editable) throw new LyricsEditorError('unsupported-document')
    session.busy = true
    this.savingPaths.add(key)
    try {
      const saved = await publishLyricsFile(session.target, session.text, (moved) =>
        this.assertUnchanged(session, moved),
      )
      // Publication has committed. Never return a save failure just because cache refresh fails.
      this.sessions.delete(session.id)
      let cacheUpdated = false
      try {
        cacheUpdated = await this.dependencies.persist(
          session.trackId,
          session.dbFilePath,
          session.text,
        )
      } catch {
        /* Disk result remains authoritative. */
      }
      return {
        trackId: session.trackId,
        written: true,
        savedPath: session.target.path,
        backupPath: saved.backupPath,
        cacheUpdated,
      }
    } finally {
      session.busy = false
      this.savingPaths.delete(key)
    }
  }

  close(owner: number, sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.owner !== owner) return
    if (session.busy) throw new LyricsEditorError('busy')
    this.sessions.delete(sessionId)
  }

  releaseOwner(owner: number): void {
    this.ownerVersions.set(owner, (this.ownerVersions.get(owner) ?? 0) + 1)
    for (const session of this.sessions.values())
      if (session.owner === owner && !session.busy) this.sessions.delete(session.id)
  }

  dispose(): void {
    this.sessions.clear()
    this.ownerVersions.clear()
  }
}
