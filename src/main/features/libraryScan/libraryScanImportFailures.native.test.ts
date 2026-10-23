import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import type Database from 'better-sqlite3'
import { expect, it, vi } from 'vitest'
import { migrateDatabase } from '@main/database/schema'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { ScanJobRepository } from '@main/repositories/scanJobRepository'
import type { ScannedTrackFile } from './libraryScanTypes'
import { scanFileFingerprint } from './libraryScanFileFingerprint'
import { LibraryScanPersistence } from './libraryScanPersistence'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database

it.each(['permanent', 'recovered'] as const)(
  'reports only final import failures: %s',
  (failure) => {
    const db = new DatabaseCtor(':memory:')
    const directory = mkdtempSync(join(tmpdir(), 'auralis-import-failures-'))
    try {
      migrateDatabase(db)
      const roots = new LibraryRootRepository(db)
      const jobs = new ScanJobRepository(db)
      const repository = new TrackRepository(db)
      const root = roots.upsertByPath(directory)
      const job = jobs.create(root.id)
      const send = vi.fn()
      const persistence = new LibraryScanPersistence(db, roots, jobs, repository, send)
      const tracks: ScannedTrackFile[] = ['One', 'Two'].map((title) => {
        const filePath = join(root.path, `${title}.flac`)
        writeFileSync(filePath, Buffer.alloc(100))
        const fingerprint = scanFileFingerprint(statSync(filePath))
        return {
          filePath,
          fileFingerprint: fingerprint,
          lyricsSidecarFingerprint: '[null,null,null,null]',
          title,
          artist: 'Artist',
          album: 'Album',
          albumArtist: 'Artist',
          fileSize: 100,
          fileMtimeMs: fingerprint.mtimeMs,
          durationSeconds: 180,
          trackNo: null,
          discNo: null,
          bitrateBps: null,
          year: null,
          releaseDate: null,
          copyright: null,
          composer: null,
          genre: null,
          artworkCacheKey: null,
          lyricsText: null,
          lyricsFormat: null,
          isrc: null,
          metadataSignature: 'test',
        }
      })
      if (failure === 'permanent') {
        db.exec(
          "CREATE TRIGGER reject_import BEFORE INSERT ON tracks BEGIN SELECT RAISE(ABORT,'injected write failure'); END",
        )
      }
      persistence.begin()
      persistence.handleMessage({ type: 'tracks', payload: tracks }, job.jobId)
      if (failure === 'recovered') {
        vi.spyOn(repository, 'upsertMany').mockImplementationOnce(() => {
          throw new Error('temporary batch failure')
        })
      }
      persistence.handleMessage(
        {
          type: 'progress',
          payload: {
            jobId: job.jobId,
            status: 'scanning',
            totalFiles: 2,
            scannedFiles: 2,
            failedFiles: 0,
            currentFile: null,
            message: null,
          },
        },
        job.jobId,
      )
      persistence.handleMessage(
        {
          type: 'complete',
          payload: {
            foundFilePaths: tracks.map((track) => track.filePath),
            unreadableDirectoryPaths: [],
          },
        },
        job.jobId,
      )
      const failedFiles = failure === 'permanent' ? 2 : 0
      expect(jobs.getById(job.jobId)).toMatchObject({
        status: 'completed',
        totalFiles: 2,
        scannedFiles: 2,
        failedFiles,
      })
      expect(db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(2 - failedFiles)
      expect(db.prepare('SELECT file_path,reason FROM scan_failures ORDER BY id').all()).toEqual(
        failure === 'permanent'
          ? tracks.map((track) => ({ file_path: track.filePath, reason: 'injected write failure' }))
          : [],
      )
      expect(send.mock.calls.at(-1)?.[1]).toMatchObject({ status: 'completed', failedFiles })
    } finally {
      vi.restoreAllMocks()
      db.close()
      expect(relative(tmpdir(), directory)).toMatch(/^auralis-import-failures-[^\\/]+$/)
      rmSync(directory, { recursive: true, force: true })
    }
  },
)
