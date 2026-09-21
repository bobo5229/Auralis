import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stat } from 'node:fs/promises'
import { parseFile } from 'music-metadata'
import { writeArtworkToCache } from '../artwork/artworkCache'
import { readStableMetadata } from './readStableMetadata'

vi.mock('node:fs/promises', () => ({ stat: vi.fn() }))
vi.mock('music-metadata', () => ({ parseFile: vi.fn() }))
vi.mock('../artwork/artworkCache', () => ({ writeArtworkToCache: vi.fn(async () => 'cover.webp') }))
vi.mock('./resolveLyricsForFile', () => ({
  resolveLyricsForFile: vi.fn(async () => ({ text: 'lyrics', format: 'plain' })),
}))

const info = (size: number) =>
  ({ size, mtimeMs: size + 0.25, isFile: () => true }) as Awaited<ReturnType<typeof stat>>
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(stat).mockReset().mockResolvedValue(info(20))
  vi.mocked(parseFile)
    .mockReset()
    .mockResolvedValue({
      format: { duration: 10, trackInfo: [], tagTypes: [] },
      native: {},
      quality: { warnings: [] },
      common: {
        track: { no: null, of: null },
        disk: { no: null, of: null },
        movementIndex: { no: null, of: null },
        title: 'Title',
        artist: 'Artist',
        picture: [{ data: new Uint8Array(2), format: 'image/png' }],
      },
    })
})
describe('stable metadata reading', () => {
  it('returns the fingerprint of a stable full parse', async () => {
    expect(await readStableMetadata(1, 'isolated.flac', 'cache')).toMatchObject({
      sourceFilePath: 'isolated.flac',
      fileSize: 20,
      fileMtimeMs: 20.25,
      title: 'Title',
      lyricsText: 'lyrics',
    })
    expect(parseFile).toHaveBeenCalledOnce()
    expect(writeArtworkToCache).toHaveBeenCalledOnce()
  })
  it('retries one changing read and processes artwork only after a stable parse', async () => {
    vi.mocked(stat).mockResolvedValueOnce(info(10)).mockResolvedValue(info(20))
    expect((await readStableMetadata(1, 'isolated.flac', 'cache')).fileSize).toBe(20)
    expect(parseFile).toHaveBeenCalledTimes(2)
    expect(writeArtworkToCache).toHaveBeenCalledOnce()
  })
  it('fails after two unstable reads without generating a commit result', async () => {
    let counter = 0
    vi.mocked(stat).mockImplementation(async () => info(++counter))
    await expect(readStableMetadata(1, 'isolated.flac', 'cache')).rejects.toThrow('changed')
    expect(parseFile).toHaveBeenCalledTimes(2)
    expect(writeArtworkToCache).not.toHaveBeenCalled()
  })
  it('does not retry disappearance or parse failure', async () => {
    vi.mocked(stat).mockRejectedValueOnce(new Error('ENOENT'))
    await expect(readStableMetadata(1, 'isolated.flac', 'cache')).rejects.toThrow('ENOENT')
    expect(parseFile).not.toHaveBeenCalled()
    vi.mocked(parseFile).mockRejectedValueOnce(new Error('bad tags'))
    await expect(readStableMetadata(1, 'isolated.flac', 'cache')).rejects.toThrow('bad tags')
    expect(parseFile).toHaveBeenCalledOnce()
  })
})
