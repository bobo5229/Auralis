import { EventEmitter } from 'node:events'
import type { Worker } from 'node:worker_threads'
import { describe, expect, it, vi } from 'vitest'
import { DatabaseWriteAdmission } from '@main/database/databaseWriteAdmission'
import { LibraryScanWorkerHost } from './libraryScanWorkerHost'

class FakeWorker extends EventEmitter {
  terminate = vi.fn(async () => 0)
}
function fixture(gate = new DatabaseWriteAdmission()) {
  const worker = new FakeWorker()
  const onMessage = vi.fn(),
    onFailure = vi.fn(),
    onClear = vi.fn(),
    onEnd = vi.fn()
  let credits!: SharedArrayBuffer
  const host = new LibraryScanWorkerHost(
    (_file, options) => {
      credits = options.workerData.messageCredits
      return worker as unknown as Worker
    },
    { onMessage, onFailure, onClear, onEnd },
    gate,
  )
  host.prepare(1)
  host.start({ jobId: 1, rootPath: 'isolated', knownFiles: [], artworkCacheDir: 'cache' })
  return { gate, worker, host, onMessage, onFailure, onClear, onEnd, credits }
}
const complete = { type: 'complete', payload: { foundFilePaths: [], unreadableDirectoryPaths: [] } }

describe('scan worker admission ordering', () => {
  it('acknowledges a bounded message after admitted processing, including terminal cleanup', async () => {
    const f = fixture()
    const lease = await f.gate.acquireExclusive()
    const count = new Int32Array(f.credits)
    Atomics.sub(count, 0, 1)
    f.worker.emit('message', { type: 'tracks', payload: [], sequence: 1 })
    await new Promise((resolve) => setImmediate(resolve))
    expect(Atomics.load(count, 0)).toBe(15)
    expect(f.onMessage).not.toHaveBeenCalled()
    lease.release()
    await vi.waitFor(() => expect(f.onMessage).toHaveBeenCalledOnce())
    expect(Atomics.load(count, 0)).toBe(16)
    expect(f.onEnd).not.toHaveBeenCalled()
    Atomics.sub(count, 0, 1)
    f.worker.emit('message', { ...complete, sequence: 2 })
    await vi.waitFor(() => expect(f.onMessage).toHaveBeenCalledTimes(2))
    expect(Atomics.load(count, 1)).toBe(1)
    expect(f.onEnd).toHaveBeenCalledOnce()
  })
  it('recovers failure after termination rejects and the worker later exits', async () => {
    const f = fixture(new DatabaseWriteAdmission(1024, 15))
    f.worker.terminate.mockRejectedValue(new Error('stop failed'))
    const lease = await f.gate.acquireExclusive()
    f.worker.emit('message', complete)
    await vi.waitFor(() => expect(f.worker.terminate).toHaveBeenCalled())
    lease.release()
    await new Promise((resolve) => setImmediate(resolve))
    expect(f.host.activeJobId).toBe(1)
    f.worker.emit('message', complete)
    f.worker.emit('exit', 0)
    await vi.waitFor(() => expect(f.host.activeJobId).toBeNull())
    expect(f.onMessage).not.toHaveBeenCalled()
    expect(f.onFailure).toHaveBeenCalledOnce()
    expect(f.onEnd).toHaveBeenCalledOnce()
  })

  it('allows an explicit retry after failure recovery cannot persist a terminal status', async () => {
    const f = fixture(new DatabaseWriteAdmission(1024, 15))
    const lease = await f.gate.acquireExclusive()
    f.worker.emit('message', complete)
    await vi.waitFor(() => expect(f.worker.terminate).toHaveBeenCalledOnce())
    f.onFailure.mockImplementation(() => {
      throw new Error('failure write failed')
    })
    lease.release()
    await vi.waitFor(() => expect(f.onFailure).toHaveBeenCalled())
    expect(f.host.activeJobId).toBe(1)
    await expect(f.host.retryPendingFailure()).rejects.toThrow('failure write failed')
    f.onFailure.mockImplementation(() => undefined)
    await f.host.retryPendingFailure()
    expect(f.host.activeJobId).toBeNull()
    expect(f.onEnd).toHaveBeenCalledOnce()
    expect(f.worker.terminate).toHaveBeenCalledOnce()
  })

  it('stops the worker and persists a timed-out failure when admission resumes', async () => {
    const f = fixture(new DatabaseWriteAdmission(1024, 15))
    const lease = await f.gate.acquireExclusive()
    f.worker.emit('message', complete)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(f.worker.terminate).toHaveBeenCalledOnce()
    expect(f.host.activeJobId).toBe(1)
    expect(f.onMessage).not.toHaveBeenCalled()
    expect(f.onFailure).not.toHaveBeenCalled()
    lease.release()
    await vi.waitFor(() => expect(f.onFailure).toHaveBeenCalledOnce())
    expect(f.onClear).toHaveBeenCalledOnce()
    expect(f.host.activeJobId).toBeNull()
  })
  it('does not let normal worker exit overtake an admitted terminal message', async () => {
    const f = fixture()
    const lease = await f.gate.acquireExclusive()
    f.worker.emit('message', complete)
    f.worker.emit('exit', 0)
    await new Promise((resolve) => setImmediate(resolve))
    expect(f.onMessage).not.toHaveBeenCalled()
    expect(f.onFailure).not.toHaveBeenCalled()
    lease.release()
    await vi.waitFor(() => expect(f.onMessage).toHaveBeenCalledExactlyOnceWith(complete, 1))
    expect(f.onFailure).not.toHaveBeenCalled()
    expect(f.onEnd).toHaveBeenCalledOnce()
  })

  it('drops a queued complete when cancellation successfully terminates its worker', async () => {
    const f = fixture()
    const lease = await f.gate.acquireExclusive()
    f.worker.emit('message', complete)
    await expect(f.host.terminate(1)).resolves.toBe(true)
    lease.release()
    await f.host.finish(1)
    await new Promise((resolve) => setImmediate(resolve))
    expect(f.onMessage).not.toHaveBeenCalled()
    expect(f.onFailure).not.toHaveBeenCalled()
    expect(f.onEnd).toHaveBeenCalledOnce()
  })

  it('replays a deferred complete if termination fails', async () => {
    const f = fixture()
    let rejectTermination!: (error: Error) => void
    f.worker.terminate.mockImplementationOnce(
      () =>
        new Promise<number>((_, reject) => {
          rejectTermination = reject
        }),
    )
    const lease = await f.gate.acquireExclusive()
    f.worker.emit('message', complete)
    const termination = f.host.terminate(1)
    const failure = expect(termination).rejects.toThrow('termination failed')
    lease.release()
    await new Promise((resolve) => setImmediate(resolve))
    expect(f.onMessage).not.toHaveBeenCalled()
    rejectTermination(new Error('termination failed'))
    await failure
    await vi.waitFor(() => expect(f.onMessage).toHaveBeenCalledExactlyOnceWith(complete, 1))
    expect(f.onFailure).not.toHaveBeenCalled()
    expect(f.onEnd).toHaveBeenCalledOnce()
  })
})
