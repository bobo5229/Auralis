import { createRequire } from 'node:module'
import { expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '../database/schema'
import { TrackQueryRepository } from './trackQueryRepository'
import { TrackRepository } from './trackRepository'
import { LibraryRepository } from './libraryRepository'
import { LibraryService } from '../services/libraryService'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database

it('excludes the previous playable album, returns ordered tracks, and permits a sole album', () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    const insert = db.prepare(
      `INSERT INTO tracks (file_path, file_size, file_mtime_ms, title, artist, album_artist, album, disc_no, track_no, availability) VALUES (?, 100, 100, ?, 'Artist', 'Artist', ?, ?, ?, ?)`,
    )
    insert.run('a.wav', 'A second', 'A', 1, 2, 'available')
    insert.run('b.wav', 'A first', 'A', 1, 1, 'available')
    insert.run('c.wav', 'B', 'B', 1, 1, 'available')
    insert.run('d.wav', 'Missing', 'Missing', 1, 1, 'missing')
    const query = new TrackQueryRepository(db)
    expect(query.getRandomAlbumIdentity({ albumArtist: 'Artist', album: 'A' })).toEqual({
      albumArtist: 'Artist',
      album: 'B',
    })
    expect(query.getAlbumTracks('Artist', 'A').map((track) => track.title)).toEqual([
      'A first',
      'A second',
    ])
    db.prepare("UPDATE tracks SET availability = 'missing' WHERE album = 'B'").run()
    expect(query.getRandomAlbumIdentity({ albumArtist: 'Artist', album: 'A' })).toEqual({
      albumArtist: 'Artist',
      album: 'A',
    })
    db.prepare("UPDATE tracks SET availability = 'missing'").run()
    expect(query.getRandomAlbumIdentity()).toBeNull()
  } finally {
    db.close()
  }
})

it('aggregates only available tracks by displayed album identity and uses the startup service', () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    db.exec(`
      INSERT INTO tracks (id, file_path, title, artist, album_artist, album, disc_no, track_no, availability)
      VALUES
        (1,'a1.wav','A second','Artist','','A',1,2,'available'),
        (2,'a2.wav','A first','Artist','','A',1,1,'available'),
        (3,'a3.wav','Missing track','Artist','','A',1,3,'missing'),
        (4,'b.wav','B','Guest','Band','B',1,1,'available'),
        (5,'empty.wav','No album','Artist','','',1,1,'available'),
        (6,'missing.wav','Missing album','Artist','','Missing',1,1,'missing');
      INSERT INTO track_play_stats (track_id, play_count, last_played_at) VALUES
        (1,10,'2026-10-01T12:00:00.000Z'),
        (3,100,'2026-10-10T12:00:00.000Z'),
        (4,24,'2026-10-09T12:00:00.000Z');
    `)
    const tracks = new TrackRepository(db)
    expect(tracks.getStartupAlbumCandidates()).toEqual([
      {
        albumArtist: 'Artist',
        album: 'A',
        averagePlayCount: 5,
        unheardFraction: 0.5,
        lastPlayedAt: '2026-10-01T12:00:00.000Z',
      },
      {
        albumArtist: 'Band',
        album: 'B',
        averagePlayCount: 24,
        unheardFraction: 0,
        lastPlayedAt: '2026-10-09T12:00:00.000Z',
      },
    ])
    const service = new LibraryService(new LibraryRepository(db), tracks)
    const random = vi.spyOn(Math, 'random')
    try {
      // The same draw chooses the less-played A in discovery and B in uniform mode.
      random.mockReturnValueOnce(0).mockReturnValueOnce(0.5)
      expect(service.getStartupAlbumTracks()?.album).toBe('A')
      random.mockReturnValueOnce(0.9).mockReturnValueOnce(0.5)
      expect(service.getStartupAlbumTracks()?.album).toBe('B')
    } finally {
      random.mockRestore()
    }
    const selected = service.getStartupAlbumTracks([{ albumArtist: 'Band', album: 'B' }])
    expect(selected?.album).toBe('A')
    expect(selected?.tracks.map((track) => track.title)).toEqual(['A first', 'A second'])
    // Tiny collections release the oldest shown album and still return its complete playable list.
    expect(
      service.getStartupAlbumTracks([
        { albumArtist: 'Artist', album: 'A' },
        { albumArtist: 'Band', album: 'B' },
      ])?.album,
    ).toBe('B')
    // Compare instants, not timestamp strings: this offset timestamp is actually later.
    db.exec(`INSERT INTO track_play_stats (track_id, play_count, last_played_at)
      VALUES (2, 1, '2026-09-30T23:00:00-14:00')`)
    expect(tracks.getStartupAlbumCandidates()[0].lastPlayedAt).toBe('2026-10-01T13:00:00.000Z')
    db.exec("UPDATE tracks SET availability = 'missing'")
    expect(service.getStartupAlbumTracks()).toBeNull()
  } finally {
    db.close()
  }
})
