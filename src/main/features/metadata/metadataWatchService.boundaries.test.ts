import { watch } from 'node:fs'
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
const fileStat = { size: 10, mtimeMs: 1 } as Awaited<ReturnType<typeof stat>>
const absent = () => Object.assign(new Error('absent'), { code: 'ENOENT' })
const busy = () => Object.assign(new Error('busy'), { code: 'EBUSY' })

function setup() {
  let notify!: (event: string, filename: string) => void
  vi.mocked(watch).mockImplementation((...args: unknown[]) => {
    notify = args[2] as typeof notify
    return { close: vi.fn(), on: vi.fn() } as unknown as ReturnType<typeof watch>
  })
  const markMissing = vi.fn(() => [1])
  const markAvailable = vi.fn(() => [1])
  const refresh = vi.fn()
  const send = vi.fn()
  const service = new MetadataWatchService(
    { list: () => [{ path: root }] } as unknown as LibraryRootRepository,
    {
      getExistingFilePaths: (paths: string[]) => new Set(paths.filter((p) => p === path)),
      getFileFingerprintsByFilePaths: () => new Map([[path, { fileSize: 10, fileMtimeMs: 1 }]]),
      getTrackIdsByFilePaths: () => [1],
      markMissingByFilePaths: markMissing,
      markAvailableByFilePaths: markAvailable,
    } as unknown as TrackRepository,
    { refreshTracksFromFileChanges: refresh } as unknown as MetadataRefreshService,
    { importFiles: vi.fn() } as unknown as LibraryIncrementalImportService,
    send,
  )
  service.start()
  return { service, notify, markMissing, markAvailable, refresh, send }
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

  it('refreshes unchanged audio on sidecar intent only after tag-write suppression expires', async () => {
    const { service, notify, refresh } = setup()
    service.suppressRefreshForPath(path)
    notify('change', 'sample.lrc')
    await vi.advanceTimersByTimeAsync(1200)
    expect(refresh).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(8000)
    notify('change', 'sample.lrc')
    await vi.advanceTimersByTimeAsync(1200)
    expect(refresh).toHaveBeenCalledExactlyOnceWith([1])
    await service.stop()
  })
})
