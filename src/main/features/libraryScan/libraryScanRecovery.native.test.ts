import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '@main/database/schema'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { ScanJobRepository } from '@main/repositories/scanJobRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { LibraryScanPersistence } from './libraryScanPersistence'
import { LibraryScanReporter } from './libraryScanReporter'
import { LibraryScanTrackReader } from './libraryScanTrackReader'
import { LibraryScanArtwork } from './libraryScanArtwork'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database

it('keeps a missing record missing when its enumerated file disappears before stat', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'auralis-scan-recovery-'))
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    const roots = new LibraryRootRepository(db)
    const jobs = new ScanJobRepository(db)
    const tracks = new TrackRepository(db)
    const root = roots.upsertByPath(directory)
    const filePath = join(directory, 'vanished.flac')
    db.prepare("INSERT INTO tracks(file_path,title,availability) VALUES(?, 'Song', 'missing')").run(
      filePath,
    )
    const job = jobs.create(root.id)
    const changed = vi.fn()
    const persistence = new LibraryScanPersistence(db, roots, jobs, tracks, {
      progress: vi.fn(),
      changed,
    })
    persistence.begin()
    const reporter = new LibraryScanReporter(job.jobId, (message) =>
      persistence.handleMessage(message, job.jobId),
    )
    const reader = new LibraryScanTrackReader(
      tracks.getKnownFiles(),
      new LibraryScanArtwork(directory),
      (path, reason) => reporter.reportFileFailure(path, reason),
    )
    reporter.beginScanning(0)
    reporter.discoverFile()
    // Enumeration has seen this path; the real stat now observes its absence.
    reporter.handleReadResult(await reader.read(filePath), filePath)
    reporter.complete()
    expect(jobs.getById(job.jobId)).toMatchObject({ status: 'completed', failedFiles: 1 })
    expect(db.prepare('SELECT availability FROM tracks WHERE file_path=?').get(filePath)).toEqual({
      availability: 'missing',
    })
    expect(changed).not.toHaveBeenCalled()
  } finally {
    db.close()
    if (directory.startsWith(join(tmpdir(), 'auralis-scan-recovery-')))
      rmSync(directory, { recursive: true, force: true })
  }
})

it.each([false, true])(
  'protects thousands of unreadable directories with a nonempty inventory: %s',
  (hasFound) => {
    const db = new DatabaseCtor(':memory:')
    try {
      migrateDatabase(db)
      const tracks = new TrackRepository(db)
      const root = 'C:\\isolated%_~'
      const unreadable = Array.from({ length: 1100 }, (_, index) => join(root, String(index)))
      const paths = [
        join(unreadable[0], 'first.flac'),
        join(unreadable.at(-1)!, 'last.flac'),
        join(root, 'missing.flac'),
        join(root, 'found.flac'),
        `${root}-adjacent\\other.flac`,
      ]
      const insert = db.prepare('INSERT INTO tracks(file_path) VALUES(?)')
      for (const path of paths) insert.run(path)
      const expected = tracks.getTrackIdsByFilePaths(hasFound ? [paths[2]] : [paths[2], paths[3]])
      expect(
        tracks.markMissingUnderRootExcept(root, hasFound ? [paths[3]] : [], unreadable).sort(),
      ).toEqual(expected.sort())
      expect(
        tracks
          .getMissingCandidates()
          .map((item) => item.filePath)
          .sort(),
      ).toEqual((hasFound ? [paths[2]] : [paths[2], paths[3]]).sort())
      expect(db.inTransaction).toBe(false)
    } finally {
      db.close()
    }
  },
)
