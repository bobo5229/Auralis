import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { TrackRepository } from './trackRepository'
import { PlaybackFileCoordinator } from '../features/audio/playbackFileCoordinator'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database

it('validates read leases for mixed-case catalog paths and slash aliases using real SQLite', async () => {
  const db = new DatabaseCtor(':memory:')
  try {
    db.exec('CREATE TABLE tracks (id INTEGER PRIMARY KEY, file_path TEXT NOT NULL UNIQUE)')
    const path = 'D:\\Music\\Review.flac'
    db.prepare('INSERT INTO tracks VALUES (?, ?)').run(1, path)
    db.prepare('INSERT INTO tracks VALUES (?, ?)').run(2, 'd:/music/review.flac')
    const tracks = new TrackRepository(db)
    const coordinator = new PlaybackFileCoordinator({
      getTrackFilePath: (id) => tracks.getFilePathById(id),
    })
    const lease = await coordinator.acquireReadLease(path, 'player')
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 1, path)).toBe(true)
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 2, path)).toBe(true)
    coordinator.releaseReadLease(lease.leaseId)
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 1, path)).toBe(false)
  } finally {
    db.close()
  }
})
