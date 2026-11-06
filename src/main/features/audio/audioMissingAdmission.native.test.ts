import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it, vi } from 'vitest'
import { migrateDatabase } from '@main/database/schema'
import { DatabaseWriteAdmission } from '@main/database/databaseWriteAdmission'
import { TrackRepository } from '@main/repositories/trackRepository'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { createAudioProtocolHandler } from './audioProtocol'
import { createAudioMissingHandler } from './audioMissingHandler'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
it.each([false, true])(
  'queues the assembled protocol missing callback behind a real lock; file returns=%s',
  async (returns) => {
    const directory = mkdtempSync(join(tmpdir(), 'auralis-audio-admission-'))
    const path = join(directory, 'library.sqlite')
    const file = join(directory, 'missing.wav')
    const db = new DatabaseCtor(path)
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 0')
    migrateDatabase(db)
    const tracks = new TrackRepository(db),
      roots = new LibraryRootRepository(db)
    roots.upsertByPath(directory)
    db.prepare('INSERT INTO tracks(id,file_path,title) VALUES(1,?,?)').run(file, 'Missing')
    const writer = new DatabaseCtor(path)
    const admission = new DatabaseWriteAdmission()
    const changed = vi.fn()
    const handler = createAudioProtocolHandler({
      getFilePathByTrackId: (id) => tracks.getFilePathById(id),
      getLibraryRootPaths: () => roots.list().map((root) => root.path),
      onFileMissing: createAudioMissingHandler({
        tracks,
        getRootPaths: () => roots.list().map((root) => root.path),
        admission,
        changed,
      }),
    })
    const lease = await admission.acquireExclusive()
    writer.exec('BEGIN IMMEDIATE')
    let finished = false
    const request = handler(new Request('auralis-audio://track/1')).then((response) => {
      finished = true
      return response
    })
    try {
      await delay(25)
      expect(finished).toBe(false)
      expect(changed).not.toHaveBeenCalled()
      expect(db.prepare('SELECT availability FROM tracks WHERE id=1').pluck().get()).toBe(
        'available',
      )
      if (returns) writeFileSync(file, 'returned file')
      writer.exec('ROLLBACK')
      lease.release()
      expect((await request).status).toBe(404)
      expect(db.prepare('SELECT availability FROM tracks WHERE id=1').pluck().get()).toBe(
        returns ? 'available' : 'missing',
      )
      expect(changed).toHaveBeenCalledTimes(returns ? 0 : 1)
    } finally {
      if (writer.inTransaction) writer.exec('ROLLBACK')
      lease.release()
      await request
      writer.close()
      db.close()
      rmSync(directory, { recursive: true, force: true })
    }
  },
)
