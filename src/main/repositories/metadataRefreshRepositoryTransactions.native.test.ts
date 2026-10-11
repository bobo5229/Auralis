import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import { migrateDatabase } from '../database/schema'
import { MetadataRefreshRepository, type RefreshedTrackMetadata } from './metadataRefreshRepository'

const nodeRequire = createRequire(import.meta.url)
const DatabaseCtor = nodeRequire('better-sqlite3') as new (path: string) => Database.Database
const databases: Database.Database[] = []

function refreshed(patch: Partial<RefreshedTrackMetadata> = {}): RefreshedTrackMetadata {
  return {
    trackId: 1,
    sourceFilePath: 'C:\\isolated\\sample.flac',
    fileSize: 100,
    fileMtimeMs: 100,
    title: 'Original',
    artistDisplay: 'Original Artist',
    artists: ['Original Artist'],
    artist: 'Original Artist',
    albumTitle: 'Original Album',
    album: 'Original Album',
    albumArtistDisplay: 'Original Album Artist',
    albumArtists: ['Original Album Artist'],
    albumArtist: 'Original Album Artist',
    trackNo: 1,
    discNo: 1,
    bitrateBps: null,
    durationSeconds: 180,
    year: 2026,
    releaseDate: '2026',
    copyright: null,
    composer: null,
    genres: ['Pop'],
    genre: 'Pop',
    lyricsText: 'Original lyrics',
    lyricsFormat: 'plain',
    artworkCacheKey: null,
    isrc: null,
    metadataSignature: 'original',
    ...patch,
  }
}

const edit: EditableTrackMetadata = {
  trackId: 1,
  title: 'Edited',
  artistDisplay: 'New Primary; Second Primary',
  albumTitle: 'Edited Album',
  albumArtistDisplay: 'New Album Artist',
  genreDisplay: 'Rock',
  year: 2025,
  releaseDate: '2025-01-02',
}

function setup() {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  migrateDatabase(db)
  db.prepare('INSERT INTO tracks(id,file_path,title,artist,album) VALUES(1,?,?,?,?)').run(
    refreshed().sourceFilePath,
    'Original',
    'Original Artist',
    'Original Album',
  )
  const repository = new MetadataRefreshRepository(db)
  repository.updateTrackMetadata(refreshed())
  return { db, repository }
}

function snapshot(db: Database.Database) {
  return ['tracks', 'track_metadata', 'artists', 'track_artists', 'albums'].map((table) =>
    db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
  )
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

describe('metadata repository writer transaction boundaries', () => {
  it('rolls back an existing user edit and artist links when the verified technical write fails', () => {
    const { db, repository } = setup()
    repository.updateUserEditedMetadata({ ...edit, title: 'Previous edit' })
    const before = snapshot(db)
    db.exec(`CREATE TRIGGER reject_verified_technical BEFORE UPDATE OF file_size ON tracks
      WHEN NEW.file_size = 200 BEGIN SELECT RAISE(ABORT, 'late technical failure'); END`)

    expect(() =>
      repository.commitVerifiedUserEdit(
        {
          ...edit,
          artistDisplay: 'Replacement Artist',
          albumArtistDisplay: 'Replacement Album Artist',
        },
        refreshed({ fileSize: 200, fileMtimeMs: 200, lyricsText: 'Replacement lyrics' }),
      ),
    ).toThrow('late technical failure')
    expect(snapshot(db)).toEqual(before)
    expect(db.inTransaction).toBe(false)
  })

  it('rolls back file metadata, albums and primary artists when album-artist insertion fails', () => {
    const { db, repository } = setup()
    const before = snapshot(db)
    db.exec(`CREATE TRIGGER reject_album_artist BEFORE INSERT ON track_artists
      WHEN NEW.role = 'album_artist' BEGIN SELECT RAISE(ABORT, 'late artist failure'); END`)

    expect(() =>
      repository.updateTrackMetadata(
        refreshed({
          title: 'Replacement',
          artists: ['Replacement Artist'],
          albumTitle: 'Replacement Album',
          albumArtists: ['Replacement Album Artist'],
          fileSize: 200,
          fileMtimeMs: 200,
        }),
      ),
    ).toThrow('late artist failure')
    expect(snapshot(db)).toEqual(before)
    expect(db.inTransaction).toBe(false)
  })

  it('rejects invalid fingerprints and mismatched verified edits before changing existing rows', () => {
    const { db, repository } = setup()
    const before = snapshot(db)
    for (const patch of [
      { fileSize: -1 },
      { fileSize: 1.5 },
      { fileSize: Number.MAX_SAFE_INTEGER + 1 },
      { fileMtimeMs: Number.NaN },
      { fileMtimeMs: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => repository.commitVerifiedUserEdit(edit, refreshed(patch))).toThrow(
        'Invalid metadata file fingerprint',
      )
      expect(snapshot(db)).toEqual(before)
    }
    expect(() => repository.commitVerifiedUserEdit({ ...edit, trackId: 2 }, refreshed())).toThrow(
      'Metadata track identity changed',
    )
    expect(snapshot(db)).toEqual(before)
    expect(db.inTransaction).toBe(false)
  })

  it('keeps writers bound to their own database and refreshes each source according to its edit state', () => {
    const first = setup()
    const second = setup()
    const secondBefore = snapshot(second.db)
    first.repository.commitVerifiedUserEdit(edit, refreshed({ fileSize: 200, fileMtimeMs: 200 }))
    expect(snapshot(second.db)).toEqual(secondBefore)
    const firstAfter = snapshot(first.db)
    second.repository.updateTrackLyrics(
      refreshed({ title: 'Second file title', fileSize: 300, fileMtimeMs: 300 }),
    )
    expect(snapshot(first.db)).toEqual(firstAfter)
    expect(first.repository.getEditableTrackMetadata(1)?.title).toBe('Edited')
    expect(second.repository.getEditableTrackMetadata(1)?.title).toBe('Second file title')
    expect(first.db.prepare('SELECT source FROM track_metadata').pluck().get()).toBe('user_edit')
    expect(second.db.prepare('SELECT source FROM track_metadata').pluck().get()).toBe('file_tag')
  })
})
