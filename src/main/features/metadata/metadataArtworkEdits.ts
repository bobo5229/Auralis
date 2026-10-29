import { logger } from '@main/logging/logger'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import type {
  ImportedMetadataArtwork,
  MetadataArtworkChange,
  ArtworkEditorReply,
} from '@shared/types/metadataArtworkEdit'
import { writeArtworkToCache } from '../artwork/artworkCache'

export interface ResolvedArtworkChange {
  kind: 'add' | 'replace' | 'remove'
  index?: number
  data?: Buffer
  mimeType?: string
}
export interface ExpectedArtworkPicture {
  original?: NonNullable<import('music-metadata').IAudioMetadata['common']['picture']>[number]
  data: Uint8Array
  format: string
}
export function expectedArtworkPictures(
  original: NonNullable<import('music-metadata').IAudioMetadata['common']['picture']>,
  changes: ResolvedArtworkChange[],
): ExpectedArtworkPicture[] {
  const selected = new Map(
    changes.filter((change) => change.kind !== 'add').map((change) => [change.index, change]),
  )
  const expected: ExpectedArtworkPicture[] = []
  for (const [index, picture] of original.entries()) {
    const change = selected.get(index)
    if (!change) expected.push({ original: picture, data: picture.data, format: picture.format })
    else if (change.kind === 'replace')
      expected.push({ data: change.data!, format: change.mimeType! })
  }
  for (const change of changes)
    if (change.kind === 'add') expected.push({ data: change.data!, format: change.mimeType! })
  return expected
}
interface ImportRecord {
  session: string
  path: string
  value: ImportedMetadataArtwork
  expires: number
}
/** Raw imports stay in private temporary storage; renderer sees only bound tokens and cache keys. */
export class MetadataArtworkEdits {
  private readonly imports = new Map<string, ImportRecord>()
  private readonly previews = new Set<string>()
  private readonly roots = new Map<string, Promise<string>>()
  private readonly pendingImports = new Map<
    string,
    Set<Promise<ArtworkEditorReply<ImportedMetadataArtwork>>>
  >()
  private readonly expires = new Map<string, number>()
  private readonly expiryTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly releasing = new Map<string, Promise<void>>()
  constructor(private readonly cacheDir: string) {}
  private sweepExpired(): void {
    const now = Date.now()
    for (const [session, deadline] of this.expires)
      if (deadline <= now)
        void this.release(session).catch((error) =>
          logger.warn({ err: error }, 'Unable to release expired artwork imports'),
        )
  }
  hasResources(): boolean {
    this.sweepExpired()
    const now = Date.now()
    return (
      [...this.previews].some((session) => (this.expires.get(session) ?? 0) > now) ||
      [...this.imports.values()].some((record) => record.expires > now)
    )
  }
  protectPreview(session: string, expires = Date.now() + 30 * 60 * 1000): void {
    this.previews.add(session)
    const deadline = Math.min(this.expires.get(session) ?? Infinity, expires)
    if (this.expiryTimers.has(session) && this.expires.get(session) === deadline) return
    const previous = this.expiryTimers.get(session)
    if (previous) clearTimeout(previous)
    this.expires.set(session, deadline)
    const timer = setTimeout(
      () => {
        void this.release(session).catch((error) =>
          logger.warn({ err: error }, 'Unable to release expired artwork imports'),
        )
      },
      Math.max(0, deadline - Date.now()),
    )
    timer.unref()
    this.expiryTimers.set(session, timer)
  }
  import(
    session: string,
    path: string,
    expires = Date.now() + 30 * 60 * 1000,
  ): Promise<ArtworkEditorReply<ImportedMetadataArtwork>> {
    this.sweepExpired()
    if (expires <= Date.now()) return Promise.resolve({ ok: false, reason: 'metadata-conflict' })
    const running = [...this.pendingImports.values()].reduce((sum, set) => sum + set.size, 0)
    if (this.imports.size + running >= 16)
      return Promise.resolve({ ok: false, reason: 'limit-exceeded' })
    let operations = this.pendingImports.get(session)
    if (!operations) {
      operations = new Set()
      this.pendingImports.set(session, operations)
    }
    const pending: Promise<ArtworkEditorReply<ImportedMetadataArtwork>> = this.performImport(
      session,
      path,
      expires,
    ).finally(() => {
      operations!.delete(pending)
      if (!operations!.size) this.pendingImports.delete(session)
    })
    operations.add(pending)
    return pending
  }
  private async performImport(
    session: string,
    path: string,
    expires: number,
  ): Promise<ArtworkEditorReply<ImportedMetadataArtwork>> {
    this.protectPreview(session, expires)
    if (this.imports.size >= 16) return { ok: false, reason: 'limit-exceeded' }
    const info = await stat(path)
    if (!info.isFile() || info.size > 20 * 1024 * 1024)
      return { ok: false, reason: 'image-too-large' }
    const data = await readFile(path)
    if (data.length > 20 * 1024 * 1024) return { ok: false, reason: 'image-too-large' }
    try {
      const image = sharp(data, { limitInputPixels: 40000000, failOn: 'error' })
      const metadata = await image.metadata()
      if (!['jpeg', 'png'].includes(metadata.format ?? ''))
        return { ok: false, reason: 'invalid-image' }
      if (!metadata.width || !metadata.height || metadata.width * metadata.height > 40000000)
        return { ok: false, reason: 'image-too-large' }
      await image.stats()
      const mimeType = metadata.format === 'png' ? 'image/png' : 'image/jpeg'
      const cacheKey = await writeArtworkToCache(this.cacheDir, { data, mimeType })
      if (!cacheKey) return { ok: false, reason: 'invalid-image' }
      let root = this.roots.get(session)
      if (!root) {
        root = mkdtemp(join(tmpdir(), 'auralis-editor-artwork-'))
        this.roots.set(session, root)
      }
      if (expires <= Date.now()) return { ok: false, reason: 'metadata-conflict' }
      const imageToken = randomUUID(),
        temporaryPath = join(await root, imageToken)
      await writeFile(temporaryPath, data, { flag: 'wx' })
      const value = {
        imageToken,
        cacheKey,
        mimeType,
        width: metadata.width,
        height: metadata.height,
        bytes: data.length,
      }
      this.imports.set(imageToken, {
        session,
        path: temporaryPath,
        value,
        expires,
      })
      return { ok: true, value }
    } catch (error) {
      return {
        ok: false,
        reason:
          error instanceof Error && error.message.includes('pixel limit')
            ? 'image-too-large'
            : 'invalid-image',
      }
    }
  }
  async resolve(
    session: string,
    changes: MetadataArtworkChange[],
    pictureCount: number,
  ): Promise<ResolvedArtworkChange[]> {
    if (changes.length > 16) throw new Error('Too many artwork changes')
    const resultingCount =
      pictureCount +
      changes.filter((change) => change.kind === 'add').length -
      changes.filter((change) => change.kind === 'remove').length
    if (pictureCount > 64 || resultingCount > 64) throw new Error('Too many embedded pictures')
    const selected = new Set<number>(),
      resolved: ResolvedArtworkChange[] = []
    for (const change of changes) {
      if (change.kind !== 'add') {
        if (
          !Number.isSafeInteger(change.index) ||
          change.index < 0 ||
          change.index >= pictureCount ||
          selected.has(change.index)
        )
          throw new Error('Invalid artwork selection')
        selected.add(change.index)
      }
      if (change.kind === 'remove') {
        resolved.push({ ...change })
        continue
      }
      const record = this.imports.get(change.imageToken)
      if (!record || record.session !== session || record.expires < Date.now())
        throw new Error('Artwork import expired')
      resolved.push({
        kind: change.kind,
        ...(change.kind === 'replace' ? { index: change.index } : {}),
        mimeType: record.value.mimeType,
        data: await readFile(record.path),
      })
    }
    return resolved
  }
  release(session: string): Promise<void> {
    const active = this.releasing.get(session)
    if (active) return active
    const cleanup: Promise<void> = this.performRelease(session).finally(() => {
      if (this.releasing.get(session) === cleanup) this.releasing.delete(session)
    })
    this.releasing.set(session, cleanup)
    return cleanup
  }
  private async performRelease(session: string): Promise<void> {
    const timer = this.expiryTimers.get(session)
    if (timer) clearTimeout(timer)
    this.expiryTimers.delete(session)
    this.expires.delete(session)
    await Promise.allSettled([...(this.pendingImports.get(session) ?? [])])
    this.previews.delete(session)
    for (const [token, record] of this.imports)
      if (record.session === session) this.imports.delete(token)
    const rootPromise = this.roots.get(session)
    const root = rootPromise ? await rootPromise : undefined
    this.roots.delete(session)
    if (root) {
      if (!root.startsWith(join(tmpdir(), 'auralis-editor-artwork-')))
        throw new Error('Unsafe artwork cleanup path')
      await rm(root, { recursive: true, force: true })
    }
  }
  async clear(): Promise<void> {
    for (const session of new Set([
      ...this.roots.keys(),
      ...this.previews,
      ...this.expires.keys(),
      ...this.releasing.keys(),
    ]))
      await this.release(session)
  }
}
