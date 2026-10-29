import sharp from 'sharp'
import { MetadataArtworkEdits, expectedArtworkPictures } from './metadataArtworkEdits'
import type {
  ArtworkEditorReply,
  MetadataArtworkSnapshot,
  ImportedMetadataArtwork,
} from '@shared/types/metadataArtworkEdit'
import { writeArtworkToCache } from '../artwork/artworkCache'
import { readDirectoryArtwork } from '../artwork/directoryArtwork'
import { basename, extname } from 'node:path'
import { metadataEditCapabilities } from './metadataEditCapabilities'
import { validateMetadataChanges } from '@shared/utils/metadataNumbers'
import { EDITABLE_TAG_FIELDS, LEGACY_TAG_FIELDS } from '@shared/utils/metadataEditRequest'
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

export interface PreparedMetadataEdit {
  snapshot: TrackMetadataEditSnapshot
  path: string
  fingerprint: TrackFileFingerprint
  revision: string
  expires: number
  pictureCount?: number
}

/** Bounded, process-local optimistic edits. Playback's cached metadata query stays separate. */
export class MetadataEditSessions {
  private readonly sessions = new Map<string, PreparedMetadataEdit>()
  private readonly artworkEdits: MetadataArtworkEdits
  constructor(
    private readonly repository: MetadataRefreshRepository,
    private readonly write: (
      metadata: AudioTagEdit,
      beforeCommit: () => Promise<void>,
    ) => Promise<UpdateTrackMetadataResult>,
    private readonly notify: (id: number, path: string) => string | void,
    private readonly artworkCacheDir: string,
  ) {
    this.artworkEdits = new MetadataArtworkEdits(artworkCacheDir)
  }

  hasArtworkResources(): boolean {
    return this.artworkEdits.hasResources()
  }

  async clear(): Promise<void> {
    this.sessions.clear()
    await this.artworkEdits.clear()
  }

  async prepareDetached(trackId: number): Promise<PreparedMetadataEdit | null> {
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
      fileSummary: {
        fileName: basename(path),
        filePath: path,
        format: extname(path).slice(1).toUpperCase(),
        targetCount: 1,
      },
      capabilities: metadataEditCapabilities(path),
    }
    const legacy = this.repository.getLegacyMetadata(trackId)
    if (legacy) snapshot.legacyMetadata = legacy
    return { snapshot, path, fingerprint, revision, expires: Date.now() + 30 * 60 * 1000 }
  }
  async load(trackId: number): Promise<TrackMetadataEditSnapshot | null> {
    const session = await this.prepareDetached(trackId)
    if (!session) return null
    const now = Date.now()
    for (const [key, value] of this.sessions) if (value.expires < now) await this.release(key)
    while (this.sessions.size >= 256) await this.release(this.sessions.keys().next().value!)
    this.sessions.set(session.snapshot.editToken, session)
    return session.snapshot
  }
  savePrepared(
    session: PreparedMetadataEdit,
    changes: UpdateTrackMetadataRequest['changes'],
  ): Promise<UpdateTrackMetadataResult> {
    return this.saveSession(
      { trackId: session.snapshot.trackId, editToken: session.snapshot.editToken, changes },
      { ...session, expires: Infinity },
    )
  }

  async release(editToken: string): Promise<void> {
    this.sessions.delete(editToken)
    await this.artworkEdits.release(editToken)
  }
  private async requireSession(trackId: number, editToken: string): Promise<PreparedMetadataEdit> {
    const session = this.sessions.get(editToken)
    if (
      !session ||
      session.snapshot.trackId !== trackId ||
      session.expires < Date.now() ||
      this.repository.getTrackFilePath(trackId) !== session.path ||
      this.repository.getMetadataEditRevision(trackId) !== session.revision ||
      !hasSameScanFileFingerprint(await stat(session.path), session.fingerprint) ||
      this.sessions.get(editToken) !== session
    )
      throw new MetadataSaveError('metadata-conflict', 'Stale artwork session')
    return session
  }
  async getArtwork(
    trackId: number,
    editToken: string,
  ): Promise<ArtworkEditorReply<MetadataArtworkSnapshot>> {
    try {
      const session = await this.requireSession(trackId, editToken)
      this.artworkEdits.protectPreview(editToken, session.expires)
      const metadata = await parseAudioMetadata(session.path)
      const originals = metadata.common.picture ?? []
      if (originals.length > 64) return { ok: false, reason: 'limit-exceeded' }
      const pictures: import('@shared/types/metadataArtworkEdit').EditableEmbeddedPicture[] = []
      for (const [index, picture] of originals.entries()) {
        const data = Buffer.from(picture.data),
          dimensions = await sharp(data, { limitInputPixels: 40000000 })
            .metadata()
            .catch(() => null)
        const cacheKey = await writeArtworkToCache(this.artworkCacheDir, {
          data,
          mimeType: picture.format,
        })
        pictures.push({
          index,
          cacheKey,
          mimeType: picture.format,
          type: picture.type ?? null,
          description: picture.description ?? null,
          width: dimensions?.width ?? 0,
          height: dimensions?.height ?? 0,
          bytes: data.length,
        })
      }
      const directory = await readDirectoryArtwork(session.path, this.artworkCacheDir)
      const album = this.repository.getArtworkFallback(trackId)
      await this.requireSession(trackId, editToken)
      session.pictureCount = pictures.length
      return {
        ok: true,
        value: {
          pictures,
          supported: !!session.snapshot.capabilities?.artwork,
          fallbackSource: directory.cacheKey ? 'directory' : album ? 'album' : 'none',
          fallbackCacheKey: directory.cacheKey ?? album,
        },
      }
    } catch {
      return { ok: false, reason: 'metadata-conflict' }
    }
  }
  async importArtwork(
    trackId: number,
    editToken: string,
    select: () => Promise<string | null>,
  ): Promise<ArtworkEditorReply<ImportedMetadataArtwork | null>> {
    try {
      const session = await this.requireSession(trackId, editToken)
      if (!session.snapshot.capabilities?.artwork)
        return { ok: false, reason: 'unsupported-format' }
      const path = await select()
      if (!path) return { ok: true, value: null }
      await this.requireSession(trackId, editToken)
      return await this.artworkEdits.import(editToken, path, session.expires)
    } catch {
      return { ok: false, reason: 'unavailable' }
    }
  }
  async save(request: UpdateTrackMetadataRequest): Promise<UpdateTrackMetadataResult> {
    return this.saveSession(request, this.sessions.get(request.editToken))
  }
  private async saveSession(
    request: UpdateTrackMetadataRequest,
    session: PreparedMetadataEdit | undefined,
  ): Promise<UpdateTrackMetadataResult> {
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
    const capabilities = metadataEditCapabilities(session.path)
    for (const field of Object.keys(request.changes) as Array<keyof typeof capabilities.fields>)
      if (!capabilities.fields[field])
        throw new MetadataSaveError('tag-write-failed', 'Unsupported metadata field')
    validateMetadataChanges(session.snapshot, request.changes)
    if (
      Object.hasOwn(request.changes, 'releaseDate') &&
      request.changes.releaseDate?.length === 7 &&
      !capabilities.datePrecisions.includes('month')
    )
      throw new MetadataSaveError('unsupported-date-precision', 'Unsupported date precision')
    const legacy = session.snapshot.legacyMetadata
    if (legacy && !request.legacyAction) return { ok: false, reason: 'legacy-metadata-unresolved' }
    if (!legacy && request.legacyAction) return { ok: false, reason: 'metadata-conflict' }
    if (request.legacyAction === 'adopt-file') {
      if (Object.keys(request.changes).length || request.artworkChanges?.length)
        return { ok: false, reason: 'metadata-conflict' }
      await assertCurrent()
      this.repository.adoptFileMetadata(
        request.trackId,
        session.path,
        session.snapshot,
        session.revision,
      )
      await this.release(request.editToken)
      const revision = this.notify(request.trackId, session.path)
      return { ok: true, ...(revision ? { libraryRevision: revision } : {}) }
    }
    const fields = Object.keys(request.changes) as NonNullable<AudioTagEdit['editedFields']>
    if (!fields.length && !legacy && !request.artworkChanges?.length) return { ok: true }
    if (
      request.legacyAction === 'apply-merged' &&
      !fields.length &&
      !request.artworkChanges?.length
    ) {
      this.repository.adoptFileMetadata(
        request.trackId,
        session.path,
        session.snapshot,
        session.revision,
      )
      await this.release(request.editToken)
      const libraryRevision = this.notify(request.trackId, session.path)
      return { ok: true, ...(libraryRevision ? { libraryRevision } : {}) }
    }
    const base =
      request.legacyAction === 'write-legacy'
        ? {
            ...session.snapshot,
            ...legacy,
            releaseDate:
              legacy!.releaseDate ??
              (legacy!.year === null ? null : String(legacy!.year).padStart(4, '0')),
          }
        : session.snapshot
    let resolvedArtworkChanges: AudioTagEdit['resolvedArtworkChanges']
    let expectedArtwork: AudioTagEdit['expectedArtwork']
    if (request.artworkChanges?.length) {
      if (!capabilities.artwork)
        throw new MetadataSaveError('tag-write-failed', 'Unsupported artwork format')
      const sourcePictures = (await parseAudioMetadata(session.path)).common.picture ?? []
      const count = sourcePictures.length
      resolvedArtworkChanges = await this.artworkEdits.resolve(
        request.editToken,
        request.artworkChanges,
        count,
      )
      expectedArtwork = expectedArtworkPictures(sourcePictures, resolvedArtworkChanges)
    }
    const edit: AudioTagEdit = {
      resolvedArtworkChanges,
      expectedArtwork,
      ...normalizeEditableMetadata({ ...base, ...request.changes, trackId: request.trackId }),
      editedFields:
        request.legacyAction === 'write-legacy'
          ? [...LEGACY_TAG_FIELDS.filter((field) => field !== 'year'), ...fields]
          : fields,
      expectedFingerprint: session.fingerprint,
      expectedEditRevision: session.revision,
      commitFileTags: true,
    }
    const result = await this.write(edit, assertCurrent)
    if (result.ok) {
      const fingerprint = this.repository.getMetadataFileFingerprint(request.trackId)
      if (fingerprint && this.sessions.has(request.editToken))
        this.sessions.set(request.editToken, {
          ...session,
          pictureCount: undefined,
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
            ...Object.fromEntries(EDITABLE_TAG_FIELDS.map((field) => [field, edit[field] ?? null])),
            editToken: request.editToken,
            capabilities: session.snapshot.capabilities,
            fileSummary: session.snapshot.fileSummary,
          },
        })
      else this.sessions.delete(request.editToken)
    }
    return result
  }
}
