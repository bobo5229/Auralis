import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { expect, it, vi } from 'vitest'
import { migrateDatabase } from '../database/schema'
import { TrackRepository } from '../repositories/trackRepository'
import type { SmartPlaylistRepository } from '../repositories/smartPlaylistRepository'
import { SmartPlaylistService } from './smartPlaylistService'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database

it('reuses unchanged results and observes local and worker writes without waiting for TTL', () => {
  const dir = mkdtempSync(join(tmpdir(), 'auralis-smart-cache-'))
  const db = new DatabaseCtor(join(dir, 'test.sqlite'))
  let worker: Database.Database | undefined
  try {
    db.pragma('journal_mode = WAL')
    migrateDatabase(db)
    db.exec("INSERT INTO tracks(file_path,title,genre) VALUES ('a.flac','A','Rock')")
    const repo = new TrackRepository(db)
    const read = vi.spyOn(repo, 'getAll')
    const service = new SmartPlaylistService(
      {
        getById: () => ({
          id: 1,
          name: 'Rock',
          rule: {
            expression: { type: 'predicate', field: 'genre', operator: 'has', value: 'rock' },
          },
        }),
      } as unknown as SmartPlaylistRepository,
      repo,
    )
    expect(service.getDetail(1)?.tracks.map((track) => track.title)).toEqual(['A'])
    service.getDetail(1)
    expect(read).toHaveBeenCalledTimes(1)
    db.exec("UPDATE tracks SET title = 'B'")
    expect(service.getDetail(1)?.tracks.map((track) => track.title)).toEqual(['B'])
    worker = new DatabaseCtor(join(dir, 'test.sqlite'))
    worker.exec("UPDATE tracks SET genre = 'Jazz'")
    expect(service.getDetail(1)?.tracks).toEqual([])
    expect(read).toHaveBeenCalledTimes(3)
  } finally {
    worker?.close()
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
