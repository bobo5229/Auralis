import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import type { MetadataRefreshRepository } from '@main/repositories/metadataRefreshRepository'
import type {
  TrackMetadataEditSnapshot,
  UpdateTrackMetadataRequest,
} from '@shared/types/trackMetadata'
import type { TrackFileFingerprint } from '@shared/types/trackFile'
import type { UpdateTrackMetadataResult } from '@shared/ipc/contracts'
import type { AudioTagEdit } from './audioTagEdit'
import { parseAudioMetadata } from './parseAudioMetadata'
import { normalizeMetadata } from './metadataNormalizer'
import { normalizeEditableMetadata } from './editableMetadataValidation'
import {
  scanFileFingerprint,
  hasSameScanFileFingerprint,
} from '../libraryScan/libraryScanFileFingerprint'
import { MetadataSaveError } from './metadataSaveError'

interface EditSession {
  snapshot: TrackMetadataEditSnapshot
  path: string
  fingerprint: TrackFileFingerprint
  revision: string
  expires: number
}

/** Bounded, process-local optimistic edits. Playback's cached metadata query stays separate. */
export class MetadataEditSessions {
  private readonly sessions = new Map<string, EditSession>()
  constructor(
    private readonly repository: MetadataRefreshRepository,
    private readonly write: (
      metadata: AudioTagEdit,
      beforeCommit: () => Promise<void>,
    ) => Promise<UpdateTrackMetadataResult>,
    private readonly notify: (id: number, path: string) => string | void,
  ) {}

  clear(): void {
    this.sessions.clear()
  }

  async load(trackId: number): Promise<TrackMetadataEditSnapshot | null> {
    const path = this.repository.getTrackFilePath(trackId)
    if (!path) return null
    const revision = this.repository.getMetadataEditRevision(trackId)
    const before = await stat(path)
    if (!before.isFile()) throw new Error('Metadata source is not a file')
    const metadata = await parseAudioMetadata(path, { skipCovers: true, duration: false })
    const fingerprint = scanFileFingerprint(before)
    if (
      !hasSameScanFileFingerprint(await stat(path), fingerprint) ||
      revision !== this.repository.getMetadataEditRevision(trackId)
    )
      throw new MetadataSaveError('metadata-conflict', 'Metadata changed while opening the editor')
    const snapshot: TrackMetadataEditSnapshot = {
      trackId,
      ...normalizeMetadata(metadata).fileTags,
      editToken: randomUUID(),
    }
    const legacy = this.repository.getLegacyMetadata(trackId)
    if (legacy) snapshot.legacyMetadata = legacy
    const now = Date.now()
    for (const [key, session] of this.sessions) if (session.expires < now) this.sessions.delete(key)
    while (this.sessions.size >= 256) this.sessions.delete(this.sessions.keys().next().value!)
    this.sessions.set(snapshot.editToken, {
      snapshot,
      path,
      fingerprint,
      revision,
      expires: now + 30 * 60 * 1000,
    })
    return snapshot
  }

  async save(request: UpdateTrackMetadataRequest): Promise<UpdateTrackMetadataResult> {
    const session = this.sessions.get(request.editToken)
    if (!session || session.snapshot.trackId !== request.trackId || session.expires < Date.now())
      return { ok: false, reason: 'metadata-conflict' }
    const assertCurrent = async () => {
      if (
        this.repository.getMetadataEditRevision(request.trackId) !== session.revision ||
        this.repository.getTrackFilePath(request.trackId) !== session.path ||
        !hasSameScanFileFingerprint(await stat(session.path), session.fingerprint)
      )
        throw new MetadataSaveError('metadata-conflict', 'The metadata edit is stale')
    }
    await assertCurrent()
    const legacy = session.snapshot.legacyMetadata
    if (legacy && !request.legacyAction) return { ok: false, reason: 'legacy-metadata-unresolved' }
    if (!legacy && request.legacyAction) return { ok: false, reason: 'metadata-conflict' }
    if (request.legacyAction === 'adopt-file') {
      if (Object.keys(request.changes).length) return { ok: false, reason: 'metadata-conflict' }
      await assertCurrent()
      this.repository.adoptFileMetadata(
        request.trackId,
        session.path,
        session.snapshot,
        session.revision,
      )
      this.sessions.delete(request.editToken)
      const revision = this.notify(request.trackId, session.path)
      return { ok: true, ...(revision ? { libraryRevision: revision } : {}) }
    }
    const fields = Object.keys(request.changes) as NonNullable<AudioTagEdit['editedFields']>
    if (!fields.length && !legacy) return { ok: true }
    const base = request.legacyAction === 'write-legacy' ? legacy! : session.snapshot
    const edit: AudioTagEdit = {
      ...normalizeEditableMetadata({ ...base, ...request.changes, trackId: request.trackId }),
      editedFields: legacy
        ? [
            'title',
            'artistDisplay',
            'albumTitle',
            'albumArtistDisplay',
            'genreDisplay',
            'releaseDate',
          ]
        : fields,
      expectedFingerprint: session.fingerprint,
      expectedEditRevision: session.revision,
      commitFileTags: true,
    }
    const result = await this.write(edit, assertCurrent)
    if (result.ok) {
      const fingerprint = this.repository.getMetadataFileFingerprint(request.trackId)
      if (fingerprint)
        this.sessions.set(request.editToken, {
          ...session,
          fingerprint,
          revision: this.repository.getMetadataEditRevision(request.trackId),
          snapshot: {
            trackId: edit.trackId,
            title: edit.title,
            artistDisplay: edit.artistDisplay,
            albumTitle: edit.albumTitle,
            albumArtistDisplay: edit.albumArtistDisplay,
            genreDisplay: edit.genreDisplay,
            year: edit.year,
            releaseDate: edit.releaseDate,
            editToken: request.editToken,
          },
        })
      else this.sessions.delete(request.editToken)
    }
    return result
  }
}
