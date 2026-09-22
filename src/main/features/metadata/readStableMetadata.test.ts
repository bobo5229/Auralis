import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stat } from 'node:fs/promises'
import { parseFile } from 'music-metadata'
import { writeArtworkToCache } from '../artwork/artworkCache'
import { readStableMetadata } from './readStableMetadata'
import { verifyWrittenMetadata } from './verifyWrittenMetadata'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'

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
  it('does not serialize or return raw tag snapshots for ordinary refreshes', async () => {
    const metadata = await parseFile('fixture')
    const serialize = vi.fn(() => ({}))
    metadata.native = { ID3v2: [{ id: 'TXXX', value: { toJSON: serialize } }] }
    vi.mocked(parseFile).mockResolvedValue(metadata)
    const result = await readStableMetadata(1, 'isolated.flac', 'cache')
    expect(serialize).not.toHaveBeenCalled()
    expect(result).not.toHaveProperty('rawCommonJson')
    expect(result).not.toHaveProperty('rawNativeJson')
  })

  it('verifies actual tags including ID3v2.3 dates and rejects mismatched edits', async () => {
    const metadata = await parseFile('fixture')
    metadata.common.year = 2026
    metadata.native = { 'ID3v2.3': [{ id: 'TDAT', value: '2209' }] }
    vi.mocked(parseFile).mockResolvedValue(metadata)
    const edit: EditableTrackMetadata = {
      trackId: 1,
      title: 'Title',
      artistDisplay: 'Artist',
      albumTitle: null,
      albumArtistDisplay: null,
      genreDisplay: null,
      year: 2026,
      releaseDate: '2026-09-22',
    }
    const verify = vi.fn((actual) => verifyWrittenMetadata(edit, actual))
    await readStableMetadata(1, 'isolated.flac', 'cache', verify)
    expect(verify).toHaveBeenCalledWith(metadata)
    edit.title = 'Different title'
    await expect(readStableMetadata(1, 'isolated.flac', 'cache', verify)).rejects.toThrow(
      'Written audio tags do not match',
    )
    // Display normalization supplies a filename fallback, but validation must see missing tags.
    delete metadata.common.title
    edit.title = null
    await expect(readStableMetadata(1, 'isolated.flac', 'cache', verify)).resolves.toBeDefined()
  })

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
