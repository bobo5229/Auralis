import { watch } from 'node:fs'
import { stat } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import type { TrackRepository } from '@main/repositories/trackRepository'
import type { MetadataRefreshService } from './metadataRefreshService'
import type {
  LibraryIncrementalImportService,
  ImportResult,
} from '../libraryScan/libraryIncrementalImportService'
import { MetadataWatchService } from './metadataWatchService'

vi.mock('node:fs', () => ({ watch: vi.fn() }))
vi.mock('node:fs/promises', () => ({ stat: vi.fn(async () => ({ size: 10, mtimeMs: 1 })) }))
vi.mock('@main/logging/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('metadata watcher shutdown', () => {
  it('waits for an active import and prevents retry timers or watcher restart', async () => {
    vi.useFakeTimers()
    let notify!: (event: string, filename: string) => void
    const watcher = { close: vi.fn(), on: vi.fn() }
    vi.mocked(watch).mockImplementation((...args: unknown[]) => {
      notify = args[2] as typeof notify
      return watcher as unknown as ReturnType<typeof watch>
    })
    let finish!: (result: ImportResult) => void
    const importFiles = vi.fn(
      () =>
        new Promise<ImportResult>((resolve) => {
          finish = resolve
        }),
    )
    const service = new MetadataWatchService(
      { list: () => [{ path: 'C:/isolated-music' }] } as unknown as LibraryRootRepository,
      {
        getExistingFilePaths: () => new Set(),
        getFileFingerprintsByFilePaths: () => new Map(),
      } as unknown as TrackRepository,
      {} as MetadataRefreshService,
      { importFiles } as unknown as LibraryIncrementalImportService,
      vi.fn(),
    )
    service.start()
    notify('rename', 'track.flac')
    await vi.advanceTimersByTimeAsync(1200)
    expect(importFiles).toHaveBeenCalledOnce()
    let stopped = false
    const shutdown = service.stop().then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)
    expect(watcher.close).toHaveBeenCalledOnce()
    finish({ imported: [], failed: [], unstable: ['C:/isolated-music/track.flac'] })
    await shutdown
    const statCalls = vi.mocked(stat).mock.calls.length
    service.resumeFlush()
    service.syncRoots()
    notify('rename', 'late.flac')
    await vi.advanceTimersByTimeAsync(10000)
    expect(watch).toHaveBeenCalledOnce()
    expect(stat).toHaveBeenCalledTimes(statCalls)
    expect(importFiles).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
