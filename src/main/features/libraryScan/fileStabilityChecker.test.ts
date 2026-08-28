import { stat } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkFileStability } from './fileStabilityChecker'

vi.mock('node:fs/promises', () => ({ stat: vi.fn() }))

const statMock = vi.mocked(stat)
type StatResult = Awaited<ReturnType<typeof stat>>

function fileStat(size: number, mtimeMs: number): StatResult {
  return { size, mtimeMs } as unknown as StatResult
}

describe('checkFileStability', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    statMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports a file as stable when size and mtime do not change', async () => {
    statMock.mockResolvedValue(fileStat(1_024, 100))

    const resultPromise = checkFileStability('C:\\Music\\track.flac')
    await vi.advanceTimersByTimeAsync(800)

    await expect(resultPromise).resolves.toEqual({
      stable: true,
      filePath: 'C:\\Music\\track.flac',
      fileSize: 1_024,
      fileMtimeMs: 100,
    })
  })

  it('reports the latest file values when the file changes', async () => {
    statMock.mockResolvedValueOnce(fileStat(1_024, 100)).mockResolvedValueOnce(fileStat(2_048, 200))

    const resultPromise = checkFileStability('C:\\Music\\track.flac')
    await vi.advanceTimersByTimeAsync(800)

    await expect(resultPromise).resolves.toMatchObject({
      stable: false,
      fileSize: 2_048,
      fileMtimeMs: 200,
    })
  })

  it('fails safely when the file disappears between checks', async () => {
    statMock.mockResolvedValueOnce(fileStat(1_024, 100)).mockRejectedValueOnce({ code: 'ENOENT' })

    const resultPromise = checkFileStability('C:\\Music\\track.flac')
    await vi.advanceTimersByTimeAsync(800)

    await expect(resultPromise).resolves.toEqual({
      stable: false,
      filePath: 'C:\\Music\\track.flac',
      fileSize: 0,
      fileMtimeMs: 0,
    })
  })
})
