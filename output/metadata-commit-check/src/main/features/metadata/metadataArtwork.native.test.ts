import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { Mpeg4File, ReadStyle, ByteVector, Mpeg4BoxType } from 'node-taglib-sharp'
import { migrateDatabase } from '../../database/schema'
import { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import { TrackRepository } from '../../repositories/trackRepository'
import { readStableMetadata } from './readStableMetadata'
import { ArtworkCacheGarbageCollector } from '../artwork/artworkCacheGarbageCollector'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const fixtures: Array<{ root: string; db: Database.Database }> = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'auralis-metadata-artwork-'))
  const db = new DatabaseCtor(':memory:')
  migrateDatabase(db)
  fixtures.push({ root, db })
  const metadata = new MetadataRefreshRepository(db),
    tracks = new TrackRepository(db)
  async function setCover(path: string, color: string | null) {
    const bytes = color
      ? await sharp({ create: { width: 4, height: 4, channels: 3, background: color } })
          .png()
          .toBuffer()
      : null
    const file = new Mpeg4File(path, ReadStyle.None)
    try {
      file.tag.setQuickTimeData(
        Mpeg4BoxType.COVR,
        bytes ? [ByteVector.fromByteArray(bytes)] : [],
        14,
      )
      file.save()
    } finally {
      file.dispose()
    }
  }
  async function add(id: number, color: string | null, trackNo: number) {
    const path = join(root, `${id}.m4a`)
    execFileSync(
      resolve('resources/audio/ffmpeg.exe'),
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=731:duration=0.1',
        '-c:a',
        'aac',
        '-metadata',
        'album=Album',
        '-metadata',
        'album_artist=Artist',
        '-metadata',
        `track=${trackNo}`,
        path,
      ],
      { windowsHide: true },
    )
    await setCover(path, color)
    db.prepare('INSERT INTO tracks(id,file_path) VALUES(?,?)').run(id, path)
    const result = await readStableMetadata(id, path, root)
    metadata.updateTrackMetadata(result)
    return { path, result }
  }
  function artwork(id: number) {
    return tracks.getAll().find((track) => track.id === id)!.artworkCacheKey
  }
  return { root, db, metadata, tracks, add, setCover, artwork }
}
afterEach(async () => {
  for (const { root, db } of fixtures.splice(0)) {
    db.close()
    if (!root.startsWith(join(tmpdir(), 'auralis-metadata-artwork-')))
      throw new Error('Unsafe fixture path')
    await rm(root, { recursive: true, force: true })
  }
})

describe('artwork provenance from real MP4 covers', () => {
  it('replaces an existing v2 cover and removes its old cache reference after an explicit absence', async () => {
    const f = await fixture()
    const { path } = await f.add(1, 'red', 1)
    const first = f.artwork(1)
    await f.setCover(path, 'blue')
    f.metadata.updateTrackMetadata(await readStableMetadata(1, path, f.root))
    const second = f.artwork(1)
    expect(second).toMatch(/^v2-/)
    expect(second).not.toBe(first)
    await f.setCover(path, null)
    f.metadata.updateTrackMetadata(await readStableMetadata(1, path, f.root))
    expect(f.artwork(1)).toBeNull()
    const references = new ArtworkCacheGarbageCollector(f.db, f.root).collectReferencedKeys()
    expect(references.has(first!)).toBe(false)
    expect(references.has(second!)).toBe(false)
  })

  it('keeps every embedded cover referenced and chooses the album fallback by track order, including availability changes', async () => {
    const f = await fixture()
    const later = await f.add(1, 'red', 2)
    const earlier = await f.add(2, 'blue', 1)
    await f.add(3, null, 3)
    const red = f.artwork(1),
      blue = f.artwork(2)
    expect(f.artwork(3)).toBe(blue)
    const references = new ArtworkCacheGarbageCollector(f.db, f.root).collectReferencedKeys()
    expect(references.has(red!)).toBe(true)
    expect(references.has(blue!)).toBe(true)
    f.tracks.markMissingByFilePaths([earlier.path])
    expect(f.artwork(3)).toBe(red)
    f.tracks.markAvailableByFilePaths([earlier.path])
    expect(f.artwork(3)).toBe(blue)
    // Commit in the reverse order: representative choice remains stable.
    f.metadata.updateTrackMetadata(await readStableMetadata(1, later.path, f.root))
    expect(f.artwork(3)).toBe(blue)
  })

  it('preserves an available cover on conversion failure and on text-only backfill, then retries its baseline', async () => {
    const f = await fixture()
    const { path, result } = await f.add(1, 'red', 1)
    const key = f.artwork(1)
    f.metadata.updateTrackMetadata({
      ...result,
      artworkRead: { status: 'error' },
      artworkCacheKey: null,
    })
    expect(f.artwork(1)).toBe(key)
    expect(f.tracks.getKnownFiles()[0].artworkCheckedFingerprint).toBeNull()
    f.tracks.patchTrackTags([
      {
        filePath: path,
        fileFingerprint: result.fileFingerprint,
        fileMtimeMs: result.fileMtimeMs,
        title: 'Title',
        artist: 'Artist',
        album: 'Album',
        albumArtist: 'Artist',
        trackNo: 1,
        discNo: 1,
        year: null,
        releaseDate: null,
        copyright: null,
        composer: null,
        genre: null,
        isrc: null,
        metadataSignature: 'test',
        artworkCacheKey: key,
        artworkRead: { status: 'unread' },
      },
    ])
    expect(f.artwork(1)).toBe(key)
    expect(f.tracks.getKnownFiles()[0].artworkCheckedFingerprint).toBeNull()
    f.metadata.updateTrackMetadata(await readStableMetadata(1, path, f.root))
    expect(f.tracks.getKnownFiles()[0].artworkCheckedFingerprint).toBeTruthy()
  })

  it('recomputes old and new album fallbacks when a covered track moves to another album', async () => {
    const f = await fixture()
    const { path } = await f.add(1, 'red', 1)
    await f.add(2, 'blue', 2)
    await f.add(3, null, 3)
    const red = f.artwork(1),
      blue = f.artwork(2)
    expect(f.artwork(3)).toBe(red)
    const file = new Mpeg4File(path, ReadStyle.None)
    try {
      file.tag.album = 'Another Album'
      file.save()
    } finally {
      file.dispose()
    }
    f.metadata.updateTrackMetadata(await readStableMetadata(1, path, f.root))
    expect(f.artwork(1)).toBe(red)
    expect(f.artwork(3)).toBe(blue)
    expect(
      f.db
        .prepare("SELECT artwork_cache_key FROM albums WHERE title='Another Album'")
        .pluck()
        .get(),
    ).toBe(red)
  })
})
