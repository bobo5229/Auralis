import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '../../database/schema'
import { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import { parseAudioMetadata } from './parseAudioMetadata'
import { normalizeMetadata } from './metadataNormalizer'
import { verifyWrittenMetadata } from './verifyWrittenMetadata'
import { normalizeEditableMetadata } from './editableMetadataValidation'
import { writeAudioTags } from './audioTagWriteService'
import { formatDelimitedValues, splitDelimitedValues } from '@shared/utils/delimitedValues'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const ffmpegPath = fileURLToPath(new URL('../../../../resources/audio/ffmpeg.exe', import.meta.url))
const roots: string[] = []
const databases: Database.Database[] = []
afterEach(async () => {
  for (const db of databases.splice(0)) db.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function audio(
  extension: string,
  codec: string,
  id3Version = '3',
  genre = 'R&B/Soul; Hip-Hop/Rap',
) {
  const root = await mkdtemp(join(tmpdir(), 'auralis-multivalue-'))
  roots.push(root)
  const path = join(root, `sample.${extension}`)
  await promisify(execFile)(
    ffmpegPath,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=0.08',
      '-c:a',
      codec,
      '-id3v2_version',
      id3Version,
      '-metadata',
      'title=Title',
      '-metadata',
      'album=Album',
      '-metadata',
      'artist=AC/DC; Tyler, The Creator',
      '-metadata',
      'album_artist=First; Second',
      '-metadata',
      `genre=${genre}`,
      '-metadata',
      'composer=A/B; C',
      '-metadata',
      'copyright=Label; Other',
      path,
    ],
    { windowsHide: true },
  )
  return path
}

function atom(name: string, body: Buffer) {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(body.length + 8)
  header.write(name, 4, 4, 'latin1')
  return Buffer.concat([header, body])
}

function addNativeGenres(bytes: Buffer): Buffer {
  const result: Buffer[] = []
  for (let offset = 0; offset + 8 <= bytes.length; ) {
    const size = bytes.readUInt32BE(offset)
    if (size < 8 || offset + size > bytes.length) throw new Error('Invalid test atom')
    const name = bytes.toString('latin1', offset + 4, offset + 8)
    const body = bytes.subarray(offset + 8, offset + size)
    if (name === 'ilst') {
      const freeform = (value: string) =>
        atom(
          '----',
          Buffer.concat([
            atom('mean', Buffer.concat([Buffer.alloc(4), Buffer.from('com.apple.iTunes')])),
            atom('name', Buffer.concat([Buffer.alloc(4), Buffer.from('GENRE')])),
            atom(
              'data',
              Buffer.concat([Buffer.from([0, 0, 0, 1, 0, 0, 0, 0]), Buffer.from(value)]),
            ),
          ]),
        )
      // Keep the other tags; the freeform values add a second source of genre metadata.
      result.push(atom(name, Buffer.concat([body, freeform('Electronic'), freeform('Live')])))
    } else if (['moov', 'udta'].includes(name)) result.push(atom(name, addNativeGenres(body)))
    else if (name === 'meta')
      result.push(
        atom(name, Buffer.concat([body.subarray(0, 4), addNativeGenres(body.subarray(4))])),
      )
    else result.push(bytes.subarray(offset, offset + size))
    offset += size
  }
  return Buffer.concat(result)
}

describe('multi-value metadata file and database flow', () => {
  it.each([
    ['Live;Cantopop', ['Live', 'Cantopop']],
    [' Live ; Cantopop ; live ; ', ['Live', 'Cantopop']],
    ['R&B/Soul;Hip-Hop/Rap', ['R&B/Soul', 'Hip-Hop/Rap']],
    ['(17);Live', ['Rock', 'Live']],
  ])('reads v2.3 TCON %s and stores its separate genres', async (genre, expected) => {
    const filePath = await audio('mp3', 'libmp3lame', '3', genre as string)
    const before = await stat(filePath)
    const parsed = await parseAudioMetadata(filePath, { skipCovers: true })
    const normalized = normalizeMetadata(parsed)
    expect(normalized.genres).toEqual(expected)
    const after = await stat(filePath)
    expect([after.size, after.mtimeMs]).toEqual([before.size, before.mtimeMs])

    const db = new DatabaseCtor(':memory:')
    databases.push(db)
    migrateDatabase(db)
    db.prepare('INSERT INTO tracks (id,file_path,title,genre) VALUES (1,?,?,?)').run(
      filePath,
      'Old',
      genre,
    )
    new MetadataRefreshRepository(db).updateTrackMetadata({
      ...normalized,
      trackId: 1,
      sourceFilePath: filePath,
      fileSize: after.size,
      fileMtimeMs: after.mtimeMs,
      artworkCacheKey: null,
      metadataSignature: 'test',
    })
    const stored = db
      .prepare(
        `SELECT t.genre,tm.genre_display,v.genre AS display
         FROM tracks t JOIN track_metadata tm ON tm.track_id=t.id
         JOIN library_track_display v ON v.id=t.id WHERE t.id=1`,
      )
      .get() as { genre: string; genre_display: string; display: string }
    const canonical = (expected as string[]).join('; ')
    expect(stored).toEqual({ genre: canonical, genre_display: canonical, display: canonical })
    expect(formatDelimitedValues(stored.display)).toBe((expected as string[]).join(' & '))
  })

  it.each([
    ['mp3', 'libmp3lame', '4'],
    ['m4a', 'aac', '3'],
    ['flac', 'flac', '3'],
  ])('preserves bare genre semicolons outside v2.3 in %s, ID3 %s', async (ext, codec, version) => {
    const filePath = await audio(ext!, codec!, version, 'Live;Cantopop')
    expect(normalizeMetadata(await parseAudioMetadata(filePath)).genres).toEqual(['Live;Cantopop'])
  })

  it.each([
    ['mp3', 'libmp3lame', '3'],
    ['mp3', 'libmp3lame', '4'],
    ['m4a', 'aac', '3'],
    ['flac', 'flac', '3'],
  ])('reads, edits and stores %s (%s, ID3 %s) consistently', async (extension, codec, version) => {
    const filePath = await audio(extension!, codec!, version)
    const original = normalizeMetadata(await parseAudioMetadata(filePath, { skipCovers: true }))
    expect(original).toMatchObject({
      artists: ['AC/DC', 'Tyler, The Creator'],
      albumArtists: ['First', 'Second'],
      genres: ['R&B/Soul', 'Hip-Hop/Rap'],
      composers: ['A/B', 'C'],
      copyright: 'Label; Other',
    })
    const edit = normalizeEditableMetadata({
      trackId: 1,
      title: 'Title',
      artistDisplay: ' AC/DC; Tyler, The Creator; ac/dc ',
      albumTitle: 'Album',
      albumArtistDisplay: ' First; Second; first ',
      genreDisplay: 'R&B/Soul; Hip-Hop/Rap; r&b/soul',
      year: null,
      releaseDate: null,
    })
    await writeAudioTags(filePath, edit, ffmpegPath)
    const parsed = await parseAudioMetadata(filePath, { skipCovers: true })
    expect(() => verifyWrittenMetadata(edit, parsed)).not.toThrow()
    const normalized = normalizeMetadata(parsed)
    const fingerprint = await stat(filePath)
    const db = new DatabaseCtor(':memory:')
    databases.push(db)
    migrateDatabase(db)
    db.prepare('INSERT INTO tracks (id,file_path,title) VALUES (1,?,?)').run(filePath, 'Old')
    const repo = new MetadataRefreshRepository(db)
    repo.updateTrackMetadata({
      ...normalized,
      trackId: 1,
      sourceFilePath: filePath,
      fileSize: fingerprint.size,
      fileMtimeMs: fingerprint.mtimeMs,
      artworkCacheKey: null,
      metadataSignature: 'test',
    })
    const stored = db
      .prepare(
        'SELECT artist,album_artist,genre,composer,copyright FROM library_track_display WHERE id=1',
      )
      .get() as {
      artist: string
      album_artist: string
      genre: string
      composer: string
      copyright: string
    }
    expect(stored).toMatchObject({
      artist: edit.artistDisplay,
      album_artist: edit.albumArtistDisplay,
      genre: edit.genreDisplay,
      composer: 'A/B; C',
      copyright: 'Label; Other',
    })
    expect(db.prepare('SELECT genre FROM tracks WHERE id=1').get()).toEqual({
      genre: edit.genreDisplay,
    })
    expect(db.prepare('SELECT genre_display FROM track_metadata WHERE track_id=1').get()).toEqual({
      genre_display: edit.genreDisplay,
    })
    expect(
      db
        .prepare(
          "SELECT a.name FROM track_artists ta JOIN artists a ON a.id=ta.artist_id WHERE ta.track_id=1 AND ta.role='primary' ORDER BY ta.position",
        )
        .all(),
    ).toEqual([{ name: 'AC/DC' }, { name: 'Tyler, The Creator' }])
    expect(splitDelimitedValues(stored.genre)).toEqual(['R&B/Soul', 'Hip-Hop/Rap'])
    expect(formatDelimitedValues(stored.genre)).toBe('R&B/Soul & Hip-Hop/Rap')
    expect(formatDelimitedValues(stored.album_artist)).toBe('First & Second')
  })

  it('reads repeated freeform MP4 genre atoms as independent values', async () => {
    const path = await audio('m4a', 'aac')
    await writeFile(path, addNativeGenres(await readFile(path)))
    const parsed = await parseAudioMetadata(path, { skipCovers: true })
    expect(normalizeMetadata(parsed).genres).toEqual([
      'R&B/Soul',
      'Hip-Hop/Rap',
      'Electronic',
      'Live',
    ])
    const edit = {
      trackId: 1,
      title: 'Title',
      artistDisplay: 'AC/DC; Tyler, The Creator',
      albumTitle: 'Album',
      albumArtistDisplay: 'First; Second',
      genreDisplay: 'R&B/Soul; Hip-Hop/Rap; Electronic; Live',
      year: null,
      releaseDate: null,
    }
    expect(() => verifyWrittenMetadata(edit, parsed)).not.toThrow()
    const changed = { ...edit, genreDisplay: 'New; Other' }
    await writeAudioTags(path, changed, ffmpegPath)
    const rewritten = await parseAudioMetadata(path, { skipCovers: true })
    expect(() => verifyWrittenMetadata(changed, rewritten)).not.toThrow()
    expect(normalizeMetadata(rewritten).genres).toEqual(['New', 'Other'])
  })
})
