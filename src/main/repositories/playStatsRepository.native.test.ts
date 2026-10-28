import { createRequire } from 'node:module'
import type Database from 'better-sqlite3'
import { expect, it, vi } from 'vitest'
import { migrateDatabase } from '../database/schema'
import { PlayStatsService } from '../services/playStatsService'
import { PlayStatsRepository } from './playStatsRepository'
import { SmartPlaylistRepository } from './smartPlaylistRepository'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database

interface RetryTestTracker {
  start(trackId: number): void
  dispose(): void
}

interface RetryTestTrackerOptions {
  isPlaybackCountable(trackId: number): boolean
  getDurationSeconds(): number | null
  epochNow(): number
  monotonicNow(): number
  randomToken(): string
  recordEffectivePlay(
    payload: Parameters<PlayStatsService['recordEffectivePlay']>[0],
  ): Promise<{ ok: boolean }>
}

it('keeps the newest play when a delayed tracker request succeeds on retry', async () => {
  // Load the real renderer module at runtime without adding it to the Node composite project.
  const { EffectivePlayTracker } = await vi.importActual<{
    EffectivePlayTracker: new (options: RetryTestTrackerOptions) => RetryTestTracker
  }>('../../renderer/features/playback/core/effectivePlayTracker')
  vi.useFakeTimers()
  const base = Date.parse('2026-10-09T00:00:00.000Z')
  vi.setSystemTime(base)
  const db = new DatabaseCtor(':memory:')
  let tracker: RetryTestTracker | undefined
  try {
    migrateDatabase(db)
    db.exec(`INSERT INTO tracks(id,file_path,title,duration_seconds) VALUES
      (1,'one.flac','One',5),(2,'two.flac','Two',5)`)
    const service = new PlayStatsService(new PlayStatsRepository(db))
    let rejectOld!: (reason: unknown) => void
    let oldSession: string | undefined
    let token = 0
    const calls: Array<{ trackId: number; sessionId: string; playedAtIso: string }> = []
    tracker = new EffectivePlayTracker({
      isPlaybackCountable: () => true,
      getDurationSeconds: () => 5,
      epochNow: () => Date.now(),
      monotonicNow: () => Date.now() - base,
      randomToken: () => String(++token),
      recordEffectivePlay: async (payload) => {
        calls.push(payload)
        if (!oldSession) {
          oldSession = payload.sessionId
          return await new Promise<{ ok: boolean }>((_, reject) => {
            rejectOld = reject
          })
        }
        return service.recordEffectivePlay(payload)
      },
    })
    tracker.start(1)
    await vi.advanceTimersByTimeAsync(3000)
    tracker.start(2)
    await vi.advanceTimersByTimeAsync(3000)
    tracker.start(1)
    await vi.advanceTimersByTimeAsync(3000)
    const newest = calls.at(-1)!.playedAtIso
    rejectOld(new Error('temporary failure before persistence'))
    await vi.advanceTimersByTimeAsync(1000)

    expect(calls).toHaveLength(4)
    expect(calls[3]).toEqual(calls[0])
    expect(service.recordEffectivePlay(calls[3]!)).toEqual({ ok: true, recorded: false })
    expect(
      db.prepare('SELECT play_count,last_played_at FROM track_play_stats WHERE track_id=1').get(),
    ).toEqual({ play_count: 2, last_played_at: newest })
    expect(
      db
        .prepare(
          'SELECT play_count,duration_seconds,last_played_at FROM daily_track_play_stats WHERE track_id=1',
        )
        .get(),
    ).toEqual({ play_count: 2, duration_seconds: 10, last_played_at: newest })
    expect(db.prepare('SELECT play_count,duration_seconds FROM daily_play_stats').get()).toEqual({
      play_count: 3,
      duration_seconds: 15,
    })
    const date = new Date(newest)
    const localDate = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
    expect(new SmartPlaylistRepository(db).getRecentPlayedTrackIds(localDate, localDate)).toEqual([
      1, 2,
    ])
  } finally {
    tracker?.dispose()
    db.close()
    vi.useRealTimers()
  }
})

it.each([
  [null, '2026-10-09T10:00:00Z', '2026-10-09T10:00:00.000Z'],
  ['2026-10-09T07:00:00-04:00', '2026-10-09T12:00:00+02:00', '2026-10-09T11:00:00.000Z'],
  ['2026-10-09T20:00:00+14:00', '2026-10-09T07:00:00Z', '2026-10-09T07:00:00.000Z'],
  ['2026-10-09T10:00:00Z', '2026-10-09T12:00:00+02:00', '2026-10-09T10:00:00.000Z'],
  ['Fri, 09 Oct 2026 12:00:00 GMT', '2026-10-09T11:00:00Z', '2026-10-09T12:00:00.000Z'],
  ['2026-10-09T12:00:00Z', 'Fri, 09 Oct 2026 13:00:00 GMT', '2026-10-09T13:00:00.000Z'],
  ['invalid legacy timestamp', '2026-10-09T10:00:00Z', '2026-10-09T10:00:00.000Z'],
])('compares persisted %s and incoming %s by actual time', (previous, incoming, expected) => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    db.exec(
      "INSERT INTO tracks(id,file_path,title,duration_seconds) VALUES(1,'one.flac','One',180)",
    )
    db.prepare(
      'INSERT INTO track_play_stats(track_id,play_count,last_played_at) VALUES(1,1,?)',
    ).run(previous)
    db.prepare(
      `INSERT INTO daily_track_play_stats
       (play_date,track_id,play_count,duration_seconds,last_played_at)
       VALUES('2026-10-09',1,1,180,?)`,
    ).run(previous)
    db.exec(`INSERT INTO daily_play_stats(play_date,play_count,duration_seconds)
      VALUES('2026-10-09',1,180)`)
    new PlayStatsRepository(db).incrementPlayCount(1, incoming!, '2026-10-09')
    expect(db.prepare('SELECT play_count,last_played_at FROM track_play_stats').get()).toEqual({
      play_count: 2,
      last_played_at: expected,
    })
    expect(
      db
        .prepare('SELECT play_count,duration_seconds,last_played_at FROM daily_track_play_stats')
        .get(),
    ).toEqual({ play_count: 2, duration_seconds: 360, last_played_at: expected })
    expect(db.prepare('SELECT play_count,duration_seconds FROM daily_play_stats').get()).toEqual({
      play_count: 2,
      duration_seconds: 360,
    })
  } finally {
    db.close()
  }
})

it('keeps the overall latest play while advancing a past day or inserting a missing day', () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    db.exec(
      "INSERT INTO tracks(id,file_path,title,duration_seconds) VALUES(1,'one.flac','One',180)",
    )
    const repository = new PlayStatsRepository(db)
    repository.incrementPlayCount(1, '2026-10-10T10:00:00Z', '2026-10-10')
    repository.incrementPlayCount(1, '2026-10-09T09:00:00Z', '2026-10-09')
    repository.incrementPlayCount(1, '2026-10-09T10:00:00Z', '2026-10-09')
    repository.incrementPlayCount(1, '2026-10-08T10:00:00Z', '2026-10-08')
    expect(db.prepare('SELECT play_count,last_played_at FROM track_play_stats').get()).toEqual({
      play_count: 4,
      last_played_at: '2026-10-10T10:00:00.000Z',
    })
    const days = [
      { play_date: '2026-10-08', play_count: 1, duration_seconds: 180 },
      { play_date: '2026-10-09', play_count: 2, duration_seconds: 360 },
      { play_date: '2026-10-10', play_count: 1, duration_seconds: 180 },
    ]
    expect(
      db
        .prepare(
          'SELECT play_date,play_count,duration_seconds FROM daily_play_stats ORDER BY play_date',
        )
        .all(),
    ).toEqual(days)
    expect(
      db
        .prepare(
          `SELECT play_date,play_count,duration_seconds,last_played_at
           FROM daily_track_play_stats ORDER BY play_date`,
        )
        .all(),
    ).toEqual(days.map((day) => ({ ...day, last_played_at: `${day.play_date}T10:00:00.000Z` })))
  } finally {
    db.close()
  }
})

it('keeps effective-play recording and statistics-backed smart playlist ordering', () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    db.exec(`INSERT INTO tracks(id,file_path,title,duration_seconds) VALUES
      (1,'one.flac','One',180),(2,'two.flac','Two',240)`)
    const service = new PlayStatsService(new PlayStatsRepository(db))
    const record = (trackId: number, sessionId: string, day: number) =>
      service.recordEffectivePlay({
        trackId,
        sessionId,
        playedAtIso: new Date(2026, 9, day, 12).toISOString(),
      })
    expect(record(1, 'first', 8)).toEqual({ ok: true, recorded: true })
    expect(record(1, 'first', 8)).toEqual({ ok: true, recorded: false })
    expect(record(1, 'second', 8)).toEqual({ ok: true, recorded: true })
    expect(record(2, 'third', 7)).toEqual({ ok: true, recorded: true })
    expect(
      db.prepare('SELECT track_id,play_count FROM track_play_stats ORDER BY track_id').all(),
    ).toEqual([
      { track_id: 1, play_count: 2 },
      { track_id: 2, play_count: 1 },
    ])
    const days = [
      { play_date: '2026-10-07', play_count: 1, duration_seconds: 240 },
      { play_date: '2026-10-08', play_count: 2, duration_seconds: 360 },
    ]
    expect(
      db
        .prepare(
          'SELECT play_date,play_count,duration_seconds FROM daily_play_stats ORDER BY play_date',
        )
        .all(),
    ).toEqual(days)
    expect(service.getAnnualPlayCounts(2026)).toEqual([
      { date: '2026-10-07', playCount: 1, durationSeconds: 240 },
      { date: '2026-10-08', playCount: 2, durationSeconds: 360 },
    ])
    expect(
      db
        .prepare(
          'SELECT play_date,play_count,duration_seconds FROM daily_track_play_stats ORDER BY play_date',
        )
        .all(),
    ).toEqual(days)
    const smartPlaylists = new SmartPlaylistRepository(db)
    expect(smartPlaylists.getMostListenedTrackIds()).toEqual([1, 2])
    expect(smartPlaylists.getRecentFrequentTrackIds('2026-10-07', '2026-10-08')).toEqual([1, 2])
    expect(smartPlaylists.getRecentPlayedTrackIds('2026-10-07', '2026-10-08')).toEqual([1, 2])
    expect(smartPlaylists.getRecentFrequentTrackIds('2026-10-08', '2026-10-08')).toEqual([1])
  } finally {
    db.close()
  }
})

it('reads the full year including leap day and boundaries without changing persisted data', () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    db.exec(`INSERT INTO daily_play_stats (play_date,play_count) VALUES
      ('2023-12-31',99),('2024-01-01',1),('2024-02-29',5),
      ('2024-10-08',0),('2024-12-31',20),('2025-01-01',99),
      ('1900-01-01',2),('9999-12-31',3)`)
    const snapshot = () => db.prepare('SELECT * FROM daily_play_stats ORDER BY play_date').all()
    const before = snapshot()
    const service = new PlayStatsService(new PlayStatsRepository(db))
    expect(service.getAnnualPlayCounts(2024)).toEqual([
      { date: '2024-01-01', playCount: 1, durationSeconds: 0 },
      { date: '2024-02-29', playCount: 5, durationSeconds: 0 },
      { date: '2024-10-08', playCount: 0, durationSeconds: 0 },
      { date: '2024-12-31', playCount: 20, durationSeconds: 0 },
    ])
    expect(service.getAnnualPlayCounts(2026)).toEqual([])
    expect(service.getAnnualPlayCounts(1900)).toEqual([
      { date: '1900-01-01', playCount: 2, durationSeconds: 0 },
    ])
    expect(service.getAnnualPlayCounts(9999)).toEqual([
      { date: '9999-12-31', playCount: 3, durationSeconds: 0 },
    ])
    expect(snapshot()).toEqual(before)
    service.resetAll()
    expect(service.getAnnualPlayCounts(2024)).toEqual([])
  } finally {
    db.close()
  }
})

it('ranks at most three daily tracks including removed history with stable ties and display metadata', () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    db.exec(`INSERT INTO tracks(id,file_path,title,artist) VALUES
      (1,'one.flac','One','Artist'),(2,'two.flac','Two','Artist'),
      (3,'three.flac','Three',NULL),(4,'four.flac','Four',NULL);
      INSERT INTO track_metadata(track_id,title,source,override_mask) VALUES(1,'Edited One','legacy_user_edit',1);
      INSERT INTO daily_track_play_stats(play_date,track_id,play_count,duration_seconds) VALUES
      ('2026-10-09',1,5,900),('2026-10-09',2,5,1200),('2026-10-09',3,5,900),('2026-10-09',4,0,0),
      ('2026-10-08',4,99,9999);
      INSERT INTO removed_track_history(id,title,artist,source_file_path,recovery_json)
      VALUES(5,'Removed Five','Historical Artist','removed.flac','{}');
      INSERT INTO removed_daily_track_play_stats(play_date,track_id,play_count,duration_seconds)
      VALUES('2026-10-09',5,10,1800);`)
    const snapshot = () =>
      [
        'tracks',
        'track_metadata',
        'daily_track_play_stats',
        'removed_track_history',
        'removed_daily_track_play_stats',
      ].map((table) => db.prepare(`SELECT * FROM ${table}`).all())
    const before = snapshot()
    const service = new PlayStatsService(new PlayStatsRepository(db))
    expect(service.getDayTopTracks('2026-10-09')).toEqual([
      { trackId: 5, title: 'Removed Five', artist: 'Historical Artist', playCount: 10 },
      { trackId: 2, title: 'Two', artist: 'Artist', playCount: 5 },
      { trackId: 1, title: 'Edited One', artist: 'Artist', playCount: 5 },
    ])
    expect(service.getDayTopTracks('2026-10-08')).toEqual([
      { trackId: 4, title: 'Four', artist: null, playCount: 99 },
    ])
    expect(service.getDayTopTracks('2026-10-10')).toEqual([])
    expect(snapshot()).toEqual(before)
  } finally {
    db.close()
  }
})

it('ranks daily albums by duration, excludes unknown albums, and includes removed history', () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    db.exec(`INSERT INTO tracks(id,file_path,title,artist,album,album_artist,duration_seconds) VALUES
      (1,'a1.flac','A1','Artist','Alpha','Artist',300),
      (2,'a2.flac','A2','Artist','Alpha','Artist',300),
      (3,'b1.flac','B1','Other','Beta','Other',600),
      (4,'u1.flac','U1','Unknown','','',120),
      (6,'c1.flac','C1','Artist','Gamma','Artist',100),
      (7,'d1.flac','D1','Other','Delta','Other',600);
      INSERT INTO albums(title,artist,artwork_cache_key) VALUES('Alpha','Artist','alpha-cover');
      INSERT INTO daily_track_play_stats(play_date,track_id,play_count,duration_seconds) VALUES
      ('2026-10-09',1,5,900),('2026-10-09',2,2,300),('2026-10-09',3,1,600),
      ('2026-10-09',4,9,9999),('2026-10-09',6,3,300),('2026-10-09',7,2,600);
      INSERT INTO removed_track_history(id,title,artist,album,album_artist,source_file_path,recovery_json)
      VALUES(5,'Removed','Historical','Removed Album','Historical Artist','removed.flac','{}');
      INSERT INTO removed_daily_track_play_stats(play_date,track_id,play_count,duration_seconds)
      VALUES('2026-10-09',5,2,700);`)
    const snapshot = () =>
      [
        'tracks',
        'albums',
        'daily_track_play_stats',
        'removed_track_history',
        'removed_daily_track_play_stats',
      ].map((table) => db.prepare(`SELECT * FROM ${table}`).all())
    const before = snapshot()
    const service = new PlayStatsService(new PlayStatsRepository(db))
    expect(service.getDayTopAlbums('2026-10-09')).toEqual([
      {
        album: 'Alpha',
        albumArtist: 'Artist',
        artworkCacheKey: 'alpha-cover',
        playCount: 7,
        durationSeconds: 1200,
        trackCount: 2,
      },
      {
        album: 'Removed Album',
        albumArtist: 'Historical Artist',
        artworkCacheKey: null,
        playCount: 2,
        durationSeconds: 700,
        trackCount: 1,
      },
      {
        album: 'Delta',
        albumArtist: 'Other',
        artworkCacheKey: null,
        playCount: 2,
        durationSeconds: 600,
        trackCount: 1,
      },
      {
        album: 'Beta',
        albumArtist: 'Other',
        artworkCacheKey: null,
        playCount: 1,
        durationSeconds: 600,
        trackCount: 1,
      },
      {
        album: 'Gamma',
        albumArtist: 'Artist',
        artworkCacheKey: null,
        playCount: 3,
        durationSeconds: 300,
        trackCount: 1,
      },
    ])
    expect(service.getDayTopAlbums('2026-10-10')).toEqual([])
    expect(snapshot()).toEqual(before)
  } finally {
    db.close()
  }
})

it('groups active and removed tracks together using current display metadata and artist fallbacks', () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    db.exec(`INSERT INTO tracks(id,file_path,title,artist,album,album_artist) VALUES
      (1,'edited.flac','Original','Original','Original Album','Original'),
      (2,'other.flac','Other','Other','Shared','Other');
      INSERT INTO track_metadata(track_id,title,artist_display,album_title,album_artist_display,artwork_cache_key,source,override_mask)
      VALUES(1,'Edited','Artist','Shared','   ','edited-cover','legacy_user_edit',127);
      INSERT INTO daily_track_play_stats(play_date,track_id,play_count,duration_seconds) VALUES
      ('2026-10-09',1,2,600),('2026-10-09',2,3,900);
      INSERT INTO removed_track_history(id,title,artist,album,album_artist,artwork_cache_key,source_file_path,recovery_json)
      VALUES(3,'Removed','Artist','Shared',NULL,'removed-cover','removed.flac','{}');
      INSERT INTO removed_daily_track_play_stats(play_date,track_id,play_count,duration_seconds)
      VALUES('2026-10-09',3,2,600);`)
    const repo = new PlayStatsRepository(db)
    expect(repo.getDayTopAlbums('2026-10-09')).toEqual([
      {
        album: 'Shared',
        albumArtist: 'Artist',
        artworkCacheKey: 'removed-cover',
        playCount: 4,
        durationSeconds: 1200,
        trackCount: 2,
      },
      {
        album: 'Shared',
        albumArtist: 'Other',
        artworkCacheKey: null,
        playCount: 3,
        durationSeconds: 900,
        trackCount: 1,
      },
    ])
    expect(repo.getDayTopTracks('2026-10-09')[1]).toEqual({
      trackId: 1,
      title: 'Edited',
      artist: 'Artist',
      playCount: 2,
    })
  } finally {
    db.close()
  }
})

it.each(['getDayTopTracks', 'getDayTopAlbums'] as const)(
  '%s locates daily tracks without scanning or materializing the full display library',
  (method) => {
    const db = new DatabaseCtor(':memory:')
    try {
      migrateDatabase(db)
      db.exec(`WITH RECURSIVE ids(id) AS (
        SELECT 1 UNION ALL SELECT id+1 FROM ids WHERE id<10000
      ) INSERT INTO tracks(id,file_path,title,artist,album)
        SELECT id,'fixture/'||id||'.flac','Track '||id,'Artist','Album '||(id/10) FROM ids;
        INSERT INTO daily_track_play_stats(play_date,track_id,play_count,duration_seconds)
        VALUES('2026-10-09',1,2,600);`)
      const prepare = vi.spyOn(db, 'prepare')
      try {
        expect(new PlayStatsRepository(db)[method]('2026-10-09')).toHaveLength(1)
        const sql = prepare.mock.calls[0][0]
        const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all({ date: '2026-10-09' }) as {
          detail: string
        }[]
        expect(plan.some(({ detail }) => /\bSCAN (?:t|removed_track_history)\b/.test(detail))).toBe(
          false,
        )
        expect(
          plan.some(({ detail }) => detail.includes('MATERIALIZE listening_track_display')),
        ).toBe(false)
      } finally {
        prepare.mockRestore()
      }
    } finally {
      db.close()
    }
  },
)
