import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { ScannedTrack } from '@shared/types/libraryScan'
import { migrateDatabase } from '../database/schema'
import { TrackRepository } from './trackRepository'

const nodeRequire = createRequire(import.meta.url)
const DatabaseCtor = nodeRequire('better-sqlite3') as new (path: string) => Database.Database
const databases: Database.Database[] = []

function setup() {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  // Construction remains valid before schema preparation.
  const repository = new TrackRepository(db)
  migrateDatabase(db)
  return { db, repository }
}

function track(filePath: string, title = 'Song'): ScannedTrack {
  return {
    filePath,
    title,
    fileSize: 100,
    fileMtimeMs: 1,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNo: null,
    discNo: null,
    bitrateBps: null,
    durationSeconds: 180,
    year: null,
    releaseDate: null,
    copyright: null,
    composer: null,
    genre: null,
    artworkCacheKey: null,
    lyricsText: null,
    lyricsFormat: null,
    isrc: null,
    metadataSignature: 'test',
  }
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

describe('track repository component boundaries', () => {
  it('reads current playback artwork with the same fallback as the catalog', () => {
    const { db, repository } = setup()
    repository.upsertMany([track('C:\\isolated\\cover.flac')])
    const id = repository.getAll()[0].id
    for (const [embedded, directory, album, expected] of [
      ['new-cover', 'directory-cover', 'album-cover', 'new-cover'],
      [null, 'directory-cover', 'album-cover', 'directory-cover'],
      [null, null, 'album-cover', 'album-cover'],
      [null, null, null, null],
    ]) {
      db.prepare(
        'UPDATE tracks SET embedded_artwork_cache_key = ?, directory_artwork_cache_key = ? WHERE id = ?',
      ).run(embedded, directory, id)
      db.prepare('UPDATE albums SET artwork_cache_key = ?').run(album)
      const current = repository.getPlaybackTrack(id)
      expect(current).toEqual({
        id,
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        albumArtist: 'Artist',
        durationSeconds: 180,
        artworkCacheKey: expected,
      })
      expect(current?.artworkCacheKey).toBe(repository.getAll()[0].artworkCacheKey)
    }
    expect(repository.getPlaybackTrack(id + 100)).toBeNull()
  })
  it('limits recovery reads to the exact root, including missing tracks and escaped path characters', () => {
    const { db, repository } = setup()
    const root = 'C:\\isolated%_~'
    const kept = `${root}\\available.flac`
    const missing = `${root}/nested/missing.flac`
    const adjacent = `${root}-adjacent\\other.flac`
    const wildcard = 'C:\\isolatedXY~\\other.flac'
    repository.upsertMany([kept, missing, adjacent, wildcard].map((path) => track(path)))
    repository.markMissingByFilePaths([missing])
    db.prepare('UPDATE tracks SET lyrics_sidecar_fingerprint = ? WHERE file_path = ?').run(
      'lyrics',
      kept,
    )
    expect(repository.getWatchRecoveryTracks(root)).toEqual(
      expect.arrayContaining([
        { filePath: kept, lyricsSidecarFingerprint: 'lyrics' },
        { filePath: missing, lyricsSidecarFingerprint: null },
      ]),
    )
    expect(repository.getWatchRecoveryTracks(root)).toHaveLength(2)
  })

  it.each(['direct', 'outer transaction'] as const)(
    'preserves 300-row batch commit behavior in %s',
    (mode) => {
      const { db, repository } = setup()
      db.exec(`CREATE TRIGGER reject_bad_track BEFORE INSERT ON tracks
        WHEN NEW.title = 'Bad' BEGIN SELECT RAISE(ABORT, 'batch failure'); END`)
      const tracks = Array.from({ length: 301 }, (_, index) =>
        track(`C:\\isolated\\${index}.flac`, index === 300 ? 'Bad' : 'Song'),
      )
      const write = () => repository.upsertMany(tracks)
      expect(mode === 'direct' ? write : db.transaction(write)).toThrow('batch failure')
      expect(db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(
        mode === 'direct' ? 300 : 0,
      )
      expect(db.prepare('SELECT COUNT(*) FROM albums').pluck().get()).toBe(
        mode === 'direct' ? 1 : 0,
      )
      expect(repository.getExistingFilePaths(tracks.map((item) => item.filePath)).size).toBe(
        mode === 'direct' ? 300 : 0,
      )
      expect(db.inTransaction).toBe(false)
    },
  )

  it('handles Windows path aliases and escaped root patterns without marking unreadable or adjacent roots missing', () => {
    const { db, repository } = setup()
    const root = 'C:\\isolated%_~'
    const found = `${root}\\found.flac`
    const gone = `${root}\\gone.flac`
    const protectedPath = `${root}\\unreadable\\protected.flac`
    const sibling = 'C:\\isolatedXY~\\sibling.flac'
    repository.upsertMany([found, gone, protectedPath, sibling].map((path) => track(path)))
    const id = repository.getTrackIdsByFilePaths([gone])[0]
    expect(
      repository.markMissingUnderRootExcept(
        root,
        [found.replace(/\\/g, '/')],
        [`${root}\\unreadable`],
      ),
    ).toEqual([id])
    expect(
      db.prepare('SELECT file_path AS path FROM tracks WHERE availability = ?').all('missing'),
    ).toEqual([{ path: gone }])
    expect(repository.getMissingCandidates().map((item) => item.trackId)).toEqual([id])
    expect(repository.markAvailableByFilePaths([gone])).toEqual([id])
    expect(repository.getMissingCandidates()).toEqual([])
    expect(
      db.prepare("SELECT name FROM sqlite_temp_master WHERE name='_temp_found_paths'").all(),
    ).toEqual([])
  })
})
