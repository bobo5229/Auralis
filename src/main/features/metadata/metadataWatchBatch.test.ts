import { describe, expect, it, vi } from 'vitest'
import { TrackQueryRepository } from '@main/repositories/trackQueryRepository'
import { MetadataWatchBatch } from './metadataWatchBatch'
import { createMetadataWatchState, observeWatchPath } from './metadataWatchState'
import { MetadataWatchStatBudget } from './metadataWatchStatBudget'

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(async () => ({
    size: 10,
    mtimeMs: 1,
    ctimeMs: 1,
    dev: 1,
    ino: 1,
    isFile: () => true,
  })),
}))
vi.mock('@main/logging/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

function setup(initial: string[], denyAdoption = false) {
  const paths = new Map(initial.map((path, index) => [index + 1, path]))
  const sqlBatchSizes: number[] = []
  const db = {
    prepare: () => ({
      all: (...args: string[]) => {
        sqlBatchSizes.push(args.length)
        const stored = new Set(paths.values())
        return args.filter((path) => stored.has(path)).map((filePath) => ({ filePath }))
      },
    }),
  }
  const queries = new TrackQueryRepository(db as never)
  const canonical = (path: string) => path.replaceAll('\\', '/').toLowerCase()
  const repo = {
    getExistingFilePaths: vi.fn((values: string[]) => queries.getExistingFilePaths(values)),
    getTrackIdsByPlaybackPath: vi.fn((path: string) =>
      [...paths].filter(([, stored]) => canonical(stored) === canonical(path)).map(([id]) => id),
    ),
    getFilePathById: vi.fn((id: number) => paths.get(id) ?? null),
    adoptPlaybackPath: vi.fn((id: number, stored: string, path: string) => {
      if (
        denyAdoption ||
        paths.get(id) !== stored ||
        [...paths].some(([other, value]) => other !== id && value === path)
      )
        return false
      paths.set(id, path)
      return true
    }),
    getFileFingerprintsByFilePaths: vi.fn(() => new Map()),
    getTrackIdsByFilePaths: vi.fn((values: string[]) =>
      [...paths].filter(([, path]) => values.includes(path)).map(([id]) => id),
    ),
  }
  const imported = vi.fn(async () => {})
  const restored = vi.fn()
  const refreshed = vi.fn()
  const state = createMetadataWatchState()
  const batch = new MetadataWatchBatch(state, {
    trackRepository: repo as never,
    statBudget: new MetadataWatchStatBudget(),
    metadataRefreshService: { refreshTracksFromFileChanges: refreshed },
    importQueue: { deferIfInFlight: () => false, importFiles: imported },
    missingConfirmation: { restorePaths: restored, enqueue: vi.fn() },
    isCurrentPath: () => true,
    scheduleFlush: vi.fn(),
  })
  async function run(entries: string[]) {
    for (const path of entries) observeWatchPath(state, path)
    await batch.flushPending(entries)
  }
  return { paths, repo, sqlBatchSizes, restored, refreshed, imported, run }
}
describe('watch batch exact path lookup', () => {
  it('preloads 1000 exact paths in one repository call using 400-parameter SQL batches', async () => {
    const values = Array.from({ length: 1000 }, (_, i) => `C:\\music\\${i}.flac`)
    const f = setup(values)
    await f.run(values)
    expect(f.repo.getExistingFilePaths).toHaveBeenCalledExactlyOnceWith(values)
    expect(f.sqlBatchSizes).toEqual([400, 400, 200])
    expect(f.repo.getTrackIdsByPlaybackPath).not.toHaveBeenCalled()
    expect(f.restored).toHaveBeenCalledWith(values)
    expect(f.imported).not.toHaveBeenCalled()
  })
  it.each([
    ['case-only rename', 'C:\\Music\\song.flac', 'C:\\Music\\Song.FLAC'],
    ['mixed separators', 'C:\\Music\\song.flac', 'C:/Music\\song.flac'],
  ])('adopts %s through the compatibility path', async (_name, stored, observed) => {
    const f = setup([stored])
    await f.run([observed])
    expect(f.repo.adoptPlaybackPath).toHaveBeenCalledExactlyOnceWith(1, stored, observed)
    expect(f.restored).toHaveBeenCalledWith([observed])
    expect(f.imported).not.toHaveBeenCalled()
  })
  it('retains all aliases when the compatibility lookup has multiple matches', async () => {
    const a = 'C:\\Music\\song.flac',
      b = 'C:\\Music\\SONG.flac',
      observed = 'C:\\music\\Song.flac'
    const f = setup([a, b])
    await f.run([observed])
    expect(f.repo.adoptPlaybackPath).not.toHaveBeenCalled()
    expect(f.restored).toHaveBeenCalledWith([a, b])
    expect(f.imported).not.toHaveBeenCalled()
  })
  it('keeps the stored path if adoption fails or the target is occupied', async () => {
    const stored = 'C:\\Music\\song.flac',
      observed = 'C:\\Music\\Song.flac'
    const f = setup([stored], true)
    await f.run([observed])
    expect(f.repo.adoptPlaybackPath).toHaveBeenCalledExactlyOnceWith(1, stored, observed)
    expect(f.restored).toHaveBeenCalledWith([stored])
    expect(f.imported).not.toHaveBeenCalled()
    const occupied = setup([stored, observed])
    await occupied.run([observed])
    expect(occupied.repo.adoptPlaybackPath).not.toHaveBeenCalled()
    expect(occupied.restored).toHaveBeenCalledWith([observed])
  })
  it('updates the batch snapshot after adoption so a later old spelling is resolved again', async () => {
    const stored = 'C:\\Music\\song.flac',
      renamed = 'C:\\Music\\Song.flac'
    const f = setup([stored])
    await f.run([renamed, stored])
    expect(f.repo.getExistingFilePaths).toHaveBeenCalledExactlyOnceWith([renamed, stored])
    expect(f.repo.adoptPlaybackPath.mock.calls).toEqual([
      [1, stored, renamed],
      [1, renamed, stored],
    ])
    expect(f.restored).toHaveBeenCalledWith([renamed, stored])
    expect(f.paths.get(1)).toBe(stored)
    expect(f.imported).not.toHaveBeenCalled()
  })
})
