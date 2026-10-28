import type { ListeningSample } from '@shared/types/badgeAchievements'
import { createRequire } from 'node:module'
import type Database from 'better-sqlite3'
import { afterEach, expect, it } from 'vitest'
import { migrateDatabase } from '../database/schema'
import { migrations } from '../database/schemaMigrations'
import { BadgeAchievementRepository } from './badgeAchievementRepository'
import { PlayStatsRepository } from './playStatsRepository'
const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database
const databases: Database.Database[] = []
function fixture() {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  migrateDatabase(db)
  return { db, repo: new BadgeAchievementRepository(db) }
}
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})
function hear(
  repo: BadgeAchievementRepository,
  trackId: number,
  start: number,
  end: number,
  sessionId = crypto.randomUUID(),
) {
  let sequence = 0
  for (let point = start; point < end; ) {
    const samples: ListeningSample[] = []
    for (let i = 0; i < 32 && point < end; i++) {
      const next = Math.min(end, point + 2)
      samples.push({
        startedAtIso: new Date(2026, 9, 28, 12, 0, point).toISOString(),
        startSeconds: point,
        endSeconds: next,
        playedSeconds: next - point,
      })
      point = next
    }
    expect(
      repo.record({ epoch: repo.getEpoch(), sessionId, sequence: ++sequence, trackId, samples }).ok,
    ).toBe(true)
  }
}
it('snapshots old daily estimates once and preserves them through repeated migration', () => {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  db.exec(
    'CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  )
  for (const m of migrations.filter((m) => m.id < 32)) {
    db.exec(m.sql)
    db.prepare('INSERT INTO schema_migrations(id,name) VALUES(?,?)').run(m.id, m.name)
  }
  db.exec(
    "INSERT INTO daily_play_stats(play_date,play_count,duration_seconds) VALUES('2026-10-27',2,3600),('2026-10-28',1,3599)",
  )
  migrateDatabase(db)
  migrateDatabase(db)
  const repo = new BadgeAchievementRepository(db)
  db.exec('UPDATE daily_play_stats SET duration_seconds=duration_seconds+10000')
  expect(repo.getAchievements()).toMatchObject({
    listeningSeconds: 7199,
    listeningDays: 1,
    completeAlbums: 0,
  })
  db.exec("INSERT INTO tracks(id,file_path,duration_seconds) VALUES(1,'one.flac',100)")
  hear(repo, 1, 0, 1)
  expect(repo.getAchievements()).toMatchObject({ listeningSeconds: 7200, listeningDays: 2 })
})
it('counts elapsed repeats but unions content, applies every-track 90%, and uses genres only', () => {
  const { db, repo } = fixture()
  db.exec(`INSERT INTO tracks(id,file_path,title,album,album_artist,genre,duration_seconds) VALUES
 (1,'one.flac','Live title','Album','Artist','Rock',100),
 (2,'two.flac','Studio title','Album','Artist','Rock; Live',100)`)
  hear(repo, 1, 0, 50)
  hear(repo, 1, 0, 50)
  hear(repo, 2, 0, 90)
  expect(repo.getAchievements()).toMatchObject({
    listeningSeconds: 190,
    completeAlbums: 0,
    completeLiveAlbums: 0,
    albumProgress: { completedTracks: 1, totalTracks: 2 },
  })
  hear(repo, 1, 50, 90)
  expect(repo.getAchievements()).toMatchObject({ completeAlbums: 1, completeLiveAlbums: 0 })
  db.exec("UPDATE tracks SET genre='Rock; lIvE' WHERE id=1")
  expect(repo.getAchievements().completeLiveAlbums).toBe(1)
  db.exec(
    "INSERT INTO tracks(id,file_path,title,album,album_artist,genre,duration_seconds) VALUES(3,'three.flac','New','Album','Artist','Live',100)",
  )
  expect(repo.getAchievements()).toMatchObject({
    completeAlbums: 0,
    completeLiveAlbums: 0,
    albumProgress: { completedTracks: 2, totalTracks: 3 },
  })
})
it('deduplicates retries, rejects invalid segments and refuses delayed writes after reset', () => {
  const { db, repo } = fixture()
  db.exec("INSERT INTO tracks(id,file_path,duration_seconds) VALUES(1,'one.flac',100)")
  const batch = {
    epoch: 0,
    sessionId: 'one',
    sequence: 1,
    trackId: 1,
    samples: [
      { startedAtIso: new Date().toISOString(), startSeconds: 0, endSeconds: 2, playedSeconds: 2 },
    ],
  }
  expect(repo.record(batch).ok).toBe(true)
  expect(repo.record(batch).ok).toBe(true)
  expect(repo.getAchievements().listeningSeconds).toBe(2)
  expect(
    repo.record({ ...batch, sequence: 2, samples: [{ ...batch.samples[0], endSeconds: 50 }] }).ok,
  ).toBe(false)
  new PlayStatsRepository(db).resetAll()
  expect(repo.getAchievements()).toMatchObject({
    epoch: 1,
    listeningSeconds: 0,
    listeningDays: 0,
    completeAlbums: 0,
  })
  expect(repo.record(batch)).toEqual({ ok: false, epoch: 1 })
})

it('retains actual time when database duration is unknown without inventing album completion', () => {
  const { db, repo } = fixture()
  db.exec(
    "INSERT INTO tracks(id,file_path,title,album,genre) VALUES(1,'unknown.flac','Unknown','Album','Live')",
  )
  hear(repo, 1, 60, 61)
  expect(repo.getAchievements()).toMatchObject({ listeningSeconds: 1, completeAlbums: 0 })
  db.exec('UPDATE tracks SET duration_seconds=1 WHERE id=1')
  expect(repo.getAchievements()).toMatchObject({ listeningSeconds: 1, completeAlbums: 0 })
  hear(repo, 1, 0, 0.9)
  expect(repo.getAchievements()).toMatchObject({ completeAlbums: 1, completeLiveAlbums: 1 })
})
