import { stat } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import type { Stats } from 'node:fs'
import { MetadataWatchStatBudget } from './metadataWatchStatBudget'
import { MetadataWatchBatch } from './metadataWatchBatch'
import { MetadataWatchRecovery } from './metadataWatchRecovery'
import { MetadataMissingConfirmation } from './metadataMissingConfirmation'
import { getLyricsSidecarFingerprint } from './resolveLyricsForFile'
import { createMetadataWatchState, observeWatchPath } from './metadataWatchState'

vi.mock('node:fs/promises', () => ({ stat: vi.fn() }))
vi.mock('../libraryScan/libraryScanInventory', () => ({ collectAudioFiles: vi.fn(async () => []) }))
vi.mock('@main/logging/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
const fileStat = { size: 1, mtimeMs: 1, ctimeMs: 1, dev: 1, ino: 1, isFile: () => true } as Stats
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('shares 128 active stat slots across ordinary, recovery sidecars and missing confirmations', async () => {
  const gate = deferred()
  let active = 0,
    peak = 0
  vi.mocked(stat).mockImplementation(async (filePath) => {
    active++
    peak = Math.max(peak, active)
    await gate.promise
    active--
    if (String(filePath).includes('ordinary-0.'))
      throw Object.assign(new Error('busy'), { code: 'EBUSY' })
    if (String(filePath).includes('missing-') || String(filePath).endsWith('.lrc'))
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return fileStat
  })
  const ordinary = Array.from({ length: 512 }, (_, i) => `C:\\isolated\\ordinary-${i}.flac`)
  const recovered = Array.from({ length: 600 }, (_, i) => `C:\\isolated\\recovered-${i}.flac`)
  const missing = Array.from({ length: 700 }, (_, i) => `C:\\isolated\\missing-${i}.flac`)
  const state = createMetadataWatchState(),
    budget = new MetadataWatchStatBudget()
  const known = new Set([...ordinary, ...recovered])
  const exact = vi.fn((paths: string[]) => new Set(paths.filter((path) => known.has(path))))
  const marked = vi.fn<(paths: string[]) => number[]>(() => [])
  const repo = {
    getWatchRecoveryTracks: () =>
      recovered.map((filePath) => ({ filePath, lyricsSidecarFingerprint: '[null,null]' })),
    getExistingFilePaths: exact,
    getTrackIdsByPlaybackPath: () => [],
    getFilePathById: () => null,
    adoptPlaybackPath: () => false,
    getFileFingerprintsByFilePaths: () => new Map(),
    getTrackIdsByFilePaths: () => [],
    markAvailableByFilePaths: () => [],
    markMissingByFilePaths: marked,
  }
  const operations: Promise<void>[] = []
  const lifecycle = {
    isStopped: () => state.stopped,
    isPaused: () => state.flushPaused,
    rootsVersion: () => state.rootsVersion,
    isPathActive: () => true,
    runOperation: (operation: () => Promise<void>) => {
      operations.push(operation())
    },
  }
  const confirmation = new MetadataMissingConfirmation(
    repo as never,
    state.statRetries,
    vi.fn(),
    lifecycle,
    budget,
  )
  const batch = new MetadataWatchBatch(state, {
    statBudget: budget,
    trackRepository: repo as never,
    metadataRefreshService: { refreshTracksFromFileChanges: vi.fn() },
    importQueue: { deferIfInFlight: () => false, importFiles: vi.fn(async () => {}) },
    missingConfirmation: confirmation,
    isCurrentPath: () => true,
    scheduleFlush: vi.fn(),
  })
  const recovery = new MetadataWatchRecovery(state, {
    statBudget: budget,
    trackRepository: repo as never,
    runOperation: lifecycle.runOperation,
    flushPending: (paths) => batch.flushPending(paths),
  })
  ordinary.forEach((path) => observeWatchPath(state, path))
  missing.forEach((path) => confirmation.enqueue(path))
  confirmation.pause()
  const ordinaryWork = batch.flushPending(ordinary)
  const confirmWork = (
    confirmation as unknown as { confirmMissing: () => Promise<void> }
  ).confirmMissing()
  recovery.enqueue('C:\\isolated', () => true)
  await vi.waitFor(() => expect(vi.mocked(stat)).toHaveBeenCalledTimes(128))
  expect(active).toBe(128)
  gate.resolve()
  await Promise.all([ordinaryWork, confirmWork, ...operations])
  expect(peak).toBe(128)
  expect(active).toBe(0)
  expect(state.pendingFilePaths.has(ordinary[0])).toBe(true)
  expect(vi.mocked(stat)).toHaveBeenCalledTimes(512 + 700 + 600 * 3)
  expect(exact.mock.calls.every(([paths]) => paths.length <= 512)).toBe(true)
  expect(marked.mock.calls.map(([paths]) => paths.length)).toEqual([512, 188])
  confirmation.pause()
  recovery.clear()
})

it('retains unstarted observations after pause without classifying them missing', async () => {
  const gate = deferred()
  vi.mocked(stat).mockImplementation(async () => {
    await gate.promise
    return fileStat
  })
  const state = createMetadataWatchState(),
    budget = new MetadataWatchStatBudget()
  const paths = Array.from({ length: 512 }, (_, i) => `C:\\isolated\\track-${i}.flac`)
  paths.forEach((path) => observeWatchPath(state, path))
  state.pendingLyricsIntentPaths.add(paths[511])
  state.pendingExplicitRefreshPaths.add(paths[511])
  const missing = vi.fn(),
    imports = vi.fn(async () => {})
  const repo = {
    getExistingFilePaths: () => new Set<string>(),
    getTrackIdsByPlaybackPath: () => [],
    getFileFingerprintsByFilePaths: () => new Map(),
  }
  const batch = new MetadataWatchBatch(state, {
    statBudget: budget,
    trackRepository: repo as never,
    metadataRefreshService: { refreshTracksFromFileChanges: vi.fn() },
    importQueue: { deferIfInFlight: () => false, importFiles: imports },
    missingConfirmation: { restorePaths: vi.fn(), enqueue: missing },
    isCurrentPath: () => true,
    scheduleFlush: vi.fn(),
  })
  const work = batch.flushPending(paths)
  await vi.waitFor(() => expect(vi.mocked(stat)).toHaveBeenCalledTimes(128))
  state.flushPaused = true
  gate.resolve()
  await work
  expect(vi.mocked(stat)).toHaveBeenCalledTimes(128)
  expect(state.pendingFilePaths.size).toBe(384)
  expect(state.pendingLyricsIntentPaths.has(paths[511])).toBe(true)
  expect(state.pendingExplicitRefreshPaths.has(paths[511])).toBe(true)
  expect(imports).toHaveBeenCalledOnce()
  expect(missing).not.toHaveBeenCalled()
})

it('waits for both sidecar stats even when one fails', async () => {
  const gate = deferred()
  const denied = Object.assign(new Error('denied'), { code: 'EACCES' })
  const sidecarStat = vi
    .fn()
    .mockRejectedValueOnce(denied)
    .mockImplementationOnce(async () => {
      await gate.promise
      return fileStat
    })
  let settled = false
  const work = getLyricsSidecarFingerprint('C:\\isolated\\song.flac', sidecarStat).finally(() => {
    settled = true
  })
  await Promise.resolve()
  expect(settled).toBe(false)
  gate.resolve()
  await expect(work).rejects.toBe(denied)
  expect(sidecarStat).toHaveBeenCalledTimes(2)
})

it('preserves unstarted missing confirmations on pause without marking them missing', async () => {
  const gate = deferred()
  vi.mocked(stat).mockImplementation(async () => {
    await gate.promise
    throw Object.assign(new Error('missing'), { code: 'ENOENT' })
  })
  let paused = false
  const budget = new MetadataWatchStatBudget()
  const marked = vi.fn<(paths: string[]) => number[]>(() => [])
  const repo = { markMissingByFilePaths: marked, markAvailableByFilePaths: vi.fn(() => []) }
  const confirmation = new MetadataMissingConfirmation(
    repo as never,
    new Map(),
    vi.fn(),
    {
      isStopped: () => false,
      isPaused: () => paused,
      rootsVersion: () => 0,
      isPathActive: () => true,
      runOperation: vi.fn(),
    },
    budget,
  )
  const paths = Array.from({ length: 200 }, (_, index) => `C:\\isolated\\missing-${index}.flac`)
  paths.forEach((path) => confirmation.enqueue(path))
  confirmation.pause()
  const work = (confirmation as unknown as { confirmMissing: () => Promise<void> }).confirmMissing()
  await vi.waitFor(() => expect(vi.mocked(stat)).toHaveBeenCalledTimes(128))
  paused = true
  gate.resolve()
  await work
  expect(vi.mocked(stat)).toHaveBeenCalledTimes(128)
  expect(marked).toHaveBeenCalledOnce()
  expect(marked.mock.calls[0][0]).toHaveLength(128)
  const pending = (confirmation as unknown as { pendingMissingFilePaths: Map<string, symbol> })
    .pendingMissingFilePaths
  expect(pending.size).toBe(72)
  paused = false
  await (confirmation as unknown as { confirmMissing: () => Promise<void> }).confirmMissing()
  expect(marked).toHaveBeenCalledTimes(2)
  expect(marked.mock.calls[1][0]).toHaveLength(72)
  expect(pending.size).toBe(0)
  confirmation.pause()
})
