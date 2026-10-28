import { expect, it } from 'vitest'
import { createRequire } from 'node:module'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '../../src/main/database/schema'
import { BadgeAchievementRepository } from '../../src/main/repositories/badgeAchievementRepository'
const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database

it('counts actual listening time when a decoder knows duration but library metadata does not', () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    db.exec("INSERT INTO tracks(id,file_path,album,artist,duration_seconds) VALUES(1,'unknown-duration.flac','Album','Artist',NULL)")
    const repository = new BadgeAchievementRepository(db)
    const result = repository.record({ epoch: 0, sessionId: 'decoder-knows-duration', sequence: 1, trackId: 1, samples: [{ startedAtIso: '2026-10-29T04:00:00.000Z', startSeconds: 0, endSeconds: 1, playedSeconds: 1 }] })
    expect(repository.getAchievements().listeningSeconds).toBe(1)
    expect(result.ok).toBe(true)
    expect(repository.getAchievements().completeAlbums).toBe(0)
  } finally { db.close() }
})
