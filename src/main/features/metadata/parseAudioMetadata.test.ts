import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseFile, type IAudioMetadata } from 'music-metadata'
import { parseAudioMetadata } from './parseAudioMetadata'
import { normalizeMetadata } from './metadataNormalizer'

vi.mock('music-metadata', () => ({ parseFile: vi.fn() }))
const roots: string[] = []
afterEach(async () => {
  vi.resetAllMocks()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

function parsed(major = 3): IAudioMetadata {
  return {
    format: { trackInfo: [], tagTypes: [] },
    quality: { warnings: [] },
    native: {
      [`ID3v2.${major}`]: [
        { id: major === 2 ? 'TP1' : 'TPE1', value: 'AC' },
        { id: major === 2 ? 'TP1' : 'TPE1', value: 'DC' },
      ],
    },
    common: {
      artist: 'AC',
      artists: ['AC', 'DC'],
      track: { no: null, of: null },
      disk: { no: null, of: null },
      movementIndex: { no: null, of: null },
    },
  }
}

function frame(id: string, text: Buffer, flags = 0) {
  const header = Buffer.alloc(id.length === 3 ? 6 : 10)
  header.write(id, 'ascii')
  header.writeUIntBE(text.length, id.length, id.length === 3 ? 3 : 4)
  if (id.length === 4) header[9] = flags
  return Buffer.concat([header, text])
}

async function fixture(body: Buffer, major = 3, flags = 0, size = body.length) {
  const root = await mkdtemp(join(tmpdir(), 'auralis-id3-text-'))
  roots.push(root)
  const path = join(root, 'text.mp3')
  const header = Buffer.from([
    0x49,
    0x44,
    0x33,
    major,
    0,
    flags,
    (size >>> 21) & 0x7f,
    (size >>> 14) & 0x7f,
    (size >>> 7) & 0x7f,
    size & 0x7f,
  ])
  await writeFile(path, Buffer.concat([header, body]))
  vi.mocked(parseFile).mockResolvedValue(parsed(major))
  return path
}

describe('legacy ID3 text preservation', () => {
  it.each([2, 3])('preserves slash text and repeated frames in ID3v2.%s', async (major) => {
    const id = major === 2 ? 'TP1' : 'TPE1'
    const text = (value: string) => Buffer.concat([Buffer.from([0]), Buffer.from(value)])
    const path = await fixture(
      Buffer.concat([frame(id, text('AC/DC')), frame(id, text('Other'))]),
      major,
    )
    const result = await parseAudioMetadata(path, { skipCovers: true })
    expect(result.common.artists).toEqual(['AC/DC', 'Other'])
    expect(result.native[`ID3v2.${major}`]).toEqual([
      { id, value: 'AC/DC' },
      { id, value: 'Other' },
    ])
    expect(parseFile).toHaveBeenCalledWith(path, { skipCovers: true })
  })

  it('supports UTF-16, NUL data items and tag unsynchronization', async () => {
    const text = Buffer.concat([
      Buffer.from([1, 0xff, 0xfe]),
      Buffer.from('AC/DC\0Other', 'utf16le'),
    ])
    const body = frame('TPE1', text)
    const encoded = Buffer.from(
      Array.from(body).flatMap((byte, index) =>
        byte === 0xff && body[index + 1] === 0xfe ? [0xff, 0] : [byte],
      ),
    )
    const path = await fixture(encoded, 3, 0x80)
    expect((await parseAudioMetadata(path)).common.artists).toEqual(['AC/DC', 'Other'])
  })

  it('supports an extended header and a compressed grouped frame', async () => {
    const text = Buffer.concat([Buffer.from([0]), Buffer.from('AC/DC')])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(text.length)
    const compressed = Buffer.concat([length, Buffer.from([7]), deflateSync(text)])
    const extended = Buffer.from([0, 0, 0, 6, 0, 0, 0, 0, 0, 0])
    const path = await fixture(Buffer.concat([extended, frame('TPE1', compressed, 0xa0)]), 3, 0x40)
    expect((await parseAudioMetadata(path)).common.artists).toEqual(['AC/DC'])
  })

  it('keeps library decoding for legacy values with no literal slash', async () => {
    const path = await fixture(frame('TPE1', Buffer.from([0, 65, 0, 66])))
    const metadata = parsed()
    metadata.common.artists = ['A', 'B']
    vi.mocked(parseFile).mockResolvedValue(metadata)
    expect((await parseAudioMetadata(path)).common.artists).toEqual(['A', 'B'])
  })

  it('rejects a truncated frame instead of accepting guessed values', async () => {
    const body = frame('TPE1', Buffer.from([0, 65, 47, 66]))
    body.writeUInt32BE(100, 4)
    const path = await fixture(body)
    await expect(parseAudioMetadata(path)).rejects.toThrow('Invalid ID3 frame size')
  })

  it('bounds the raw tag read', async () => {
    const path = await fixture(Buffer.alloc(0), 3, 0, 65 * 1024 * 1024)
    await expect(parseAudioMetadata(path)).rejects.toThrow('read limit')
  })
})

describe('ID3v2.3 genre compatibility', () => {
  it.each(['Live;Cantopop', 'Live; Cantopop', ' Live ; Cantopop ; live ; '])(
    'decodes %s in common and native genres without an extra combined label',
    async (value) => {
      const metadata = parsed()
      metadata.native['ID3v2.3'] = [{ id: 'TCON', value }]
      metadata.common.genre = [value]
      vi.mocked(parseFile).mockResolvedValue(metadata)
      const result = await parseAudioMetadata('isolated.mp3')
      expect(normalizeMetadata(result)).toMatchObject({
        genres: ['Live', 'Cantopop'],
        genre: 'Live; Cantopop',
      })
      expect(result.native['ID3v2.3']!.some((tag) => tag.value === 'Live;Cantopop')).toBe(false)
    },
  )

  it.each([2, 4])('keeps bare semicolons in ID3v2.%s genres', async (major) => {
    const metadata = parsed(major)
    metadata.native[`ID3v2.${major}`] = [{ id: major === 2 ? 'TCO' : 'TCON', value: 'A;B' }]
    metadata.common.genre = ['A;B']
    vi.mocked(parseFile).mockResolvedValue(metadata)
    expect(normalizeMetadata(await parseAudioMetadata('isolated.mp3')).genres).toEqual(['A;B'])
  })

  it('preserves other fields and genre sources when a v2.3 TCON is present', async () => {
    const metadata = parsed()
    metadata.native['ID3v2.3'] = [
      { id: 'TCON', value: 'Live;Cantopop' },
      { id: 'TPE1', value: 'A;B' },
      { id: 'TCOM', value: 'C;D' },
    ]
    metadata.native.iTunes = [{ id: '----:com.apple.iTunes:GENRE', value: 'E;F' }]
    metadata.common.artists = ['A;B']
    metadata.common.composer = ['C;D']
    metadata.common.genre = ['Live;Cantopop', 'E;F']
    vi.mocked(parseFile).mockResolvedValue(metadata)
    expect(normalizeMetadata(await parseAudioMetadata('isolated.mp3'))).toMatchObject({
      artists: ['A;B'],
      composers: ['C;D'],
      genres: ['Live', 'Cantopop', 'E;F'],
    })
  })

  it('decodes a restored slash compound and repeated TCON frames', async () => {
    const text = (value: string) => Buffer.concat([Buffer.from([0]), Buffer.from(value)])
    const path = await fixture(
      Buffer.concat([
        frame('TCON', text('R&B/Soul;Hip-Hop/Rap')),
        frame('TCON', text('Live;Cantopop')),
      ]),
    )
    const metadata = parsed()
    metadata.native['ID3v2.3'] = [
      { id: 'TCON', value: 'R&B' },
      { id: 'TCON', value: 'Soul;Hip-Hop' },
      { id: 'TCON', value: 'Rap' },
      { id: 'TCON', value: 'Live;Cantopop' },
    ]
    vi.mocked(parseFile).mockResolvedValue(metadata)
    expect(normalizeMetadata(await parseAudioMetadata(path)).genres).toEqual([
      'R&B/Soul',
      'Hip-Hop/Rap',
      'Live',
      'Cantopop',
    ])
  })
})
