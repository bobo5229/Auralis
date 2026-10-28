import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StartupAlbumWorkerHost } from './startupAlbumWorkerHost'

const { workerConstructor } = vi.hoisted(() => ({ workerConstructor: vi.fn() }))
vi.mock('node:worker_threads', () => ({ Worker: workerConstructor }))

class FakeWorker extends EventEmitter {
  terminate = vi.fn().mockResolvedValue(0)
}

let worker: FakeWorker
beforeEach(() => {
  worker = new FakeWorker()
  workerConstructor.mockReset().mockImplementation(() => worker)
})
afterEach(() => vi.useRealTimers())

describe('startup album worker ownership', () => {
  it('passes only the database path and history, and stops the worker before resolving', async () => {
    const host = new StartupAlbumWorkerHost('isolated.sqlite', { workerPath: '/query-worker.js' })
    const history = [{ albumArtist: 'Band', album: 'Previous' }]
    const result = host.getStartupAlbumTracks(history)
    expect(workerConstructor).toHaveBeenCalledWith('/query-worker.js', {
      workerData: { databasePath: 'isolated.sqlite', history },
    })
    const album = { albumArtist: 'Band', album: 'Album', tracks: [] }
    worker.emit('message', { type: 'result', album })
    await expect(result).resolves.toEqual(album)
    expect(worker.terminate).toHaveBeenCalledOnce()
    await host.shutdown()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it.each(['message', 'error', 'exit'] as const)(
    'rejects a worker failure through %s',
    async (event) => {
      const host = new StartupAlbumWorkerHost('isolated.sqlite')
      const result = host.getStartupAlbumTracks()
      const assertion = expect(result).rejects.toThrow(
        event === 'exit' ? 'without a result' : 'query failed',
      )
      if (event === 'message') worker.emit(event, { type: 'error', reason: 'query failed' })
      else if (event === 'error') worker.emit(event, new Error('query failed'))
      else worker.emit(event, 0)
      await assertion
      await host.shutdown()
      expect(worker.terminate).toHaveBeenCalledTimes(event === 'exit' ? 0 : 1)
    },
  )

  it('terminates a timed out query and ignores a late response', async () => {
    vi.useFakeTimers()
    const host = new StartupAlbumWorkerHost('isolated.sqlite', { timeoutMs: 100 })
    const result = host.getStartupAlbumTracks()
    const assertion = expect(result).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(100)
    await assertion
    worker.emit('message', { type: 'result', album: null })
    expect(worker.terminate).toHaveBeenCalledOnce()
    await host.shutdown()
  })

  it('cancels accepted work on shutdown, rejects new work, and awaits termination', async () => {
    const host = new StartupAlbumWorkerHost('isolated.sqlite')
    const result = host.getStartupAlbumTracks()
    const assertion = expect(result).rejects.toThrow('shutdown interrupted')
    let stop!: () => void
    worker.terminate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          stop = resolve
        }),
    )
    let closed = false
    const shutdown = host.shutdown().then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    await expect(host.getStartupAlbumTracks()).rejects.toThrow('shutting down')
    stop()
    await Promise.all([assertion, shutdown])
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('retains ownership after a termination failure so shutdown can retry', async () => {
    const host = new StartupAlbumWorkerHost('isolated.sqlite')
    worker.terminate.mockRejectedValueOnce(new Error('termination failed'))
    const result = host.getStartupAlbumTracks()
    worker.emit('message', { type: 'result', album: null })
    await expect(result).rejects.toThrow('termination failed')
    await host.shutdown()
    expect(worker.terminate).toHaveBeenCalledTimes(2)
  })

  it('does not query an unrelated in-memory database or run overlapping workers', async () => {
    await expect(new StartupAlbumWorkerHost(':memory:').getStartupAlbumTracks()).rejects.toThrow(
      'file database',
    )
    expect(workerConstructor).not.toHaveBeenCalled()
    const host = new StartupAlbumWorkerHost('isolated.sqlite')
    const result = host.getStartupAlbumTracks()
    await expect(host.getStartupAlbumTracks()).rejects.toThrow('already running')
    worker.emit('message', { type: 'result', album: null })
    await expect(result).resolves.toBeNull()
    await host.shutdown()
  })

  it('reports a synchronous worker construction error without retaining a query', async () => {
    const host = new StartupAlbumWorkerHost('isolated.sqlite')
    workerConstructor.mockImplementationOnce(() => {
      throw new Error('cannot start worker')
    })
    await expect(host.getStartupAlbumTracks()).rejects.toThrow('cannot start worker')
    await host.shutdown()
  })
})
