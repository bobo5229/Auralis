import { watch, type Stats } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import type { TrackRepository } from '@main/repositories/trackRepository'
import type { MetadataRefreshService } from './metadataRefreshService'
import type {
  ImportResult,
  LibraryIncrementalImportService,
} from '../libraryScan/libraryIncrementalImportService'
import { MetadataWatchService } from './metadataWatchService'
import { getLyricsSidecarFingerprint } from './resolveLyricsForFile'

vi.mock('node:fs', () => ({ watch: vi.fn() }))
vi.mock('node:fs/promises', () => ({ readdir: vi.fn(), stat: vi.fn() }))
vi.mock('./resolveLyricsForFile', () => ({ getLyricsSidecarFingerprint: vi.fn() }))
vi.mock('@main/logging/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
const root = normalize('C:/isolated-recovery')
const path = (name: string) => join(root, name + '.flac')
const fingerprint = {
  size: 10,
  mtimeMs: 1,
  ctimeMs: 1,
  dev: 1,
  ino: 1,
  isFile: () => true,
} as Stats
const services: MetadataWatchService[] = []
function entry(name: string) {
  return { name, isDirectory: () => false, isFile: () => true }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function setup() {
  let configured = [root]
  let error!: (error: Error) => void
  let notify!: (event: string, filename: string) => void
  vi.mocked(watch).mockImplementation((...args: unknown[]) => {
    notify = args[2] as typeof notify
    return {
      close: vi.fn(),
      on: (_event: string, callback: typeof error) => {
        error = callback
      },
    } as unknown as ReturnType<typeof watch>
  })
  vi.mocked(watch).mockImplementationOnce(() => {
    throw new Error('Offline')
  })
  const known = ['unchanged', 'changed', 'lyrics', 'missing'].map((name, id) => ({
    filePath: path(name),
    lyricsSidecarFingerprint: 'same',
    id: id + 1,
  }))
  const query = vi.fn(() => known)
  const missing = vi.fn(() => [4])
  const refresh = vi.fn()
  const isWritingFile = vi.fn<(filePath: string) => boolean>(() => false)
  const imports = vi.fn(
    async (paths: string[]): Promise<ImportResult> => ({
      imported: paths,
      unstable: [],
      failed: [],
    }),
  )
  const service = new MetadataWatchService(
    { list: () => configured.map((path) => ({ path })) } as unknown as LibraryRootRepository,
    {
      getWatchRecoveryTracks: query,
      getExistingFilePaths: (paths: string[]) =>
        new Set(paths.filter((path) => known.some((track) => track.filePath === path))),
      getTrackIdsByPlaybackPath: () => [],
      getFileFingerprintsByFilePaths: (paths: string[]) =>
        new Map(
          paths.map((path) => [
            path,
            { fileSize: 10, fileMtimeMs: 1, fileFingerprint: fingerprint },
          ]),
        ),
      getTrackIdsByFilePaths: (paths: string[]) =>
        known.filter((track) => paths.includes(track.filePath)).map(({ id }) => id),
      markAvailableByFilePaths: () => [],
      markMissingByFilePaths: missing,
    } as unknown as TrackRepository,
    { refreshTracksFromFileChanges: refresh, isWritingFile } as unknown as MetadataRefreshService,
    { importFiles: imports } as unknown as LibraryIncrementalImportService,
    () => {},
  )
  services.push(service)
  service.start()
  return {
    service,
    query,
    imports,
    missing,
    refresh,
    isWritingFile,
    notify: (filename: string) => notify('change', filename),
    fail: () => error(new Error('Disconnected')),
    sync: (paths: string[]) => {
      configured = paths
      service.syncRoots()
    },
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(watch).mockReset()
  vi.mocked(readdir)
    .mockReset()
    .mockResolvedValue(
      ['new', 'unchanged', 'changed', 'lyrics'].map((name) => entry(name + '.flac')) as never,
    )
  vi.mocked(stat)
    .mockReset()
    .mockImplementation(async (value) => {
      if (String(value) === path('missing'))
        throw Object.assign(new Error('Missing'), { code: 'ENOENT' })
      return String(value) === path('changed') ? { ...fingerprint, ctimeMs: 2 } : fingerprint
    })
  vi.mocked(getLyricsSidecarFingerprint)
    .mockReset()
    .mockImplementation(async (value) => (value === path('lyrics') ? 'changed' : 'same'))
})
afterEach(async () => {
  for (const service of services.splice(0)) await service.stop()
  vi.clearAllTimers()
  vi.useRealTimers()
})

it('reconciles new, edited, lyric-only and removed files while skipping unchanged audio', async () => {
  const h = setup()
  await vi.advanceTimersByTimeAsync(1000)
  expect(h.query).toHaveBeenCalledWith(root)
  expect(h.imports).toHaveBeenCalledExactlyOnceWith([path('new')])
  expect(h.refresh).toHaveBeenCalledExactlyOnceWith([2, 3])
  expect(h.missing).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(5000)
  expect(h.missing).toHaveBeenCalledExactlyOnceWith([path('missing')])
})

it('defers recovery through a full scan pause, and cancels it on stop', async () => {
  const h = setup()
  await h.service.pauseFlush()
  await vi.advanceTimersByTimeAsync(1000)
  expect(readdir).not.toHaveBeenCalled()
  h.service.resumeFlush()
  await vi.advanceTimersByTimeAsync(0)
  expect(h.imports).toHaveBeenCalledOnce()
  h.fail()
  await h.service.pauseFlush()
  await vi.advanceTimersByTimeAsync(1000)
  await h.service.stop()
  h.service.resumeFlush()
  await vi.advanceTimersByTimeAsync(60000)
  expect(h.imports).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('defers files owned by a tag save and honors post-save suppression during recovery', async () => {
  const h = setup()
  h.isWritingFile.mockImplementation((value) => value === path('changed'))
  h.service.suppressRefreshForPath(path('lyrics'), 4000)
  await vi.advanceTimersByTimeAsync(1000)
  expect(h.refresh).not.toHaveBeenCalled()
  h.isWritingFile.mockReturnValue(false)
  await vi.advanceTimersByTimeAsync(5000)
  expect(h.refresh.mock.calls.flatMap(([ids]) => ids)).toEqual(expect.arrayContaining([2, 3]))
})

it.each(['pause', 'remove'] as const)(
  'does not commit an inventory completed after %s',
  async (action) => {
    let finish!: (entries: never) => void
    vi.mocked(readdir).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }) as never,
    )
    const h = setup()
    await vi.advanceTimersByTimeAsync(1000)
    let barrier: Promise<void> | undefined
    if (action === 'pause') barrier = h.service.pauseFlush()
    else h.sync([])
    finish([entry('new.flac')] as never)
    await vi.advanceTimersByTimeAsync(0)
    await barrier
    expect(h.query).not.toHaveBeenCalled()
    expect(h.imports).not.toHaveBeenCalled()
    if (action === 'pause') {
      h.service.resumeFlush()
      await vi.advanceTimersByTimeAsync(0)
      expect(h.imports).toHaveBeenCalledOnce()
    }
  },
)

it('limits each recovery import batch for large returning directories', async () => {
  vi.mocked(readdir).mockResolvedValue(
    Array.from({ length: 300 }, (_, id) => entry(`new-${id}.flac`)) as never,
  )
  const h = setup()
  h.query.mockReturnValue([])
  await vi.advanceTimersByTimeAsync(1000)
  expect(h.imports.mock.calls.flatMap(([paths]) => paths)).toHaveLength(300)
  expect(h.imports.mock.calls.every(([paths]) => paths.length <= 128)).toBe(true)
})

it.each(['root', 'child', 'lyrics'] as const)(
  'retries a transient %s read failure without another file event',
  async (failure) => {
    if (failure === 'root') vi.mocked(readdir).mockRejectedValueOnce(new Error('Busy'))
    if (failure === 'lyrics') {
      let failed = false
      vi.mocked(getLyricsSidecarFingerprint).mockImplementation(async (value) => {
        if (value === path('lyrics')) {
          if (!failed) {
            failed = true
            throw new Error('Busy')
          }
          return 'changed'
        }
        return 'same'
      })
    }
    if (failure === 'child') {
      let failed = false
      vi.mocked(readdir).mockImplementation(async (directory) => {
        if (String(directory) === root) return [{ name: 'child', isDirectory: () => true }] as never
        if (!failed) {
          failed = true
          throw new Error('Busy')
        }
        return [entry('new.flac')] as never
      })
    }
    const h = setup()
    await vi.advanceTimersByTimeAsync(1000)
    if (failure === 'lyrics') expect(h.refresh.mock.calls.flatMap(([ids]) => ids)).not.toContain(3)
    else expect(h.imports).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    if (failure === 'lyrics') expect(h.refresh.mock.calls.flatMap(([ids]) => ids)).toContain(3)
    else
      expect(h.imports).toHaveBeenCalledWith([
        failure === 'child' ? join(root, 'child', 'new.flac') : path('new'),
      ])
  },
)

it.each(['pause', 'remove', 'stop'] as const)(
  'cancels a pending inventory retry on %s',
  async (action) => {
    vi.mocked(readdir).mockRejectedValueOnce(new Error('Busy'))
    const h = setup()
    await vi.advanceTimersByTimeAsync(1000)
    if (action === 'pause') await h.service.pauseFlush()
    if (action === 'remove') h.sync([])
    if (action === 'stop') await h.service.stop()
    await vi.advanceTimersByTimeAsync(60000)
    expect(readdir).toHaveBeenCalledOnce()
    expect(h.imports).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    if (action === 'pause') {
      h.service.resumeFlush()
      await vi.advanceTimersByTimeAsync(0)
      expect(h.imports).toHaveBeenCalledWith([path('new')])
    }
  },
)

it.each(['pause', 'remove', 'stop', 'supersede'] as const)(
  'ignores a lyrics fingerprint completed after recovery is interrupted by %s',
  async (action) => {
    const gate = deferred<string>()
    vi.mocked(getLyricsSidecarFingerprint).mockImplementationOnce(() => gate.promise)
    const h = setup()
    await vi.advanceTimersByTimeAsync(1000)
    expect(h.query).toHaveBeenCalledOnce()
    expect(stat).not.toHaveBeenCalled()

    let settled = false
    let barrier: Promise<void> | undefined
    if (action === 'pause' || action === 'stop') {
      barrier = (action === 'pause' ? h.service.pauseFlush() : h.service.stop()).then(() => {
        settled = true
      })
      await Promise.resolve()
      expect(settled).toBe(false)
    } else if (action === 'remove') {
      h.sync([])
    } else {
      h.fail()
      await vi.advanceTimersByTimeAsync(1000)
      expect(h.imports).toHaveBeenCalledOnce()
      expect(h.refresh).toHaveBeenCalledExactlyOnceWith([2, 3])
    }

    gate.resolve('changed')
    await vi.advanceTimersByTimeAsync(0)
    await barrier
    if (action === 'pause' || action === 'stop') expect(settled).toBe(true)
    expect(h.imports).toHaveBeenCalledTimes(action === 'supersede' ? 1 : 0)
    expect(h.refresh).toHaveBeenCalledTimes(action === 'supersede' ? 1 : 0)
    if (action === 'pause') {
      h.service.resumeFlush()
      await vi.advanceTimersByTimeAsync(0)
      expect(h.refresh).toHaveBeenCalledExactlyOnceWith([2, 3])
      expect(h.imports).toHaveBeenCalledOnce()
    }
    await h.service.stop()
    expect(vi.getTimerCount()).toBe(0)
  },
)

it.each(['pause', 'stop'] as const)(
  'drains the active recovery import before %s and does not start the next batch',
  async (action) => {
    vi.mocked(readdir).mockResolvedValue(
      Array.from({ length: 129 }, (_, id) => entry(`new-${id}.flac`)) as never,
    )
    const h = setup()
    h.query.mockReturnValue([])
    const gate = deferred<ImportResult>()
    h.imports.mockReturnValueOnce(gate.promise)
    await vi.advanceTimersByTimeAsync(1000)
    const firstBatch = h.imports.mock.calls[0][0]
    expect(firstBatch).toHaveLength(128)
    let settled = false
    const barrier = (action === 'pause' ? h.service.pauseFlush() : h.service.stop()).then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    gate.resolve({ imported: firstBatch, unstable: [], failed: [] })
    await barrier
    expect(settled).toBe(true)
    expect(h.imports).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    if (action === 'pause') {
      h.service.resumeFlush()
      await vi.advanceTimersByTimeAsync(0)
      expect(h.imports).toHaveBeenLastCalledWith([path('new-128')])
      expect(h.imports.mock.calls.every(([paths]) => paths.length <= 128)).toBe(true)
    } else {
      h.service.resumeFlush()
      await vi.advanceTimersByTimeAsync(60000)
      expect(h.imports).toHaveBeenCalledOnce()
    }
  },
)

it('keeps ordinary watcher events pending when recovery flushes only its selected batch', async () => {
  const inventory = deferred<ReturnType<typeof entry>[]>()
  vi.mocked(readdir).mockReturnValueOnce(inventory.promise as never)
  const h = setup()
  h.query.mockReturnValue([])
  await vi.advanceTimersByTimeAsync(1000)
  h.notify('event.flac')
  inventory.resolve([entry('recovered.flac')])
  await vi.advanceTimersByTimeAsync(0)
  expect(h.imports).toHaveBeenCalledExactlyOnceWith([path('recovered')])
  await vi.advanceTimersByTimeAsync(1199)
  expect(h.imports).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(1)
  expect(h.imports).toHaveBeenNthCalledWith(2, [path('event')])
})

it('defers a watcher event during a recovery import and retains it through the pause barrier', async () => {
  vi.mocked(readdir).mockResolvedValue([entry('new.flac')] as never)
  const h = setup()
  h.query.mockReturnValue([])
  const gate = deferred<ImportResult>()
  h.imports.mockReturnValueOnce(gate.promise)
  await vi.advanceTimersByTimeAsync(1000)
  h.notify('new.flac')
  await vi.advanceTimersByTimeAsync(1200)
  expect(h.imports).toHaveBeenCalledOnce()
  const barrier = h.service.pauseFlush()
  gate.resolve({ imported: [path('new')], unstable: [], failed: [] })
  await barrier
  expect(h.imports).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
  // The resumed inventory no longer reports the path; only its deferred event remains.
  vi.mocked(readdir).mockResolvedValue([])
  h.service.resumeFlush()
  await vi.advanceTimersByTimeAsync(1200)
  expect(h.imports).toHaveBeenNthCalledWith(2, [path('new')])
})

it('backs off failed recovery up to 30 seconds and releases its retry on stop', async () => {
  vi.mocked(readdir).mockRejectedValue(new Error('Busy'))
  const h = setup()
  await vi.advanceTimersByTimeAsync(1000)
  let attempts = 1
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    await vi.advanceTimersByTimeAsync(delay - 1)
    expect(readdir).toHaveBeenCalledTimes(attempts)
    await vi.advanceTimersByTimeAsync(1)
    expect(readdir).toHaveBeenCalledTimes(++attempts)
  }
  await h.service.stop()
  await vi.advanceTimersByTimeAsync(60000)
  expect(readdir).toHaveBeenCalledTimes(attempts)
  expect(vi.getTimerCount()).toBe(0)
})
