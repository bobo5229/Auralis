import { afterEach, describe, expect, it, vi } from 'vitest'
import { AlbumMetadataEditService } from './albumMetadataEditService'
import type { PreparedMetadataEdit } from './metadataEditSessions'
import { metadataEditCapabilities } from './metadataEditCapabilities'
import type { AlbumEditTask } from '@shared/types/albumMetadataEdit'
afterEach(() => vi.restoreAllMocks())
function fixture(ids = [1, 2, 3]) {
  let concurrent = 0,
    maxReads = 0,
    writes = 0,
    maxWrites = 0
  const prepare = vi.fn(async (id: number) => {
    concurrent++
    maxReads = Math.max(maxReads, concurrent)
    await new Promise((resolve) => setTimeout(resolve, 1))
    concurrent--
    return {
      snapshot: {
        trackId: id,
        title: `Track ${id}`,
        artistDisplay: 'Artist',
        albumTitle: 'Album',
        albumArtistDisplay: 'Artist',
        genreDisplay: 'Pop',
        year: null,
        releaseDate: null,
        editToken: `interactive-independent-${id}`,
        capabilities: metadataEditCapabilities('file.flac'),
      },
      path: `${id}.flac`,
      revision: 'original',
      expires: Date.now() + 1800000,
      fingerprint: {},
    } as PreparedMetadataEdit
  })
  const save = vi.fn(async () => {
    writes++
    maxWrites = Math.max(maxWrites, writes)
    await new Promise((resolve) => setTimeout(resolve, 1))
    writes--
    return { ok: true as const }
  })
  const albumIds = vi.fn(() => ids)
  const service = new AlbumMetadataEditService(
    { prepareDetached: prepare, savePrepared: save },
    albumIds,
    vi.fn(),
  )
  const task = () => {
    const result = service.get()
    if (!result.ok || !result.task) throw new Error('No task')
    return result.task
  }
  async function ready() {
    service.prepare({ album: { title: 'Album', artist: 'Artist' } })
    await vi.waitFor(() => expect(task().state).toBe('ready'))
    return task()
  }
  function preview(current: AlbumEditTask) {
    return service.preview(
      current.taskId,
      {
        albumTitle: { mode: 'replace', value: 'Renamed' },
        genreDisplay: { mode: 'add', value: 'Live' },
      },
      false,
    )
  }
  return {
    service,
    prepare,
    save,
    albumIds,
    task,
    ready,
    preview,
    maxReads: () => maxReads,
    maxWrites: () => maxWrites,
  }
}
describe('bounded album edit manifest', () => {
  it('prepares at most two files concurrently, pins targets, and writes one track at a time', async () => {
    const f = fixture()
    const task = await f.ready()
    expect(f.maxReads()).toBe(2)
    f.albumIds.mockReturnValue([9])
    expect(f.preview(task)).toMatchObject({ ok: true })
    expect(f.task().items[0].changes).toEqual({ albumTitle: 'Renamed', genreDisplay: 'Pop; Live' })
    f.service.start(task.taskId)
    await vi.waitFor(() => expect(f.task().state).toBe('completed'))
    expect(
      f.save.mock.calls.map(
        (call) => (call as unknown as [PreparedMetadataEdit])[0].snapshot.trackId,
      ),
    ).toEqual([1, 2, 3])
    expect(f.maxWrites()).toBe(1)
    expect(f.albumIds).toHaveBeenCalledTimes(1)
  })
  it('refuses truncated targets and requires a fresh preview before execution', async () => {
    const f = fixture(Array.from({ length: 5001 }, (_, index) => index + 1))
    expect(f.service.prepare({ album: { title: 'Album', artist: 'Artist' } })).toEqual({
      ok: false,
      reason: 'too-many-tracks',
    })
    expect(f.prepare).not.toHaveBeenCalled()
    const g = fixture()
    const task = await g.ready()
    expect(g.service.start(task.taskId)).toEqual({ ok: false, reason: 'invalid' })
    g.preview(task)
    vi.spyOn(Date, 'now').mockReturnValue(task.expiresAt + 1)
    expect(g.service.start(task.taskId)).toEqual({ ok: false, reason: 'expired' })
  })
  it('reports a per-track failure, continues, and prepares only failed original IDs on retry', async () => {
    const f = fixture()
    const task = await f.ready()
    f.preview(task)
    f.save
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce({ reason: 'metadata-conflict' })
    f.service.start(task.taskId)
    await vi.waitFor(() => expect(f.task().state).toBe('completed'))
    expect(f.task().items.map((item) => item.status)).toEqual(['succeeded', 'failed', 'succeeded'])
    f.service.prepare({ retryTaskId: task.taskId })
    await vi.waitFor(() => expect(f.task().state).toBe('ready'))
    expect(f.task().items.map((item) => item.trackId)).toEqual([2])
    expect(f.albumIds).toHaveBeenCalledTimes(1)
  })
  it('cancels after the active write finishes without executing subsequent tracks', async () => {
    const f = fixture()
    const task = await f.ready()
    f.preview(task)
    let finish!: (value: { ok: true }) => void
    f.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    f.service.start(task.taskId)
    await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1))
    f.service.cancel(task.taskId)
    expect(f.task().state).toBe('running')
    finish({ ok: true })
    await vi.waitFor(() => expect(f.task().state).toBe('cancelled'))
    expect(f.task().items.map((item) => item.status)).toEqual([
      'succeeded',
      'unexecuted',
      'unexecuted',
    ])
    expect(f.save).toHaveBeenCalledTimes(1)
  })
  it('requires an explicit skip choice for blocked tracks and does not write them', async () => {
    const f = fixture()
    f.prepare.mockResolvedValueOnce(null as unknown as PreparedMetadataEdit)
    const task = await f.ready()
    f.preview(task)
    expect(f.service.start(task.taskId)).toEqual({ ok: false, reason: 'blocked' })
    f.service.preview(task.taskId, { albumTitle: { mode: 'clear' } }, true)
    f.service.start(task.taskId)
    await vi.waitFor(() => expect(f.task().state).toBe('completed'))
    expect(f.task().items[0].status).toBe('skipped')
    expect(f.save).toHaveBeenCalledTimes(2)
  })
  it('does not replace a running manifest after its preparation deadline and drains the active file at shutdown', async () => {
    const f = fixture()
    const task = await f.ready()
    f.preview(task)
    let finish!: (value: { ok: true }) => void
    f.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    f.service.start(task.taskId)
    await vi.waitFor(() => expect(f.save).toHaveBeenCalledTimes(1))
    vi.spyOn(Date, 'now').mockReturnValue(task.expiresAt + 1)
    expect(f.service.prepare({ album: { title: 'Other', artist: 'Artist' } })).toEqual({
      ok: false,
      reason: 'busy',
    })
    const shutdown = f.service.shutdown()
    finish({ ok: true })
    await shutdown
    expect(f.task().state).toBe('cancelled')
    expect(f.save).toHaveBeenCalledTimes(1)
  })
})
