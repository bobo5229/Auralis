import { randomUUID } from 'node:crypto'
import type {
  AlbumEditItem,
  AlbumEditOperations,
  AlbumEditPrepareRequest,
  AlbumEditProgress,
  AlbumEditReply,
  AlbumEditTask,
} from '@shared/types/albumMetadataEdit'
import { EDITABLE_TAG_FIELDS } from '@shared/utils/metadataEditRequest'
import type { FileTagValues } from '@shared/types/trackMetadata'
import { releaseDateYear } from '@shared/utils/releaseDate'
import { albumMetadataChanges } from '@shared/utils/albumMetadataChanges'
import type { MetadataEditSessions, PreparedMetadataEdit } from './metadataEditSessions'
import { metadataSaveFailureReason } from './metadataSaveError'

/** One process-local manifest, independent of the bounded pool of interactive edit tokens. */
export class AlbumMetadataEditService {
  private task: AlbumEditTask | null = null
  private readonly handles = new Map<number, PreparedMetadataEdit>()
  private pending: Promise<void> | null = null
  private cancelRequested = false
  private stopping = false
  constructor(
    private readonly sessions: Pick<MetadataEditSessions, 'prepareDetached' | 'savePrepared'>,
    private readonly albumIds: (title: string, artist: string) => number[],
    private readonly publish: (progress: AlbumEditProgress) => void,
  ) {}
  isRunning(): boolean {
    return this.task?.state === 'running'
  }
  get(): AlbumEditReply {
    return { ok: true, task: this.task ? structuredClone(this.task) : null }
  }
  private progress(item?: AlbumEditItem): void {
    const task = this.task
    if (task)
      this.publish({
        taskId: task.taskId,
        state: task.state,
        total: task.total,
        processed: task.processed,
        ...(item
          ? { item: { trackId: item.trackId, status: item.status, reason: item.reason } }
          : {}),
      })
  }
  prepare(request: AlbumEditPrepareRequest): AlbumEditReply {
    if (
      this.stopping ||
      (this.task &&
        (['preparing', 'running'].includes(this.task.state) ||
          (this.task.state === 'ready' && this.task.expiresAt > Date.now())))
    )
      return { ok: false, reason: 'busy' }
    let ids: number[], title: string
    if (request.retryTaskId && request.album) return { ok: false, reason: 'invalid' }
    if (request.retryTaskId) {
      if (!this.task || this.task.taskId !== request.retryTaskId)
        return { ok: false, reason: 'not-found' }
      ids = this.task.items.filter((item) => item.status === 'failed').map((item) => item.trackId)
      title = this.task.albumTitle
    } else if (request.album) {
      ids = this.albumIds(request.album.title, request.album.artist)
      title = request.album.title
    } else return { ok: false, reason: 'invalid' }
    if (ids.length > 5000) return { ok: false, reason: 'too-many-tracks' }
    if (!ids.length) return { ok: false, reason: 'not-found' }
    this.handles.clear()
    this.cancelRequested = false
    const task: AlbumEditTask = {
      taskId: randomUUID(),
      albumTitle: title,
      state: 'preparing',
      total: ids.length,
      processed: 0,
      expiresAt: Date.now() + 30 * 60 * 1000,
      operations: {},
      skipBlocked: false,
      previewed: false,
      items: ids.map((trackId) => ({ trackId, fileName: String(trackId), status: 'pending' })),
    }
    this.task = task
    const pending: Promise<void> = this.readManifest(task)
      .catch(() => {
        task.state = 'failed'
        this.progress()
      })
      .finally(() => {
        if (this.pending === pending) this.pending = null
      })
    this.pending = pending
    return this.get()
  }
  private async readManifest(task: AlbumEditTask): Promise<void> {
    let cursor = 0
    const read = async () => {
      while (cursor < task.items.length && !this.cancelRequested && !this.stopping) {
        const item = task.items[cursor++]
        try {
          const session = await this.sessions.prepareDetached(item.trackId)
          if (!session) {
            item.status = 'blocked'
            item.reason = 'file-not-found'
          } else {
            item.fileName = session.snapshot.fileSummary?.fileName ?? String(item.trackId)
            item.before = Object.fromEntries(
              [...EDITABLE_TAG_FIELDS, 'year' as const].map((field) => [
                field,
                session.snapshot[field] ?? null,
              ]),
            ) as FileTagValues
            if (session.snapshot.legacyMetadata) {
              item.status = 'blocked'
              item.reason = 'legacy-metadata-unresolved'
            } else if (!session.snapshot.capabilities?.fields.albumTitle) {
              item.status = 'blocked'
              item.reason = 'tag-write-failed'
            } else {
              item.status = 'ready'
              this.handles.set(item.trackId, session)
            }
          }
        } catch (error) {
          item.status = 'blocked'
          item.reason = metadataSaveFailureReason(error) ?? 'save-failed'
        }
        task.processed++
        this.progress(item)
      }
    }
    await Promise.all([read(), read()])
    task.state = this.cancelRequested || this.stopping ? 'cancelled' : 'ready'
    if (task.state === 'cancelled')
      for (const item of task.items)
        if (['pending', 'ready', 'blocked'].includes(item.status)) item.status = 'unexecuted'
    task.processed = 0
    task.expiresAt = Date.now() + 30 * 60 * 1000
    this.progress()
  }
  preview(taskId: string, operations: AlbumEditOperations, skipBlocked: boolean): AlbumEditReply {
    const task = this.task
    if (!task || task.taskId !== taskId) return { ok: false, reason: 'not-found' }
    if (task.state !== 'ready') return { ok: false, reason: 'busy' }
    if (task.expiresAt < Date.now()) return { ok: false, reason: 'expired' }
    try {
      const items = task.items.map((original) => {
        const item = { ...original }
        const handle = this.handles.get(item.trackId)
        if (!handle) return item
        const changes = albumMetadataChanges(handle.snapshot, operations)
        item.changes = changes
        item.after = {
          ...item.before!,
          ...changes,
          year: releaseDateYear(
            Object.hasOwn(changes, 'releaseDate') ? changes.releaseDate! : item.before!.releaseDate,
          ),
        }
        item.status = 'ready'
        delete item.reason
        if (
          changes.releaseDate?.length === 7 &&
          !handle.snapshot.capabilities!.datePrecisions.includes('month')
        ) {
          item.status = 'blocked'
          item.reason = 'unsupported-date-precision'
        }
        return item
      })
      task.items = items
    } catch {
      return { ok: false, reason: 'invalid' }
    }
    task.operations = structuredClone(operations)
    task.skipBlocked = skipBlocked
    task.previewed = true
    return this.get()
  }
  start(taskId: string): AlbumEditReply {
    const task = this.task
    if (!task || task.taskId !== taskId) return { ok: false, reason: 'not-found' }
    if (task.state !== 'ready' || !task.previewed) return { ok: false, reason: 'invalid' }
    if (task.expiresAt < Date.now()) return { ok: false, reason: 'expired' }
    if (!task.skipBlocked && task.items.some((item) => item.status === 'blocked'))
      return { ok: false, reason: 'blocked' }
    task.state = 'running'
    task.processed = 0
    this.cancelRequested = false
    const pending: Promise<void> = this.run(task)
      .catch(() => {
        task.state = 'failed'
        this.progress()
      })
      .finally(() => {
        if (this.pending === pending) this.pending = null
      })
    this.pending = pending
    return this.get()
  }
  private async run(task: AlbumEditTask): Promise<void> {
    for (const item of task.items) {
      if (this.cancelRequested || this.stopping) break
      if (item.status === 'blocked') item.status = 'skipped'
      else {
        try {
          const result = await this.sessions.savePrepared(
            this.handles.get(item.trackId)!,
            item.changes ?? {},
          )
          item.status = result.ok ? 'succeeded' : 'failed'
          if (!result.ok) item.reason = result.reason
        } catch (error) {
          item.status = 'failed'
          item.reason = metadataSaveFailureReason(error) ?? 'save-failed'
        }
      }
      task.processed++
      this.progress(item)
    }
    for (const item of task.items)
      if (item.status === 'ready' || item.status === 'blocked') item.status = 'unexecuted'
    task.state = this.cancelRequested || this.stopping ? 'cancelled' : 'completed'
    this.progress()
  }
  cancel(taskId: string): AlbumEditReply {
    if (!this.task || this.task.taskId !== taskId) return { ok: false, reason: 'not-found' }
    this.cancelRequested = true
    if (this.task.state === 'ready') {
      this.task.state = 'cancelled'
      for (const item of this.task.items)
        if (item.status === 'ready' || item.status === 'blocked') item.status = 'unexecuted'
      this.progress()
    }
    return this.get()
  }
  release(taskId: string): AlbumEditReply {
    if (!this.task || this.task.taskId !== taskId) return { ok: false, reason: 'not-found' }
    if (['preparing', 'running'].includes(this.task.state)) return { ok: false, reason: 'busy' }
    this.task = null
    this.handles.clear()
    return this.get()
  }
  async shutdown(): Promise<void> {
    this.stopping = true
    this.cancelRequested = true
    await this.pending
    this.handles.clear()
  }
}
