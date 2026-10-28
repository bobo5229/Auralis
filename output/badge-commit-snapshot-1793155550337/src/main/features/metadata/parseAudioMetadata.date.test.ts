import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseAudioMetadata } from './parseAudioMetadata'
import { normalizeMetadata } from './metadataNormalizer'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

function syncSafe(value: number): Buffer {
  return Buffer.from([(value >>> 21) & 127, (value >>> 14) & 127, (value >>> 7) & 127, value & 127])
}

async function fixture(tags: [string, string][], major = 3): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'auralis-id3-date-'))
  roots.push(root)
  const frames = tags.map(([id, value]) => {
    const text = Buffer.concat([Buffer.from([0]), Buffer.from(value, 'latin1')])
    const header = Buffer.alloc(10)
    header.write(id)
    if (major === 4) syncSafe(text.length).copy(header, 4)
    else header.writeUInt32BE(text.length, 4)
    return Buffer.concat([header, text])
  })
  const body = Buffer.concat(frames)
  const audio = Buffer.alloc(417 * 3)
  // Minimal MPEG frames for the real metadata parser; no decoder or user audio is used.
  for (let index = 0; index < 3; index++) Buffer.from([255, 251, 144, 0]).copy(audio, 417 * index)
  const path = join(root, 'date.mp3')
  await writeFile(
    path,
    Buffer.concat([Buffer.from([73, 68, 51, major, 0, 0]), syncSafe(body.length), body, audio]),
  )
  return path
}

describe('ID3v2.3 extended TYER dates with the real parser', () => {
  it.each(['2012-09-30', '2012-09', '2024-02-29', ' 2012-09-30 '])(
    'preserves the date %s through library normalization',
    async (value) => {
      const metadata = await parseAudioMetadata(await fixture([['TYER', value]]), {
        duration: false,
        skipCovers: true,
      })
      expect(normalizeMetadata(metadata)).toMatchObject({
        year: Number(value.trim().slice(0, 4)),
        releaseDate: value.trim(),
      })
      expect(metadata.native['ID3v2.3']).toContainEqual({ id: 'TYER', value })
    },
  )

  it.each(['2012', '2012-13-01', '2012-00-01', '2012-09-31', '2023-02-29', '2012-9-30'])(
    'keeps the year without inventing a date for %s',
    async (value) => {
      const metadata = await parseAudioMetadata(await fixture([['TYER', value]]))
      expect(normalizeMetadata(metadata)).toMatchObject({
        year: Number(value.slice(0, 4)),
        releaseDate: null,
      })
    },
  )

  it('preserves a date already mapped by the parser', async () => {
    const metadata = await parseAudioMetadata(
      await fixture([
        ['TYER', '2012-09-30'],
        ['TDRC', '2020-05-20'],
      ]),
    )
    expect(normalizeMetadata(metadata).releaseDate).toBe('2020-05-20')
  })

  it('keeps standard ID3v2.4 TDRC dates', async () => {
    const metadata = await parseAudioMetadata(await fixture([['TDRC', '2024-05-20']], 4))
    expect(normalizeMetadata(metadata)).toMatchObject({ year: 2024, releaseDate: '2024-05-20' })
  })
})
