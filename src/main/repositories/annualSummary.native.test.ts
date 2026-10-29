import { createRequire } from 'node:module'
import type Database from 'better-sqlite3'
import { expect, it } from 'vitest'
import { migrateDatabase } from '../database/schema'
import { PlayStatsService } from '../services/playStatsService'
import { PlayStatsRepository } from './playStatsRepository'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database
it('reads a year snapshot through real SQLite, including edits and removed history, without writes', () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    db.exec(`INSERT INTO tracks(id,file_path,title,artist,album,album_artist,duration_seconds) VALUES
      (1,'one.flac','Original','Artist','Album','Artist',180), (2,'two.flac','Two','Artist','Album','Artist',240);
      INSERT INTO track_metadata(track_id,title,artist_display,album_title,album_artist_display,source,override_mask) VALUES(1,'Edited','Artist','Album','Artist','legacy_user_edit',1);
      INSERT INTO daily_track_play_stats(play_date,track_id,play_count,duration_seconds) VALUES
        ('2026-03-01',1,4,720), ('2026-03-02',2,2,480), ('2025-01-01',1,100,18000);
      INSERT INTO removed_track_history(id,title,artist,album,album_artist,source_file_path,recovery_json)
        VALUES(1,'Removed','Other','Removed album','Other','removed.flac','{}');
      INSERT INTO removed_daily_track_play_stats(play_date,track_id,play_count,duration_seconds) VALUES('2026-07-01',1,7,1400);
      INSERT INTO daily_play_stats(play_date,play_count,duration_seconds) VALUES
        ('2026-03-01',4,720),('2026-03-02',2,480),('2026-07-01',7,1400),('2025-01-01',100,18000);`)
    const before = db.prepare('SELECT total_changes() AS changes').get()
    const repo = new PlayStatsRepository(db)
    const service = new PlayStatsService(repo, () => repo.resetAll())
    const result = service.getAnnualSummary(2026)
    expect(result).toMatchObject({
      year: 2026,
      playCount: 13,
      activeDays: 3,
      albumCount: 2,
      longestRun: { start: '2026-03-01', end: '2026-03-02', days: 2 },
    })
    expect(result.albums[0]).toMatchObject({
      album: 'Removed album',
      playCount: 7,
      available: false,
    })
    expect(result.tracks[1]).toMatchObject({ title: 'Edited', playCount: 4, playback: { id: 1 } })
    expect(result.selection.map((track) => track.id)).toEqual([1, 2])
    expect(result.peakDay?.album?.album).toBe('Removed album')
    expect(result.months[6].albums[0].album).toBe('Removed album')
    expect(result.seasons[0].album?.album).toBe('Album')
    expect(result.seasons[1].album?.album).toBe('Removed album')
    expect(service.getAnnualSummary(2027)).toMatchObject({
      playCount: 0,
      albums: [],
      selection: [],
    })
    expect(db.prepare('SELECT total_changes() AS changes').get()).toEqual(before)
  } finally {
    db.close()
  }
})
