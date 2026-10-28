import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { migrateDatabase } from '../../database/schema'
import { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import { TrackRepository } from '../../repositories/trackRepository'
import { readStableMetadata, assertMetadataFingerprint } from './readStableMetadata'
import { LibraryScanArtwork } from '../libraryScan/libraryScanArtwork'
import { LibraryScanTrackReader } from '../libraryScan/libraryScanTrackReader'
import { ArtworkCacheGarbageCollector } from '../artwork/artworkCacheGarbageCollector'
import { isCurrentScanSnapshot } from '../libraryScan/libraryScanSnapshot'
import { MetadataWatchService } from './metadataWatchService'
import type { LibraryRootRepository } from '../../repositories/libraryRootRepository'
import type { MetadataRefreshService } from './metadataRefreshService'
import type { LibraryIncrementalImportService } from '../libraryScan/libraryIncrementalImportService'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const fixtures: Array<{ db: Database.Database; root: string }> = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'auralis-independent-metadata-'))
  const path = join(root, 'track.flac')
  execFileSync(
    resolve('resources/audio/ffmpeg.exe'),
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=duration=0.1',
      '-c:a',
      'flac',
      '-metadata',
      'album=Album',
      '-metadata',
      'album_artist=Artist',
      path,
    ],
    { windowsHide: true },
  )
  const db = new DatabaseCtor(':memory:')
  migrateDatabase(db)
  fixtures.push({ db, root })
  db.prepare('INSERT INTO tracks(id,file_path) VALUES(1,?)').run(path)
  const repository = new MetadataRefreshRepository(db),
    tracks = new TrackRepository(db)
  const cover = join(root, 'cover.jpg')
  await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } })
    .jpeg()
    .toFile(cover)
  return { root, path, db, repository, tracks, cover }
}
afterEach(async () => {
  for (const { db, root } of fixtures.splice(0)) {
    db.close()
    if (!root.startsWith(join(tmpdir(), 'auralis-independent-metadata-')))
      throw new Error('Unsafe path')
    await rm(root, { recursive: true, force: true })
  }
})

it('retains the last usable directory cover and leaves a failed conversion retryable', async () => {
  const f = await fixture()
  f.repository.updateTrackMetadata(await readStableMetadata(1, f.path, f.root))
  const previous = f.tracks.getAll()[0].artworkCacheKey
  expect(previous).toBeTruthy()
  await writeFile(f.cover, 'broken jpeg bytes')
  const result = await readStableMetadata(1, f.path, f.root)
  f.repository.updateTrackMetadata(result)
  expect(f.tracks.getAll()[0].artworkCacheKey).toBe(previous)
  expect(f.tracks.getKnownFiles()[0].artworkCheckedFingerprint).toBeNull()
})

it('updates a changed directory cover when scanning an unchanged audio file', async () => {
  const f = await fixture()
  const first = await new LibraryScanTrackReader([], new LibraryScanArtwork(f.root), () => {}).read(
    f.path,
  )
  expect(first.kind).toBe('track')
  if (first.kind !== 'track') throw new Error('Expected scan track')
  f.tracks.upsertMany([first.track])
  const previous = f.tracks.getAll()[0].artworkCacheKey
  await sharp({ create: { width: 4, height: 4, channels: 3, background: 'blue' } })
    .jpeg()
    .toFile(f.cover)
  const second = await new LibraryScanTrackReader(
    f.tracks.getKnownFiles(),
    new LibraryScanArtwork(f.root),
    () => {},
  ).read(f.path)
  expect(second.kind).not.toBe('skip')
  if (second.kind === 'track') f.tracks.upsertMany([second.track])
  if (second.kind === 'artwork') f.tracks.patchAlbumArtwork([second.patch])
  if (second.kind === 'patches' && second.artworkPatch)
    f.tracks.patchAlbumArtwork([second.artworkPatch])
  if (second.kind === 'tags') f.tracks.patchTrackTags([second.patch])
  expect(f.tracks.getAll()[0].artworkCacheKey).not.toBe(previous)
})

it('retains a live fallback album during artwork garbage collection when real album tags are absent', async () => {
  const f = await fixture()
  execFileSync(
    resolve('resources/audio/ffmpeg.exe'),
    ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=duration=0.1', '-c:a', 'flac', f.path],
    { windowsHide: true },
  )
  f.repository.updateTrackMetadata(await readStableMetadata(1, f.path, f.root))
  await mkdir(join(f.root, 'other'))
  const secondPath = join(f.root, 'other', 'second.flac')
  await copyFile(f.path, secondPath)
  f.db.prepare('INSERT INTO tracks(id,file_path) VALUES(2,?)').run(secondPath)
  f.repository.updateTrackMetadata(await readStableMetadata(2, secondPath, f.root))
  const previous = f.tracks.getAll().find((t) => t.id === 2)!.artworkCacheKey
  expect(previous).toBeTruthy()
  expect(
    f.db
      .prepare("SELECT 1 FROM albums WHERE title='Unknown Album' AND artist='Unknown Artist'")
      .get(),
  ).toBeTruthy()
  await new ArtworkCacheGarbageCollector(f.db, f.root).collectGarbage()
  expect(f.tracks.getAll().find((t) => t.id === 2)!.artworkCacheKey).toBe(previous)
})

it('handles directory artwork add, conversion failure, retry and delete through real scans without changing audio', async () => {
  const f = await fixture()
  await rm(f.cover)
  async function scan() {
    const failures: string[] = []
    const result = await new LibraryScanTrackReader(
      f.tracks.getKnownFiles(),
      new LibraryScanArtwork(f.root),
      (_path, reason) => failures.push(reason),
    ).read(f.path)
    expect(failures).toEqual([])
    if (result.kind === 'track') f.tracks.upsertMany([result.track])
    if (result.kind === 'artwork') f.tracks.patchAlbumArtwork([result.patch])
    if (result.kind === 'patches' && result.artworkPatch)
      f.tracks.patchAlbumArtwork([result.artworkPatch])
    if (result.kind === 'patches' && result.lyricsPatch) f.tracks.patchLyrics([result.lyricsPatch])
    if (result.kind === 'tags') {
      f.tracks.patchTrackTags([result.patch])
      if (result.lyricsPatch) f.tracks.patchLyrics([result.lyricsPatch])
    }
    return result
  }
  await scan()
  expect(f.tracks.getAll()[0].artworkCacheKey).toBeNull()
  await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } })
    .jpeg()
    .toFile(f.cover)
  await scan()
  const red = f.tracks.getAll()[0].artworkCacheKey
  expect(red).toBeTruthy()
  await writeFile(f.cover, 'broken jpeg bytes')
  await scan()
  expect(f.tracks.getAll()[0].artworkCacheKey).toBe(red)
  expect(f.tracks.getKnownFiles()[0].artworkCheckedFingerprint).toBeNull()
  await sharp({ create: { width: 4, height: 4, channels: 3, background: 'blue' } })
    .jpeg()
    .toFile(f.cover)
  await scan()
  expect(f.tracks.getAll()[0].artworkCacheKey).not.toBe(red)
  expect(f.tracks.getKnownFiles()[0].artworkCheckedFingerprint).toBeTruthy()
  const stale = await readStableMetadata(1, f.path, f.root)
  await rm(f.cover)
  await expect(assertMetadataFingerprint(stale)).rejects.toThrow('changed')
  expect(isCurrentScanSnapshot({ ...stale, filePath: f.path }, false)).toBe(false)
  await scan()
  expect(f.tracks.getAll()[0].artworkCacheKey).toBeNull()
  expect((await scan()).kind).toBe('skip')
})

it('refreshes directory artwork on real active filesystem events while the audio fingerprint stays unchanged', async () => {
  const f = await fixture()
  f.repository.updateTrackMetadata(await readStableMetadata(1, f.path, f.root))
  const initial = f.tracks.getAll()[0].artworkCacheKey
  const pending = new Set<Promise<void>>()
  const errors: unknown[] = []
  let refreshes = 0
  const watcher = new MetadataWatchService(
    { list: () => [{ path: f.root }] } as unknown as LibraryRootRepository,
    f.tracks,
    {
      isWritingFile: () => false,
      refreshTracksFromFileChanges: (ids: number[]) => {
        const operation = (async () => {
          for (const id of ids)
            f.repository.updateTrackMetadata(await readStableMetadata(id, f.path, f.root))
          refreshes++
        })().catch((error) => {
          errors.push(error)
        })
        pending.add(operation)
        void operation.finally(() => pending.delete(operation))
        return { jobId: refreshes + 1 }
      },
    } as unknown as MetadataRefreshService,
    { importFiles: vi.fn() } as unknown as LibraryIncrementalImportService,
    vi.fn(),
  )
  watcher.start()
  try {
    await sharp({ create: { width: 4, height: 4, channels: 3, background: 'blue' } })
      .jpeg()
      .toFile(f.cover)
    await vi.waitFor(
      () => {
        expect(refreshes).toBeGreaterThan(0)
        expect(f.tracks.getAll()[0].artworkCacheKey).not.toBe(initial)
      },
      { timeout: 8000 },
    )
    const blue = f.tracks.getAll()[0].artworkCacheKey
    const count = refreshes
    await writeFile(f.cover, 'broken jpeg bytes')
    await vi.waitFor(() => expect(refreshes).toBeGreaterThan(count), { timeout: 8000 })
    expect(f.tracks.getAll()[0].artworkCacheKey).toBe(blue)
    await rm(f.cover)
    await vi.waitFor(() => expect(f.tracks.getAll()[0].artworkCacheKey).toBeNull(), {
      timeout: 8000,
    })
    await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } })
      .jpeg()
      .toFile(f.cover)
    await vi.waitFor(() => expect(f.tracks.getAll()[0].artworkCacheKey).toBe(initial), {
      timeout: 8000,
    })
    expect(errors).toEqual([])
  } finally {
    await watcher.stop()
    await Promise.allSettled([...pending])
  }
}, 30000)

it('keeps both raw and legacy album references during garbage collection', async () => {
  const f = await fixture()
  f.repository.updateTrackMetadata(await readStableMetadata(1, f.path, f.root))
  f.db
    .prepare(
      "UPDATE track_metadata SET album_title='Saved Album',album_artist_display='Saved Artist',source='legacy_user_edit',override_mask=127 WHERE track_id=1",
    )
    .run()
  f.db
    .prepare(
      "INSERT INTO albums(title,artist,artwork_cache_key) VALUES('Saved Album','Saved Artist',?)",
    )
    .run(f.tracks.getAll()[0].artworkCacheKey)
  await new ArtworkCacheGarbageCollector(f.db, f.root).collectGarbage()
  expect(
    f.db
      .prepare("SELECT title FROM albums WHERE title IN ('Album','Saved Album') ORDER BY title")
      .pluck()
      .all(),
  ).toEqual(['Album', 'Saved Album'])
})
