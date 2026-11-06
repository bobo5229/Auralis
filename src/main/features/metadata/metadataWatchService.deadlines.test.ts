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
vi.mock('node:fs/promises', () => ({
  stat: vi.fn(async () => ({ size: 10, mtimeMs: 1, isFile: () => true })),
}))
vi.mock('@main/logging/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
let service: MetadataWatchService | undefined
beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(stat).mockClear()
})
afterEach(async () => {
  await service?.stop()
  service = undefined
  vi.useRealTimers()
  vi.clearAllMocks()
})
function fixture() {
  const root = normalize('C:/isolated-music')
  let roots = [root]
  let notify!: (event: string, file: string) => void
  vi.mocked(watch).mockImplementation((...args: unknown[]) => {
    notify = args[2] as typeof notify
    return { close: vi.fn(), on: vi.fn() } as unknown as ReturnType<typeof watch>
  })
  const importFiles = vi.fn(async (paths: string[]) => ({
    imported: paths,
    unstable: [] as string[],
    failed: [],
  }))
  const repo = {
    getExistingFilePaths: vi.fn(() => new Set<string>()),
    getTrackIdsByPlaybackPath: () => [],
    getFilePathById: () => null,
    adoptPlaybackPath: () => false,
    getFileFingerprintsByFilePaths: vi.fn(() => new Map()),
    getTrackIdsByFilePaths: vi.fn<() => number[]>(() => []),
    getWatchRecoveryTracks: vi.fn<() => Array<{ filePath: string }>>(() => []),
    markAvailableByFilePaths: vi.fn(() => []),
  }
  const refresh = vi.fn(() => ({ jobId: 1 }))
  service = new MetadataWatchService(
    { list: () => roots.map((path) => ({ path })) } as unknown as LibraryRootRepository,
    repo as unknown as TrackRepository,
    { refreshTracksFromFileChanges: refresh } as unknown as MetadataRefreshService,
    { importFiles } as unknown as LibraryIncrementalImportService,
    vi.fn(),
  )
  service.start()
  return {
    notify: (file: string) => notify('change', file),
    importFiles,
    repo,
    refresh,
    setRoots: (value: string[]) => {
      roots = value
      service!.syncRoots()
    },
    file: (name: string) => normalize(`C:/isolated-music/${name}`),
  }
}
describe('per-path watcher deadlines', () => {
  it('does not starve a stable path when other paths keep changing', async () => {
    const f = fixture()
    f.notify('a.flac')
    for (let index = 0; index < 7; index++) {
      await vi.advanceTimersByTimeAsync(500)
      f.notify(`other-${index}.flac`)
    }
    expect(f.importFiles).toHaveBeenCalledWith([f.file('a.flac')])
  })
  it('deduplicates a continuously changing path and flushes no later than its 5000ms bound', async () => {
    const f = fixture()
    f.notify('a.flac')
    for (let index = 0; index < 4; index++) {
      await vi.advanceTimersByTimeAsync(1000)
      f.notify('a.flac')
    }
    expect(f.importFiles).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(999)
    expect(f.importFiles).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(f.importFiles).toHaveBeenCalledExactlyOnceWith([f.file('a.flac')])
  })
  it('keeps retry deadlines when the same and unrelated paths receive new events', async () => {
    const f = fixture()
    f.importFiles.mockImplementationOnce(async (paths) => ({
      imported: [],
      unstable: paths,
      failed: [],
    }))
    f.notify('a.flac')
    await vi.advanceTimersByTimeAsync(1200)
    expect(f.importFiles).toHaveBeenCalledExactlyOnceWith([f.file('a.flac')])
    await vi.advanceTimersByTimeAsync(100)
    f.notify('a.flac')
    f.notify('b.flac')
    await vi.advanceTimersByTimeAsync(1200)
    expect(f.importFiles).toHaveBeenCalledTimes(2)
    expect(f.importFiles).toHaveBeenLastCalledWith([f.file('b.flac')])
    f.notify('a.flac')
    await vi.advanceTimersByTimeAsync(1699)
    expect(f.importFiles).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.importFiles).toHaveBeenCalledTimes(3)
    expect(f.importFiles).toHaveBeenLastCalledWith([f.file('a.flac')])
  })
  it('holds deadlines while paused, resumes overdue work, and discards removed roots', async () => {
    const f = fixture()
    f.notify('a.flac')
    await service!.pauseFlush()
    await vi.advanceTimersByTimeAsync(6000)
    expect(f.importFiles).not.toHaveBeenCalled()
    service!.resumeFlush()
    await vi.advanceTimersByTimeAsync(0)
    expect(f.importFiles).toHaveBeenCalledExactlyOnceWith([f.file('a.flac')])
    f.notify('b.flac')
    f.setRoots([])
    await vi.advanceTimersByTimeAsync(6000)
    expect(f.importFiles).toHaveBeenCalledTimes(1)
    await service!.stop()
    await vi.advanceTimersByTimeAsync(6000)
    expect(f.importFiles).toHaveBeenCalledTimes(1)
  })
  it('does not advance a transient stat retry when a new path is observed', async () => {
    const f = fixture()
    vi.mocked(stat).mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }))
    f.notify('a.flac')
    await vi.advanceTimersByTimeAsync(1200)
    expect(stat).toHaveBeenCalledTimes(1)
    f.notify('a.flac')
    f.notify('b.flac')
    await vi.advanceTimersByTimeAsync(1200)
    expect(stat).toHaveBeenCalledTimes(2)
    expect(f.importFiles).toHaveBeenCalledExactlyOnceWith([f.file('b.flac')])
    await vi.advanceTimersByTimeAsync(1799)
    expect(stat).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(stat).toHaveBeenCalledTimes(3)
    expect(f.importFiles).toHaveBeenLastCalledWith([f.file('a.flac')])
  })

  it.each(['a.lrc', 'cover.jpg'])(
    'retains %s refresh intent across a busy refresh retry',
    async (event) => {
      const f = fixture()
      const filePath = f.file('a.flac')
      const fingerprint = { size: 10, mtimeMs: 1, ctimeMs: 1, dev: 1, ino: 1 }
      vi.mocked(stat).mockResolvedValue({ ...fingerprint, isFile: () => true } as Awaited<
        ReturnType<typeof stat>
      >)
      f.repo.getExistingFilePaths.mockReturnValue(new Set([filePath]))
      f.repo.getWatchRecoveryTracks.mockReturnValue([{ filePath }])
      f.repo.getFileFingerprintsByFilePaths.mockReturnValue(
        new Map([[filePath, { fileSize: 10, fileMtimeMs: 1, fileFingerprint: fingerprint }]]),
      )
      f.repo.getTrackIdsByFilePaths.mockReturnValue([1])
      f.refresh.mockImplementationOnce(() => {
        throw new Error('busy')
      })
      f.notify(event)
      await vi.advanceTimersByTimeAsync(1200)
      expect(f.refresh).toHaveBeenCalledTimes(1)
      f.notify(event)
      await vi.advanceTimersByTimeAsync(4999)
      expect(f.refresh).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(f.refresh).toHaveBeenCalledTimes(2)
      expect(f.refresh).toHaveBeenLastCalledWith([1])
    },
  )

  it('limits each ordinary claim to 512 and retains unstarted work across pause', async () => {
    const f = fixture()
    let finish!: () => void
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    vi.mocked(stat).mockImplementation(async () => {
      await gate
      return { size: 10, mtimeMs: 1, isFile: () => true } as Awaited<ReturnType<typeof stat>>
    })
    for (let i = 0; i < 600; i++) f.notify(`track-${i}.flac`)
    await vi.advanceTimersByTimeAsync(1200)
    expect(stat).toHaveBeenCalledTimes(128)
    const pending = (service as unknown as { state: { pendingFilePaths: Map<string, unknown> } })
      .state.pendingFilePaths
    expect(pending.size).toBe(88)
    let paused = false
    const barrier = service!.pauseFlush().then(() => {
      paused = true
    })
    f.notify('extra.flac')
    await Promise.resolve()
    expect(paused).toBe(false)
    finish()
    await barrier
    expect(stat).toHaveBeenCalledTimes(128)
    expect(pending.size).toBe(473)
    vi.mocked(stat).mockResolvedValue({ size: 10, mtimeMs: 1, isFile: () => true } as Awaited<
      ReturnType<typeof stat>
    >)
    service!.resumeFlush()
    await vi.advanceTimersByTimeAsync(1200)
    const imported = f.importFiles.mock.calls.flatMap(([paths]) => paths)
    expect(new Set(imported).size).toBe(601)
    expect(imported).toHaveLength(601)
    expect(f.importFiles.mock.calls.every(([paths]) => paths.length <= 512)).toBe(true)
  })

  it('discards in-flight observations after their root is removed', async () => {
    const f = fixture()
    let finish!: () => void
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    vi.mocked(stat).mockImplementation(async () => {
      await gate
      return { size: 10, mtimeMs: 1, isFile: () => true } as Awaited<ReturnType<typeof stat>>
    })
    for (let i = 0; i < 200; i++) f.notify(`track-${i}.flac`)
    await vi.advanceTimersByTimeAsync(1200)
    expect(stat).toHaveBeenCalledTimes(128)
    f.setRoots([])
    finish()
    await vi.advanceTimersByTimeAsync(6000)
    expect(f.importFiles).not.toHaveBeenCalled()
    expect(stat).toHaveBeenCalledTimes(128)
  })

  it('does not start more stat work after stop and waits for active calls', async () => {
    const f = fixture()
    let finish!: () => void
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    vi.mocked(stat).mockImplementation(async () => {
      await gate
      return { size: 10, mtimeMs: 1, isFile: () => true } as Awaited<ReturnType<typeof stat>>
    })
    for (let i = 0; i < 600; i++) f.notify(`track-${i}.flac`)
    await vi.advanceTimersByTimeAsync(1200)
    expect(stat).toHaveBeenCalledTimes(128)
    let stopped = false
    const barrier = service!.stop().then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)
    finish()
    await barrier
    expect(stat).toHaveBeenCalledTimes(128)
    expect(f.importFiles).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10000)
    expect(stat).toHaveBeenCalledTimes(128)
  })
})
