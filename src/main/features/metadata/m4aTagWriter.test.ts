import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, basename, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { Mpeg4File, ReadStyle, Mpeg4BoxType, ByteVector, StringType } from 'node-taglib-sharp'
import { prepareAudioTagWrite, writeAudioTags } from './audioTagWriteService'
import { parseAudioMetadata } from './parseAudioMetadata'

const ffmpeg = resolve('resources/audio/ffmpeg.exe')
const edit = {
  trackId: 1,
  title: '改后的标题',
  artistDisplay: 'AC/DC; Artist B',
  albumTitle: '新专辑',
  albumArtistDisplay: 'Album A; Album B',
  genreDisplay: 'R&B/SOUL; Pop',
  year: 1986,
  releaseDate: '1986-01-01',
}
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
function pcmHash(path: string): string {
  return hash(
    execFileSync(ffmpeg, ['-v', 'error', '-i', path, '-map', '0:a:0', '-f', 'f32le', '-'], {
      windowsHide: true,
    }),
  )
}

/** Fixture-only atom reader: check bytes unknown to music-metadata as well. */
function boxes(
  bytes: Buffer,
  start = 0,
  end = bytes.length,
): { id: string; body: Buffer; bytes: Buffer }[] {
  const result: ReturnType<typeof boxes> = []
  for (let offset = start; offset < end; ) {
    let size = bytes.readUInt32BE(offset),
      header = 8
    if (size === 1) {
      size = Number(bytes.readBigUInt64BE(offset + 8))
      header = 16
    }
    if (size === 0) size = end - offset
    if (size < header || offset + size > end) throw new Error('Invalid fixture atom')
    result.push({
      id: bytes.toString('latin1', offset + 4, offset + 8),
      body: bytes.subarray(offset + header, offset + size),
      bytes: bytes.subarray(offset, offset + size),
    })
    offset += size
  }
  return result
}
function ilst(bytes: Buffer): ReturnType<typeof boxes> {
  let level = boxes(bytes)
  for (const id of ['moov', 'udta', 'meta', 'ilst']) {
    const box = level.find((b) => b.id === id)!
    level = boxes(box.body, id === 'meta' ? 4 : 0)
  }
  return level
}

describe('M4A atom writes on isolated AAC and ALAC', () => {
  let directory: string
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'auralis-m4a-tags-'))
  })
  afterAll(async () => {
    if (!directory) return
    if (
      !resolve(directory).startsWith(resolve(tmpdir()) + sep) ||
      !basename(directory).startsWith('auralis-m4a-tags-')
    )
      throw new Error('Unsafe test directory')
    await rm(directory, { recursive: true, force: true })
  })

  it.each([
    ['aac', false],
    ['aac', true],
    ['alac', false],
    ['alac', true],
  ] as const)(
    'preserves media, covers and noneditable atom bytes (%s, faststart %s)',
    async (codec, faststart) => {
      const path = join(directory, `${codec}-${faststart}.m4a`)
      execFileSync(
        ffmpeg,
        [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=731:duration=0.15',
          '-c:a',
          codec,
          ...(faststart ? ['-movflags', '+faststart'] : []),
          '-metadata',
          'title=Before',
          '-metadata',
          'track=2/12',
          '-metadata',
          'disc=1/2',
          '-metadata',
          'composer=Composer',
          '-metadata',
          'lyrics=Retained lyrics',
          path,
        ],
        { windowsHide: true },
      )
      const file = new Mpeg4File(path, ReadStyle.None)
      try {
        const tag = file.tag
        tag.titleSort = 'Sort title'
        tag.albumSort = 'Sort album'
        tag.performersSort = ['Sort artist']
        tag.albumArtistsSort = ['Sort album artist']
        tag.composersSort = ['Sort composer']
        tag.setItunesStrings('com.apple.iTunes', 'ISRC', 'HKA610000691')
        tag.setItunesStrings('com.apple.iTunes', 'UPC', '00602498240427')
        tag.setItunesStrings('example.vendor', 'Private', 'Private one', 'Private two')
        tag.setQuickTimeData(ByteVector.fromString('zzzz', StringType.Latin1), [
          ByteVector.fromString('unknown binary atom', StringType.UTF8),
        ])
        // A small real PNG cover supplied as an existing fixture data box.
        const cover = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=',
          'base64',
        )
        tag.setQuickTimeData(Mpeg4BoxType.COVR, [ByteVector.fromByteArray(cover)], 14)
        tag.setQuickTimeString(Mpeg4BoxType.DAY, '1986-01-01')
        file.save()
      } finally {
        file.dispose()
      }
      const before = await readFile(path),
        beforePcm = pcmHash(path)
      const prepared = await prepareAudioTagWrite(path, edit, ffmpeg)
      expect(await readFile(path)).toEqual(before)
      await prepared.commit()
      await prepared.dispose()
      const after = await readFile(path),
        parsed = await parseAudioMetadata(path)
      expect(parsed.common).toMatchObject({
        title: edit.title,
        album: edit.albumTitle,
        date: edit.releaseDate,
        titlesort: 'Sort title',
        isrc: ['HKA610000691'],
      })
      expect(parsed.common.artists).toEqual(['AC/DC', 'Artist B'])
      expect(parsed.common.genre).toEqual(['R&B/SOUL', 'Pop'])
      const editable = new Set(['©nam', '©ART', '©alb', 'aART', '©gen', 'gnre', '©day'])
      const preserved = (bytes: Buffer) =>
        ilst(bytes)
          .filter((b) => !editable.has(b.id))
          .map((b) => b.bytes.toString('hex'))
          .sort()
      expect(preserved(after)).toEqual(preserved(before))
      expect(
        boxes(after)
          .filter((b) => b.id === 'mdat')
          .map((b) => hash(b.body)),
      ).toEqual(
        boxes(before)
          .filter((b) => b.id === 'mdat')
          .map((b) => hash(b.body)),
      )
      expect(pcmHash(path)).toBe(beforePcm)
      // A larger and then smaller edit exercises offset changes for moov before mdat.
      await writeAudioTags(path, { ...edit, title: 'Long title '.repeat(500) }, ffmpeg)
      expect(pcmHash(path)).toBe(beforePcm)
      await writeAudioTags(
        path,
        {
          ...edit,
          title: null,
          artistDisplay: null,
          albumTitle: null,
          albumArtistDisplay: null,
          genreDisplay: null,
          releaseDate: null,
          year: null,
        },
        ffmpeg,
      )
      expect(pcmHash(path)).toBe(beforePcm)
      const cleared = await parseAudioMetadata(path)
      expect(cleared.common.title).toBeUndefined()
      expect(cleared.common.date).toBeUndefined()
      expect(cleared.common.genre ?? []).toEqual([])
      expect((await readdir(directory)).some((name) => name.includes('.auralis-'))).toBe(false)
    },
  )

  it('cancels an M4A commit if the source changed after preparation', async () => {
    const path = join(directory, 'changed.m4a')
    execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=0.1', path], {
      windowsHide: true,
    })
    const prepared = await prepareAudioTagWrite(path, edit, ffmpeg)
    const { appendFile } = await import('node:fs/promises')
    await appendFile(path, Buffer.from('external edit'))
    const before = await readFile(path),
      fingerprint = await stat(path)
    try {
      await expect(prepared.commit()).rejects.toMatchObject({ reason: 'file-changed' })
    } finally {
      await prepared.dispose()
    }
    expect(await readFile(path)).toEqual(before)
    expect((await stat(path)).mtimeMs).toBe(fingerprint.mtimeMs)
  })

  it('retains an unchanged freeform genre and replaces it only when the genre is edited', async () => {
    const path = join(directory, 'freeform.m4a')
    execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=0.1', path], {
      windowsHide: true,
    })
    const file = new Mpeg4File(path, ReadStyle.None)
    try {
      file.tag.setItunesStrings('com.apple.iTunes', 'GENRE', 'Old genre')
      file.tag.setItunesStrings('com.other', 'GENRE', 'Private value')
      file.save()
    } finally {
      file.dispose()
    }
    await writeAudioTags(path, { ...edit, genreDisplay: 'Old genre; Private value' }, ffmpeg)
    let tags = await parseAudioMetadata(path)
    expect(tags.native.iTunes).toContainEqual({
      id: '----:com.apple.iTunes:GENRE',
      value: 'Old genre',
    })
    // The other vendor's tag is not part of the editable Apple genre and must
    // never be removed. Verification can reject incompatible genre mappings.
    await writeAudioTags(path, { ...edit, genreDisplay: 'New genre; Private value' }, ffmpeg)
    tags = await parseAudioMetadata(path)
    expect(tags.native.iTunes?.some((t) => t.id === '----:com.apple.iTunes:GENRE')).toBe(false)
    expect(tags.native.iTunes).toContainEqual({
      id: '----:com.other:GENRE',
      value: 'Private value',
    })
  })

  it.each(['aac', 'alac'])('updates existing artist aliases in %s', async (codec) => {
    const path = join(directory, `artist-aliases-${codec}.m4a`)
    execFileSync(
      ffmpeg,
      ['-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=0.1', '-c:a', codec, path],
      {
        windowsHide: true,
      },
    )
    const file = new Mpeg4File(path, ReadStyle.None)
    try {
      file.tag.setItunesStrings('com.apple.iTunes', 'ARTISTS', 'Old artist', 'Other artist')
      file.tag.setItunesStrings('com.apple.iTunes', 'ALBUMARTISTS', 'Old album artist')
      file.tag.setItunesStrings('example.vendor', 'ARTISTS', 'Private artist')
      file.tag.setItunesStrings('example.vendor', 'ALBUMARTISTS', 'Private album artist')
      file.tag.setItunesStrings('example.vendor', 'PRIVATE', 'Preserve')
      file.save()
    } finally {
      file.dispose()
    }
    await writeAudioTags(path, edit, ffmpeg)
    const metadata = await parseAudioMetadata(path)
    expect(metadata.native.iTunes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: '----:com.apple.iTunes:ARTISTS', value: 'AC/DC' }),
        expect.objectContaining({ id: '----:com.apple.iTunes:ARTISTS', value: 'Artist B' }),
        expect.objectContaining({ id: '----:com.apple.iTunes:ALBUMARTISTS', value: 'Album A' }),
        expect.objectContaining({ id: '----:com.apple.iTunes:ALBUMARTISTS', value: 'Album B' }),
        expect.objectContaining({ id: '----:example.vendor:PRIVATE', value: 'Preserve' }),
        expect.objectContaining({ id: '----:example.vendor:ARTISTS', value: 'Private artist' }),
        expect.objectContaining({
          id: '----:example.vendor:ALBUMARTISTS',
          value: 'Private album artist',
        }),
      ]),
    )
  })
})
