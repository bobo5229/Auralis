import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../../database/schema'
import { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import { TrackRepository } from '../../repositories/trackRepository'
import { MetadataRefreshService } from './metadataRefreshService'
import { readStableMetadata } from './readStableMetadata'
import { parseAudioMetadata } from './parseAudioMetadata'
import { createMetadataRefreshEvents } from '../../ipc/metadataRefreshEvents'
import { MetadataSaveError } from './metadataSaveError'
import type { ScannedTrack } from '@shared/types/libraryScan'
import { resolveGenres } from './metadataNormalizer'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const ffmpeg = resolve('resources/audio/ffmpeg.exe')
const fixtures: Array<{ db: Database.Database; root: string; service: MetadataRefreshService }> = []
async function fixture(title?: string) {
  const root = await mkdtemp(join(tmpdir(), 'auralis-metadata-system-'))
  const path = join(root, 'untagged.flac')
  execFileSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=731:duration=0.1',
      '-c:a',
      'flac',
      ...(title ? ['-metadata', `title=${title}`] : []),
      path,
    ],
    { windowsHide: true },
  )
  const db = new DatabaseCtor(':memory:')
  migrateDatabase(db)
  db.prepare('INSERT INTO tracks(id,file_path) VALUES(1,?)').run(path)
  const repository = new MetadataRefreshRepository(db)
  await repository.updateTrackMetadata(await readStableMetadata(1, path, root))
  const send = vi.fn()
  const service = new MetadataRefreshService(
    repository,
    root,
    createMetadataRefreshEvents(send),
    ffmpeg,
  )
  fixtures.push({ db, root, service })
  return { db, root, path, repository, service, send, tracks: new TrackRepository(db) }
}
afterEach(async () => {
  vi.restoreAllMocks()
  for (const { db, root, service } of fixtures.splice(0)) {
    await service.shutdown()
    db.close()
    if (!root.startsWith(join(tmpdir(), 'auralis-metadata-system-')))
      throw new Error('Unsafe fixture path')
    await rm(root, { recursive: true, force: true })
  }
})

describe('file-authoritative metadata edits on isolated music', () => {
  it('keeps missing tags absent while editing only genre, and keeps filename fallback out of storage', async () => {
    const f = await fixture()
    const snapshot = (await f.service.getTrackEditSnapshot(1))!
    expect(snapshot).toMatchObject({
      title: null,
      artistDisplay: null,
      albumTitle: null,
      albumArtistDisplay: null,
    })
    expect(f.tracks.getAll()[0].title).toBe('untagged')
    expect(
      await f.service.saveTrackMetadata({
        trackId: 1,
        editToken: snapshot.editToken,
        changes: { genreDisplay: 'Pop; Live' },
      }),
    ).toMatchObject({ ok: true })
    const actual = await parseAudioMetadata(f.path)
    expect(actual.common.title).toBeUndefined()
    expect(actual.common.artist).toBeUndefined()
    expect(actual.common.album).toBeUndefined()
    expect(actual.common.albumartist).toBeUndefined()
    expect(resolveGenres(actual)).toEqual(['Pop', 'Live'])
    expect(f.db.prepare('SELECT title,artist,album,album_artist,genre FROM tracks').get()).toEqual({
      title: null,
      artist: null,
      album: null,
      album_artist: null,
      genre: 'Pop; Live',
    })
    expect(f.db.prepare('SELECT source,override_mask FROM track_metadata').get()).toEqual({
      source: 'file_tag',
      override_mask: 0,
    })
  })

  it('rejects stale files before publication, with no second write', async () => {
    const f = await fixture('Before')
    const snapshot = (await f.service.getTrackEditSnapshot(1))!
    await appendFile(f.path, Buffer.from('external change'))
    const before = await readFile(f.path)
    await expect(
      f.service.saveTrackMetadata({
        trackId: 1,
        editToken: snapshot.editToken,
        changes: { title: 'Stale' },
      }),
    ).rejects.toMatchObject({ reason: 'metadata-conflict' })
    expect(await readFile(f.path)).toEqual(before)
  })

  it('binds tokens to a track and rejects old forms after another edit while allowing a saved value to be reverted', async () => {
    const f = await fixture('Before')
    const first = (await f.service.getTrackEditSnapshot(1))!
    const second = (await f.service.getTrackEditSnapshot(1))!
    expect(
      await f.service.saveTrackMetadata({
        trackId: 2,
        editToken: first.editToken,
        changes: { title: 'Wrong' },
      }),
    ).toEqual({ ok: false, reason: 'metadata-conflict' })
    expect(
      await f.service.saveTrackMetadata({
        trackId: 1,
        editToken: first.editToken,
        changes: { title: 'After' },
      }),
    ).toMatchObject({ ok: true })
    await expect(
      f.service.saveTrackMetadata({
        trackId: 1,
        editToken: second.editToken,
        changes: { title: 'Stale' },
      }),
    ).rejects.toMatchObject({ reason: 'metadata-conflict' })
    expect(
      await f.service.saveTrackMetadata({
        trackId: 1,
        editToken: first.editToken,
        changes: { title: 'Before' },
      }),
    ).toMatchObject({ ok: true })
    expect((await parseAudioMetadata(f.path)).common.title).toBe('Before')
  })

  it('rejects a concurrent database edit even if the file has not changed', async () => {
    const f = await fixture('Before')
    const snapshot = (await f.service.getTrackEditSnapshot(1))!
    f.db.prepare("UPDATE tracks SET genre='Concurrent' WHERE id=1").run()
    const before = await readFile(f.path)
    await expect(
      f.service.saveTrackMetadata({
        trackId: 1,
        editToken: snapshot.editToken,
        changes: { title: 'Stale' },
      }),
    ).rejects.toMatchObject({ reason: 'metadata-conflict' })
    expect(await readFile(f.path)).toEqual(before)
  })

  it('expires a token and makes it unusable after shutdown', async () => {
    const f = await fixture()
    const snapshot = (await f.service.getTrackEditSnapshot(1))!
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60 * 1000)
    expect(
      await f.service.saveTrackMetadata({ trackId: 1, editToken: snapshot.editToken, changes: {} }),
    ).toEqual({ ok: false, reason: 'metadata-conflict' })
    clock.mockRestore()
    await f.service.shutdown()
    expect(() =>
      f.service.saveTrackMetadata({ trackId: 1, editToken: snapshot.editToken, changes: {} }),
    ).toThrow('shutting down')
  })

  it('reconciles a published file after a database failure without rewriting audio', async () => {
    const f = await fixture('Before')
    const snapshot = (await f.service.getTrackEditSnapshot(1))!
    f.db.exec(
      "CREATE TRIGGER reject_commit BEFORE UPDATE OF file_size ON tracks BEGIN SELECT RAISE(ABORT,'injected commit failure'); END",
    )
    await expect(
      f.service.saveTrackMetadata({
        trackId: 1,
        editToken: snapshot.editToken,
        changes: { title: 'Published' },
      }),
    ).rejects.toThrow('injected commit failure')
    expect((await parseAudioMetadata(f.path)).common.title).toBe('Published')
    const published = await readFile(f.path)
    expect(f.tracks.getAll()[0].title).toBe('Before')
    f.db.exec('DROP TRIGGER reject_commit')
    await f.service.shutdown()
    expect(f.tracks.getAll()[0].title).toBe('Published')
    expect(await readFile(f.path)).toEqual(published)
  })

  it('does not overwrite a newer database value after the file has been published', async () => {
    const f = await fixture('Before')
    const snapshot = (await f.service.getTrackEditSnapshot(1))!
    f.service.setTagWriteSuccessHandler(() =>
      f.db.prepare("UPDATE tracks SET title='Concurrent' WHERE id=1").run(),
    )
    await expect(
      f.service.saveTrackMetadata({
        trackId: 1,
        editToken: snapshot.editToken,
        changes: { title: 'Published' },
      }),
    ).rejects.toBeInstanceOf(MetadataSaveError)
    expect(f.tracks.getAll()[0].title).toBe('Concurrent')
    expect((await parseAudioMetadata(f.path)).common.title).toBe('Published')
  })
})

describe('legacy override decisions', () => {
  async function legacy() {
    const f = await fixture('File title')
    f.db
      .prepare(
        `UPDATE track_metadata SET title='Saved title',genre_display=NULL,source='legacy_user_edit',override_mask=127 WHERE track_id=1`,
      )
      .run()
    return f
  }
  it('preserves explicit null and effective artist indexes across full scans and refreshes', async () => {
    const f = await legacy()
    const result = await readStableMetadata(1, f.path, f.root)
    const changed = {
      ...result,
      fileTags: { ...result.fileTags!, genreDisplay: 'Rock', artistDisplay: 'File artist' },
    }
    f.repository.updateTrackMetadata(changed)
    expect(f.tracks.getAll()[0]).toMatchObject({ title: 'Saved title', genre: null, artist: null })
    f.tracks.upsertMany([
      {
        ...changed,
        filePath: f.path,
        artist: 'File artist',
        album: 'Unknown Album',
        albumArtist: 'File artist',
      } as ScannedTrack,
    ])
    expect(f.tracks.getAll()[0]).toMatchObject({ title: 'Saved title', genre: null, artist: null })
    expect(f.db.prepare('SELECT artist,genre FROM tracks WHERE id=1').get()).toEqual({
      artist: 'File artist',
      genre: 'Rock',
    })
    expect(f.db.prepare('SELECT * FROM track_artists WHERE track_id=1').all()).toEqual([])
  })
  it('adopts current file tags without touching the music file', async () => {
    const f = await legacy()
    const snapshot = (await f.service.getTrackEditSnapshot(1))!
    expect(snapshot).toMatchObject({
      title: 'File title',
      legacyMetadata: { title: 'Saved title', genreDisplay: null },
    })
    const before = await readFile(f.path)
    expect(
      await f.service.saveTrackMetadata({ trackId: 1, editToken: snapshot.editToken, changes: {} }),
    ).toEqual({ ok: false, reason: 'legacy-metadata-unresolved' })
    expect(
      await f.service.saveTrackMetadata({
        trackId: 1,
        editToken: snapshot.editToken,
        changes: {},
        legacyAction: 'adopt-file',
      }),
    ).toMatchObject({ ok: true })
    expect(await readFile(f.path)).toEqual(before)
    expect(f.tracks.getAll()[0].title).toBe('File title')
    expect(f.repository.getLegacyMetadata(1)).toBeNull()
  })
  it('writes saved values explicitly, then lets future file refreshes update the library', async () => {
    const f = await legacy()
    const snapshot = (await f.service.getTrackEditSnapshot(1))!
    expect(
      await f.service.saveTrackMetadata({
        trackId: 1,
        editToken: snapshot.editToken,
        changes: {},
        legacyAction: 'write-legacy',
      }),
    ).toMatchObject({ ok: true })
    expect((await parseAudioMetadata(f.path)).common.title).toBe('Saved title')
    expect(f.repository.getLegacyMetadata(1)).toBeNull()
    const parsed = await readStableMetadata(1, f.path, f.root)
    f.repository.updateTrackMetadata({
      ...parsed,
      title: 'External',
      fileTags: { ...parsed.fileTags!, title: 'External' },
    })
    expect(f.tracks.getAll()[0].title).toBe('External')
  })
})
