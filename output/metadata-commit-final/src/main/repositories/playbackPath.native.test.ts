import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { TrackRepository } from './trackRepository'
import { PlaybackFileCoordinator } from '../features/audio/playbackFileCoordinator'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database

it('broadcasts playback and release for mixed-case catalog paths and slash aliases using real SQLite', async () => {
  const db = new DatabaseCtor(':memory:')
  try {
    db.exec('CREATE TABLE tracks (id INTEGER PRIMARY KEY, file_path TEXT NOT NULL UNIQUE)')
    const path = 'D:\\Music\\Review.flac'
    db.prepare('INSERT INTO tracks VALUES (?, ?)').run(1, path)
    db.prepare('INSERT INTO tracks VALUES (?, ?)').run(2, 'd:/music/review.flac')
    const tracks = new TrackRepository(db)
    const events: Array<{ trackId: number; status: string }> = []
    const coordinator = new PlaybackFileCoordinator({
      getTrackFilePath: (id) => tracks.getFilePathById(id),
      getTrackIdsByFilePath: (candidate) => tracks.getTrackIdsByPlaybackPath(candidate),
      sendToRenderer: (_channel, event) => {
        events.push(event as { trackId: number; status: string })
      },
    })
    const lease = await coordinator.acquireReadLease(path, 'player')
    expect(events).toEqual([
      { trackId: 1, status: 'playback-in-use', version: lease.version },
      { trackId: 2, status: 'playback-in-use', version: lease.version },
    ])
    coordinator.releaseReadLease(lease.leaseId)
    expect(events.slice(-2).map((event) => event.status)).toEqual(['editable', 'editable'])
  } finally {
    db.close()
  }
})
