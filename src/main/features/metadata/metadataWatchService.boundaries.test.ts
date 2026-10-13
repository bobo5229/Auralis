import { watch, type Stats } from 'node:fs'
import { stat } from 'node:fs/promises'
import { normalize } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import type { TrackRepository } from '@main/repositories/trackRepository'
import type { MetadataRefreshService } from './metadataRefreshService'
import type { LibraryIncrementalImportService } from '../libraryScan/libraryIncrementalImportService'
import { MetadataWatchService } from './metadataWatchService'

vi.mock('node:fs', () => ({ watch: vi.fn() }))
vi.mock('node:fs/promises', () => ({ stat: vi.fn() }))
vi.mock('@main/logging/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const root = normalize('C:/isolated-watch')
const path = normalize(`${root}/sample.flac`)
const fileStat = {
  size: 10,
  mtimeMs: 1,
  isFile: () => true,
} as Stats
const absent = () => Object.assign(new Error('absent'), { code: 'ENOENT' })
const busy = () => Object.assign(new Error('busy'), { code: 'EBUSY' })

function setup() {
  let notify!: (event: string, filename: string) => void
  vi.mocked(watch).mockImplementation((...args: unknown[]) => {
    notify = args[2] as typeof notify
    return { close: vi.fn(), on: vi.fn() } as unknown as ReturnType<typeof watch>
  })
  const markMissing = vi.fn(() => [1])
  const markAvailable = vi.fn((): number[] => [])
  const refresh = vi.fn()
  const send = vi.fn()
  const isWritingFile = vi.fn(() => false)
  const service = new MetadataWatchService(
    { list: () => [{ path: root }] } as unknown as LibraryRootRepository,
    {
      getExistingFilePaths: (paths: string[]) => new Set(paths.filter((p) => p === path)),
      getFileFingerprintsByFilePaths: () => new Map([[path, { fileSize: 10, fileMtimeMs: 1 }]]),
      getTrackIdsByFilePaths: () => [1],
      markMissingByFilePaths: markMissing,
      markAvailableByFilePaths: markAvailable,
    } as unknown as TrackRepository,
    { refreshTracksFromFileChanges: refresh, isWritingFile } as unknown as MetadataRefreshService,
    { importFiles: vi.fn() } as unknown as LibraryIncrementalImportService,
    send,
  )
  service.start()
  return { service, notify, markMissing, markAvailable, refresh, send, isWritingFile }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(watch).mockReset()
  vi.mocked(stat).mockReset().mockResolvedValue(fileStat)
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('metadata watcher component boundaries', () => {
  it('defers transient absence and a pending missing confirmation while a tag save owns the path', async () => {
    const { service, notify, isWritingFile, markMissing, refresh } = setup()
    vi.mocked(stat).mockRejectedValue(absent())
    notify('rename', 'sample.flac')
    await vi.advanceTimersByTimeAsync(1200)
    isWritingFile.mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(markMissing).not.toHaveBeenCalled()
    notify('rename', 'sample.flac')
    await vi.advanceTimersByTimeAsync(6000)
    expect(markMissing).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    vi.mocked(stat).mockResolvedValue(fileStat)
    isWritingFile.mockReturnValue(false)
    await vi.advanceTimersByTimeAsync(6000)
    expect(markMissing).not.toHaveBeenCalled()
    await service.stop()
  })
  it('restores confirmed missing unchanged audio without refreshing or duplicate notifications', async () => {
    vi.mocked(stat).mockRejectedValue(absent())
    const { service, notify, markMissing, markAvailable, refresh, send } = setup()
    notify('rename', 'sample.flac')
    await vi.advanceTimersByTimeAsync(6200)
    expect(markMissing).toHaveBeenCalledExactlyOnceWith([path])
    vi.mocked(stat).mockResolvedValue(fileStat)
    markAvailable.mockReturnValueOnce([1])
    notify('rename', 'sample.flac')
    await vi.advanceTimersByTimeAsync(1200)
    expect(send).toHaveBeenCalledWith('library:changed', {
      reason: 'track-restored',
      trackIds: [1],
      filePaths: [path],
    })
    notify('change', 'sample.flac')
    await vi.advanceTimersByTimeAsync(1200)
    expect(refresh).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(2)
    await service.stop()
  })

  it('keeps a queued restoration when tag-write suppression begins', async () => {
    const { service, notify, markAvailable, refresh, send } = setup()
    markAvailable.mockReturnValueOnce([1])
    notify('rename', 'sample.flac')
    service.suppressRefreshForPath(path)
    await vi.advanceTimersByTimeAsync(1200)
    expect(markAvailable).toHaveBeenCalledExactlyOnceWith([path])
    expect(send).toHaveBeenCalledExactlyOnceWith('library:changed', {
      reason: 'track-restored',
      trackIds: [1],
      filePaths: [path],
    })
    expect(refresh).not.toHaveBeenCalled()
    await service.stop()
  })

  it('ignores a stale missing confirmation after a newer watch batch restores the file', async () => {
    vi.mocked(stat).mockRejectedValue(absent())
    const { service, notify, markMissing, markAvailable, send } = setup()
    notify('rename', 'sample.flac')
    await vi.advanceTimersByTimeAsync(6200)
    expect(markMissing).toHaveBeenCalledOnce()

    let rejectOldStat!: (error: Error) => void
    vi.mocked(stat)
      .mockRejectedValueOnce(absent())
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectOldStat = reject
          }),
      )
      .mockResolvedValue(fileStat)
    notify('rename', 'sample.flac')
    await vi.advanceTimersByTimeAsync(6200)
    markAvailable.mockReturnValueOnce([1])
    notify('rename', 'sample.flac')
    await vi.advanceTimersByTimeAsync(1200)
    expect(send).toHaveBeenCalledTimes(2)
    rejectOldStat(absent())
    await service.pauseFlush()
    expect(markMissing).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledTimes(2)
    await service.stop()
  })

  it('keeps other paths in an in-flight confirmation and clears completed work', async () => {
    const otherPath = normalize(`${root}/other.flac`)
    vi.mocked(stat).mockRejectedValue(absent())
    const { service, notify, markMissing, markAvailable } = setup()
    notify('rename', 'sample.flac')
    notify('rename', 'other.flac')
    await vi.advanceTimersByTimeAsync(1200)
    let rejectOldStat!: (error: Error) => void
    vi.mocked(stat).mockImplementation(async (filePath) => {
      if (filePath === path) {
        return new Promise((_resolve, reject) => {
          rejectOldStat = reject
        })
      }
      throw absent()
    })
    await vi.advanceTimersByTimeAsync(5000)
    vi.mocked(stat).mockResolvedValue(fileStat)
    markAvailable.mockReturnValueOnce([1])
    notify('rename', 'sample.flac')
    await vi.advanceTimersByTimeAsync(1200)
    rejectOldStat(absent())
    await service.pauseFlush()
    expect(markMissing).toHaveBeenCalledExactlyOnceWith([otherPath])
    service.resumeFlush()
    expect(vi.getTimerCount()).toBe(0)
    await service.stop()
  })

  it('restores changed audio while suppression still prevents metadata refresh', async () => {
    vi.mocked(stat).mockResolvedValue({ ...fileStat, size: 20 })
    const { service, notify, markAvailable, refresh, send } = setup()
    markAvailable.mockReturnValueOnce([1])
    service.suppressRefreshForPath(path)
    notify('rename', 'sample.flac')
    await vi.advanceTimersByTimeAsync(1200)
    expect(markAvailable).toHaveBeenCalledExactlyOnceWith([path])
    expect(send).toHaveBeenCalledOnce()
    expect(refresh).not.toHaveBeenCalled()
    await service.stop()
  })

  it('refreshes changed restored audio independently of availability recovery', async () => {
    vi.mocked(stat).mockResolvedValue({ ...fileStat, size: 20 })
    const { service, notify, markAvailable, refresh } = setup()
    markAvailable.mockReturnValueOnce([1])
    notify('rename', 'sample.flac')
    await vi.advanceTimersByTimeAsync(1200)
    expect(markAvailable).toHaveBeenCalledExactlyOnceWith([path])
    expect(refresh).toHaveBeenCalledExactlyOnceWith([1])
    await service.stop()
  })

  it('does not restore a directory at the audio path in either stat phase', async () => {
    vi.mocked(stat).mockResolvedValue({ ...fileStat, isFile: () => false })
    const { service, notify, markAvailable, markMissing, refresh, send } = setup()
    notify('rename', 'sample.flac')
    await vi.advanceTimersByTimeAsync(6200)
    expect(markAvailable).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(markMissing).toHaveBeenCalledExactlyOnceWith([path])
    expect(send).toHaveBeenCalledExactlyOnceWith('library:changed', {
      reason: 'track-missing',
      trackIds: [1],
      filePaths: [path],
    })
    await service.stop()
  })

  it.each(['pause', 'stop'] as const)(
    'respects %s while a returning file stat is active',
    async (action) => {
      let resolveStat!: (value: Awaited<ReturnType<typeof stat>>) => void
      vi.mocked(stat).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStat = resolve
          }),
      )
      const { service, notify, markAvailable, send } = setup()
      markAvailable.mockReturnValueOnce([1])
      notify('rename', 'sample.flac')
      await vi.advanceTimersByTimeAsync(1200)
      let settled = false
      const barrier = (action === 'pause' ? service.pauseFlush() : service.stop()).then(() => {
        settled = true
      })
      await Promise.resolve()
      expect(settled).toBe(false)
      resolveStat(fileStat)
      await barrier
      expect(markAvailable).toHaveBeenCalledTimes(action === 'pause' ? 1 : 0)
      expect(send).toHaveBeenCalledTimes(action === 'pause' ? 1 : 0)
      if (action === 'pause') await service.stop()
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('keeps queued missing confirmation paused until scanning resumes', async () => {
    vi.mocked(stat).mockRejectedValue(absent())
    const { service, notify, markMissing, send } = setup()
    notify('rename', 'sample.flac')
    await vi.advanceTimersByTimeAsync(1200)
    await service.pauseFlush()
    await vi.advanceTimersByTimeAsync(10000)
    expect(markMissing).not.toHaveBeenCalled()
    service.resumeFlush()
    await vi.advanceTimersByTimeAsync(5000)
    expect(markMissing).toHaveBeenCalledExactlyOnceWith([path])
    expect(send).toHaveBeenCalledWith('library:changed', {
      reason: 'track-missing',
      trackIds: [1],
      filePaths: [path],
    })
    await service.stop()
  })

  it.each(['pause', 'stop'] as const)(
    'waits for an active missing confirmation during %s',
    async (action) => {
      let rejectConfirmation!: (error: Error) => void
      vi.mocked(stat)
        .mockRejectedValueOnce(absent())
        .mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              rejectConfirmation = reject
            }),
        )
      const { service, notify, markMissing } = setup()
      notify('rename', 'sample.flac')
      await vi.advanceTimersByTimeAsync(1200)
      await vi.advanceTimersByTimeAsync(5000)
      let settled = false
      const barrier = (action === 'pause' ? service.pauseFlush() : service.stop()).then(() => {
        settled = true
      })
      await Promise.resolve()
      expect(settled).toBe(false)
      rejectConfirmation(absent())
      await barrier
      expect(settled).toBe(true)
      expect(markMissing).toHaveBeenCalledTimes(action === 'pause' ? 1 : 0)
      if (action === 'pause') await service.stop()
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('shares transient stat retry limits across the flush and confirmation phases', async () => {
    for (let index = 0; index < 9; index++) vi.mocked(stat).mockRejectedValueOnce(busy())
    vi.mocked(stat).mockRejectedValueOnce(absent()).mockRejectedValueOnce(busy())
    const { service, notify, markMissing } = setup()
    notify('rename', 'sample.flac')
    await vi.advanceTimersByTimeAsync(1200)
    for (let index = 0; index < 9; index++) await vi.advanceTimersByTimeAsync(3000)
    await vi.advanceTimersByTimeAsync(5000)
    expect(stat).toHaveBeenCalledTimes(11)
    expect(markMissing).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    await service.stop()
  })

  it.each(['lrc', 'ttml', 'TTML'])(
    'refreshes unchanged audio on %s sidecar intent only after tag-write suppression expires',
    async (extension) => {
      const { service, notify, refresh } = setup()
      service.suppressRefreshForPath(path)
      notify('change', `sample.${extension}`)
      await vi.advanceTimersByTimeAsync(1200)
      expect(refresh).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(8000)
      notify('change', `sample.${extension}`)
      await vi.advanceTimersByTimeAsync(1200)
      expect(refresh).toHaveBeenCalledExactlyOnceWith([1])
      await service.stop()
    },
  )
})
