import { watch, type Stats } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import type { TrackRepository } from '@main/repositories/trackRepository'
import type { MetadataRefreshService } from './metadataRefreshService'
import type {
  ImportResult,
  LibraryIncrementalImportService,
} from '../libraryScan/libraryIncrementalImportService'
import { MetadataWatchService } from './metadataWatchService'

vi.mock('node:fs', () => ({ watch: vi.fn() }))
vi.mock('node:fs/promises', () => ({ stat: vi.fn() }))
vi.mock('@main/logging/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const oldRoot = normalize('C:/isolated-root-boundary/old')
const newRoot = normalize('C:/isolated-root-boundary/new')
const fileStat = { size: 10, mtimeMs: 1, isFile: () => true } as Stats
const absent = () => Object.assign(new Error('absent'), { code: 'ENOENT' })
const busy = () => Object.assign(new Error('busy'), { code: 'EBUSY' })
const services: MetadataWatchService[] = []

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function setup(initialRoots = [oldRoot]) {
  let roots = initialRoots
  const watchers: Array<{
    root: string
    notify: (event: string, filename: string) => void
    error: (error: Error) => void
    close: ReturnType<typeof vi.fn>
  }> = []
  vi.mocked(watch).mockImplementation((...args: unknown[]) => {
    const watcher = {
      root: String(args[0]),
      notify: args[2] as (event: string, filename: string) => void,
      error: vi.fn() as (error: Error) => void,
      close: vi.fn(),
      on: (_event: string, callback: (error: Error) => void) => {
        watcher.error = callback
      },
    }
    watchers.push(watcher)
    return watcher as unknown as ReturnType<typeof watch>
  })
  const known = new Set<string>()
  const restored = vi.fn(() => [1])
  const missing = vi.fn(() => [1])
  const refresh = vi.fn()
  const send = vi.fn()
  const importFiles = vi.fn(
    async (paths: string[]): Promise<ImportResult> => ({
      imported: paths,
      failed: [],
      unstable: [],
    }),
  )
  const service = new MetadataWatchService(
    { list: () => roots.map((path) => ({ path })) } as unknown as LibraryRootRepository,
    {
      getExistingFilePaths: (paths: string[]) => new Set(paths.filter((path) => known.has(path))),
      getTrackIdsByPlaybackPath: () => [],
      getFilePathById: () => null,
      adoptPlaybackPath: () => false,
      getFileFingerprintsByFilePaths: (paths: string[]) =>
        new Map(paths.map((path) => [path, { fileSize: 10, fileMtimeMs: 1 }])),
      getTrackIdsByFilePaths: () => [1],
      markAvailableByFilePaths: restored,
      markMissingByFilePaths: missing,
    } as unknown as TrackRepository,
    { refreshTracksFromFileChanges: refresh } as unknown as MetadataRefreshService,
    { importFiles } as unknown as LibraryIncrementalImportService,
    send,
  )
  services.push(service)
  service.start()
  return {
    service,
    watchers,
    known,
    restored,
    missing,
    refresh,
    send,
    importFiles,
    sync: (paths: string[]) => {
      roots = paths
      service.syncRoots()
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(watch).mockReset()
  vi.mocked(stat).mockReset().mockResolvedValue(fileStat)
})

afterEach(async () => {
  for (const service of services.splice(0)) await service.stop()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('metadata watcher root transitions', () => {
  it('drops old known, new and lyric events while accepting new-root work during the pause', async () => {
    const h = setup()
    h.known.add(join(oldRoot, 'known.flac'))
    h.known.add(join(newRoot, 'known.flac'))
    h.watchers[0].notify('change', 'known.lrc')
    h.watchers[0].notify('rename', 'new.flac')
    await h.service.pauseFlush()
    h.sync([newRoot])
    h.watchers[1].notify('rename', 'known.flac')
    h.watchers[1].notify('rename', 'new.flac')
    h.service.resumeFlush()
    await vi.advanceTimersByTimeAsync(1200)
    expect(h.restored).toHaveBeenCalledExactlyOnceWith([join(newRoot, 'known.flac')])
    expect(h.importFiles).toHaveBeenCalledExactlyOnceWith([join(newRoot, 'new.flac')])
    expect(h.refresh).not.toHaveBeenCalled()
    expect(stat).toHaveBeenCalledTimes(2)
  })

  it('rejects late callbacks and errors from a watcher even after the same root is re-added', async () => {
    const h = setup()
    const closed = h.watchers[0]
    h.sync([newRoot])
    h.sync([oldRoot])
    closed.notify('rename', 'stale.flac')
    closed.error(new Error('late error'))
    h.watchers[2].notify('rename', 'current.flac')
    await vi.advanceTimersByTimeAsync(1200)
    expect(closed.close).toHaveBeenCalledOnce()
    expect(h.watchers[2].close).not.toHaveBeenCalled()
    expect(h.importFiles).toHaveBeenCalledExactlyOnceWith([join(oldRoot, 'current.flac')])
  })

  it('retains queued nested-root work across Windows case/separator changes and rejects adjacent prefixes', async () => {
    const h = setup()
    const nested = join(oldRoot, 'Nested')
    const kept = join(nested, 'song.flac')
    h.known.add(kept)
    h.watchers[0].notify('change', 'Nested/song.lrc')
    h.watchers[0].notify('rename', 'Nested-other/song.flac')
    await h.service.pauseFlush()
    h.sync([`${nested.toUpperCase().replaceAll('\\', '/')}/`])
    h.service.resumeFlush()
    await vi.advanceTimersByTimeAsync(1200)
    expect(h.restored).toHaveBeenCalledExactlyOnceWith([kept])
    expect(h.refresh).toHaveBeenCalledExactlyOnceWith([1])
    expect(h.importFiles).not.toHaveBeenCalled()
    expect(stat).toHaveBeenCalledExactlyOnceWith(kept)
  })

  it('accepts names beginning with two dots while rejecting paths escaping the root', async () => {
    const h = setup()
    h.watchers[0].notify('rename', '..song.flac')
    h.watchers[0].notify('rename', '../old-other/song.flac')
    await vi.advanceTimersByTimeAsync(1200)
    expect(h.importFiles).toHaveBeenCalledExactlyOnceWith([join(oldRoot, '..song.flac')])
  })

  it('does not apply a flush stat completed after its root was removed', async () => {
    const gate = deferred<Stats>()
    vi.mocked(stat).mockReturnValueOnce(gate.promise)
    const h = setup()
    h.known.add(join(oldRoot, 'known.flac'))
    h.watchers[0].notify('rename', 'known.flac')
    await vi.advanceTimersByTimeAsync(1200)
    h.sync([newRoot])
    gate.resolve(fileStat)
    await h.service.pauseFlush()
    expect(h.restored).not.toHaveBeenCalled()
    expect(h.refresh).not.toHaveBeenCalled()
    expect(h.importFiles).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('re-observes retained paths instead of applying a stale stat after roots changed', async () => {
    const gate = deferred<Stats>()
    vi.mocked(stat).mockReturnValueOnce(gate.promise)
    const nested = join(oldRoot, 'nested')
    const h = setup()
    h.known.add(join(nested, 'known.flac'))
    h.watchers[0].notify('rename', 'nested/known.flac')
    await vi.advanceTimersByTimeAsync(1200)
    h.sync([nested])
    gate.resolve(fileStat)
    await h.service.pauseFlush()
    expect(h.restored).not.toHaveBeenCalled()
    h.service.resumeFlush()
    await vi.advanceTimersByTimeAsync(1200)
    expect(stat).toHaveBeenCalledTimes(2)
    expect(h.restored).toHaveBeenCalledExactlyOnceWith([join(nested, 'known.flac')])
  })

  it.each([false, true])(
    'discards removed-root missing confirmations (active stat: %s)',
    async (active) => {
      vi.mocked(stat).mockRejectedValue(absent())
      const h = setup()
      h.watchers[0].notify('rename', 'missing.flac')
      await vi.advanceTimersByTimeAsync(1200)
      const gate = deferred<Stats>()
      if (active) {
        vi.mocked(stat).mockReturnValueOnce(gate.promise)
        await vi.advanceTimersByTimeAsync(5000)
      }
      h.sync([newRoot])
      gate.resolve(fileStat)
      await h.service.pauseFlush()
      h.service.resumeFlush()
      await vi.advanceTimersByTimeAsync(10000)
      expect(h.missing).not.toHaveBeenCalled()
      expect(h.restored).not.toHaveBeenCalled()
      h.watchers[1].notify('rename', 'missing.flac')
      await vi.advanceTimersByTimeAsync(6200)
      expect(h.missing).toHaveBeenCalledExactlyOnceWith([join(newRoot, 'missing.flac')])
    },
  )

  it('removes transient stat retries when their root is removed', async () => {
    vi.mocked(stat).mockRejectedValue(busy())
    const h = setup()
    h.watchers[0].notify('rename', 'busy.flac')
    await vi.advanceTimersByTimeAsync(1200)
    for (let index = 0; index < 8; index++) await vi.advanceTimersByTimeAsync(3000)
    h.sync([newRoot])
    await vi.advanceTimersByTimeAsync(10000)
    expect(stat).toHaveBeenCalledTimes(9)
    expect(vi.getTimerCount()).toBe(0)
    h.sync([oldRoot])
    vi.mocked(stat).mockRejectedValueOnce(busy()).mockResolvedValue(fileStat)
    h.watchers[2].notify('rename', 'busy.flac')
    await vi.advanceTimersByTimeAsync(4200)
    expect(h.importFiles).toHaveBeenCalledExactlyOnceWith([join(oldRoot, 'busy.flac')])
  })

  it('resets the unstable import retry budget after a root is removed and re-added', async () => {
    const h = setup()
    const path = join(oldRoot, 'unstable.flac')
    h.importFiles.mockResolvedValue({ imported: [], unstable: [path], failed: [] })
    h.watchers[0].notify('rename', 'unstable.flac')
    await vi.advanceTimersByTimeAsync(1200)
    for (let index = 0; index < 38; index++) await vi.advanceTimersByTimeAsync(3000)
    expect(h.importFiles).toHaveBeenCalledTimes(39)
    h.sync([newRoot])
    await vi.advanceTimersByTimeAsync(10000)
    expect(h.importFiles).toHaveBeenCalledTimes(39)
    h.sync([oldRoot])
    h.importFiles
      .mockResolvedValueOnce({ imported: [], unstable: [path], failed: [] })
      .mockResolvedValue({ imported: [path], unstable: [], failed: [] })
    h.watchers[2].notify('rename', 'unstable.flac')
    await vi.advanceTimersByTimeAsync(4200)
    expect(h.importFiles).toHaveBeenCalledTimes(41)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['imported', 'unstable'] as const)(
    'drains an active import and drops its %s/deferred retries on root transition',
    async (result) => {
      const h = setup()
      const gate = deferred<ImportResult>()
      h.importFiles.mockReturnValueOnce(gate.promise)
      const path = join(oldRoot, 'new.flac')
      h.watchers[0].notify('rename', 'new.flac')
      await vi.advanceTimersByTimeAsync(1200)
      h.watchers[0].notify('rename', 'new.flac')
      await vi.advanceTimersByTimeAsync(1200)
      let paused = false
      const barrier = h.service.pauseFlush().then(() => {
        paused = true
      })
      await Promise.resolve()
      expect(paused).toBe(false)
      gate.resolve({
        imported: result === 'imported' ? [path] : [],
        unstable: result === 'unstable' ? [path] : [],
        failed: [],
      })
      await barrier
      h.sync([newRoot])
      h.service.resumeFlush()
      await vi.advanceTimersByTimeAsync(10000)
      expect(h.importFiles).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
      h.watchers[1].notify('rename', 'new.flac')
      await vi.advanceTimersByTimeAsync(1200)
      expect(h.importFiles).toHaveBeenLastCalledWith([join(newRoot, 'new.flac')])
    },
  )

  it('keeps ordinary full-scan pause events and missing confirmations when roots do not change', async () => {
    vi.mocked(stat).mockRejectedValueOnce(absent())
    const h = setup()
    h.watchers[0].notify('rename', 'missing.flac')
    await vi.advanceTimersByTimeAsync(1200)
    await h.service.pauseFlush()
    h.watchers[0].notify('rename', 'new.flac')
    h.sync([oldRoot.toUpperCase().replaceAll('\\', '/')])
    vi.mocked(stat).mockImplementation(async (path) => {
      if (String(path).endsWith('missing.flac')) throw absent()
      return fileStat
    })
    h.service.resumeFlush()
    await vi.advanceTimersByTimeAsync(6200)
    expect(h.importFiles).toHaveBeenCalledExactlyOnceWith([join(oldRoot, 'new.flac')])
    expect(h.missing).toHaveBeenCalledExactlyOnceWith([join(oldRoot, 'missing.flac')])
    expect(watch).toHaveBeenCalledOnce()
  })
})
