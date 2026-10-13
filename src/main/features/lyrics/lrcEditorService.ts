import { createHash, randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import type { LrcEditorState, LrcEditorSaved, SaveLrcEditor } from '@shared/types/lyricsEditor'
import { MAX_LRC_EDITOR_CHARACTERS } from '@shared/types/lyricsEditor'
import { LYRICS_TAG_EXTENSIONS } from '../metadata/lyricsTagWriter'
import { LyricsEditorError } from './lyricsEditorError'
import { convertLrcToTtml } from './lyricsConversion'
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

export interface LrcEditorDependencies {
  getFilePath(id: number): string | null
  getRoots(): string[]
  readSource(
    path: string,
  ): Promise<{
    lyricsText: string
    lyricsFormat: 'lrc' | 'plain' | 'ttml'
    durationMs?: number
  } | null>
  writeTag(
    id: number,
    text: string,
    beforeCommit: () => Promise<void>,
  ): Promise<{ warning: boolean }>
  reconcile(
    id: number,
    path: string,
    text: string,
  ): Promise<{ cacheUpdated: boolean; active: boolean }>
  now?: () => number
}
interface Session {
  id: string
  owner: number
  trackId: number
  dbPath: string
  path: string
  audio: FileIdentity
  sidecars: LyricFile[]
  revision: string
  format: LrcEditorState['format']
  durationMs?: number
  touched: number
  busy: boolean
}

/** Raw text sessions are separate from the existing TTML assignment drafts. */
export class LrcEditorService {
  private readonly sessions = new Map<string, Session>()
  private readonly saving = new Set<string>()
  private readonly owners = new Map<number, number>()
  private opening = 0
  private readonly now: () => number
  constructor(private readonly dependencies: LrcEditorDependencies) {
    this.now = dependencies.now ?? Date.now
  }

  private prune(): void {
    for (const [id, session] of this.sessions)
      if (!session.busy && this.now() - session.touched > 30 * 60 * 1000) this.sessions.delete(id)
  }

  private async unchanged(session: Session, movedPath?: string): Promise<void> {
    if (this.dependencies.getFilePath(session.trackId) !== session.dbPath)
      throw new LyricsEditorError('file-changed')
    const path = await authorizeLyricsPath(session.dbPath, this.dependencies.getRoots())
    if (
      pathKey(path) !== pathKey(session.path) ||
      !sameIdentity(session.audio, await audioIdentity(path)) ||
      !sameLyricFiles(session.sidecars, await captureLyricsFiles(path), movedPath)
    )
      throw new LyricsEditorError('file-changed')
  }

  async open(owner: number, trackId: number): Promise<LrcEditorState> {
    this.prune()
    if (this.sessions.size + this.opening >= 8) throw new LyricsEditorError('too-many-sessions')
    this.opening++
    const ownerVersion = this.owners.get(owner) ?? 0
    try {
      const dbPath = this.dependencies.getFilePath(trackId)
      const path = await authorizeLyricsPath(dbPath, this.dependencies.getRoots())
      if (!dbPath) throw new LyricsEditorError('track-unavailable')
      const audio = await audioIdentity(path)
      const sidecars = await captureLyricsFiles(path)
      const source = await this.dependencies.readSource(path)
      const text = source?.lyricsText ?? ''
      if (text.length > MAX_LRC_EDITOR_CHARACTERS)
        throw new LyricsEditorError('unsupported-document')
      const session: Session = {
        id: randomUUID(),
        owner,
        trackId,
        dbPath,
        path,
        audio,
        sidecars,
        revision: createHash('sha256').update(text).digest('hex'),
        format: source?.lyricsFormat ?? 'plain',
        durationMs: source?.durationMs,
        touched: this.now(),
        busy: false,
      }
      await this.unchanged(session)
      if ((this.owners.get(owner) ?? 0) !== ownerVersion)
        throw new LyricsEditorError('session-expired')
      for (const file of sidecars) file.text = null
      this.sessions.set(session.id, session)
      return {
        sessionId: session.id,
        trackId,
        revision: session.revision,
        text,
        format: session.format,
        canSaveTag: LYRICS_TAG_EXTENSIONS.has(extname(path).toLowerCase()),
      }
    } finally {
      this.opening--
    }
  }

  async save(owner: number, request: SaveLrcEditor): Promise<LrcEditorSaved> {
    this.prune()
    const session = this.sessions.get(request.sessionId)
    if (!session || session.owner !== owner) throw new LyricsEditorError('session-expired')
    if (session.busy || this.saving.has(pathKey(session.path))) throw new LyricsEditorError('busy')
    if (request.expectedRevision !== session.revision) throw new LyricsEditorError('stale-revision')
    if (session.format === 'ttml') throw new LyricsEditorError('unsupported-document')
    if (
      typeof request.text !== 'string' ||
      request.text.length > MAX_LRC_EDITOR_CHARACTERS ||
      request.text.includes('\0') ||
      !['tag', 'file', 'ttml'].includes(request.target) ||
      /<\s*(?:\w+:)?tt\b/i.test(request.text)
    )
      throw new LyricsEditorError('invalid-request')
    if (request.target === 'tag' && !LYRICS_TAG_EXTENSIONS.has(extname(session.path).toLowerCase()))
      throw new LyricsEditorError('unsupported-file')
    let savedText = request.text
    let conversionWarnings: string[] = []
    if (request.target === 'ttml') {
      let converted: ReturnType<typeof convertLrcToTtml>
      try {
        converted = convertLrcToTtml(
          request.text,
          session.durationMs === undefined ? {} : { durationMs: session.durationMs },
        )
      } catch {
        throw new LyricsEditorError('invalid-lrc')
      }
      // Do not mark an unsaved plain-text line as saved after silently omitting it.
      if (converted.warnings.includes('untimed-lines-ignored'))
        throw new LyricsEditorError('untimed-lines')
      if (converted.text.length > MAX_LRC_EDITOR_CHARACTERS)
        throw new LyricsEditorError('unsupported-document')
      savedText = converted.text
      conversionWarnings = converted.warnings
    }
    session.busy = true
    session.touched = this.now()
    const key = pathKey(session.path)
    this.saving.add(key)
    let backupPath: string | null = null
    let writeWarning = false
    try {
      await this.unchanged(session)
      if (request.target === 'tag') {
        writeWarning = (
          await this.dependencies.writeTag(session.trackId, request.text, () =>
            this.unchanged(session),
          )
        ).warning
      } else {
        const targetPath = `${session.path.slice(0, -extname(session.path).length)}.${request.target === 'ttml' ? 'ttml' : 'lrc'}`
        const target = session.sidecars.find((file) => pathKey(file.path) === pathKey(targetPath))
        if (!target) throw new LyricsEditorError('unsupported-file')
        backupPath = (
          await publishLyricsFile(target, savedText, (moved) => this.unchanged(session, moved))
        ).backupPath
      }
      // A completed write cannot be submitted again using the old baseline.
      this.sessions.delete(session.id)
      let reconciliation = { cacheUpdated: false, active: false }
      try {
        reconciliation = await this.dependencies.reconcile(
          session.trackId,
          session.dbPath,
          savedText,
        )
      } catch {
        /* Disk save has committed. */
      }
      return {
        trackId: session.trackId,
        savedFormat: request.target === 'ttml' ? 'ttml' : 'lrc',
        conversionWarnings,
        backupPath,
        writeWarning,
        ...reconciliation,
      }
    } finally {
      session.busy = false
      this.saving.delete(key)
    }
  }

  close(owner: number, id: string): void {
    const session = this.sessions.get(id)
    if (!session || session.owner !== owner) return
    if (session.busy) throw new LyricsEditorError('busy')
    this.sessions.delete(id)
  }
  releaseOwner(owner: number): void {
    this.owners.set(owner, (this.owners.get(owner) ?? 0) + 1)
    for (const session of this.sessions.values())
      if (session.owner === owner && !session.busy) this.sessions.delete(session.id)
  }
  dispose(): void {
    this.sessions.clear()
    this.owners.clear()
  }
}
