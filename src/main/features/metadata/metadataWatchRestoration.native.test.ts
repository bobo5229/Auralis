import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { mkdtemp, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type Database from 'better-sqlite3'
import { expect, it, vi } from 'vitest'
import { migrateDatabase } from '@main/database/schema'
import { TrackRepository } from '@main/repositories/trackRepository'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import type { LibraryIncrementalImportService } from '../libraryScan/libraryIncrementalImportService'
import type { MetadataRefreshService } from './metadataRefreshService'
import { MetadataWatchService } from './metadataWatchService'
import {
  encodeScanFileFingerprint,
  scanFileFingerprint,
} from '../libraryScan/libraryScanFileFingerprint'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 10000
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
  expect(predicate()).toBe(true)
}

it.each([false, true])(
  'restores an unchanged file through fs.watch and preserves linked rows (suppression: %s)',
  async (suppressRefresh) => {
    const root = await mkdtemp(join(tmpdir(), 'auralis-watch-restoration-'))
    const filePath = join(root, 'song.flac')
    const parkedPath = join(root, 'song.hold')
    let db: Database.Database | undefined
    let watcher: MetadataWatchService | undefined
    try {
      await promisify(execFile)(
        fileURLToPath(new URL('../../../../resources/audio/ffmpeg.exe', import.meta.url)),
        ['-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=0.1', '-c:a', 'flac', filePath],
        { windowsHide: true },
      )
      const originalStat = await stat(filePath)
      db = new DatabaseCtor(':memory:')
      migrateDatabase(db)
      db.prepare(
        'INSERT INTO tracks(id,file_path,title,file_size,file_mtime_ms) VALUES(1,?,?,?,?)',
      ).run(filePath, 'Song', originalStat.size, originalStat.mtimeMs)
      db.prepare('UPDATE tracks SET file_stat_fingerprint = ? WHERE id = 1').run(
        encodeScanFileFingerprint(scanFileFingerprint(originalStat)),
      )
      db.prepare('INSERT INTO track_play_stats(track_id,play_count) VALUES(1,7)').run()
      db.prepare(
        "INSERT INTO daily_track_play_stats(play_date,track_id,play_count,duration_seconds) VALUES('2026-10-03',1,7,70)",
      ).run()
      db.prepare(
        "INSERT INTO daily_play_stats(play_date,play_count,duration_seconds) VALUES('2026-10-03',7,70)",
      ).run()
      db.prepare("INSERT INTO playlists(id,name) VALUES(1,'Favorites')").run()
      db.prepare('INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(1,1,0)').run()
      db.prepare(
        "INSERT INTO track_metadata(track_id,title,source) VALUES(1,'Display title','user_edit')",
      ).run()
      const linkedTables = [
        'track_play_stats',
        'daily_track_play_stats',
        'daily_play_stats',
        'playlist_tracks',
        'track_metadata',
      ]
      const snapshot = () =>
        linkedTables.map((table) => db!.prepare(`SELECT * FROM ${table}`).all())
      const before = snapshot()
      const roots = new LibraryRootRepository(db)
      roots.upsertByPath(root)
      const repo = new TrackRepository(db)
      const markAvailable = vi.spyOn(repo, 'markAvailableByFilePaths')
      // Model successful refresh bookkeeping; actual tag/database commits are
      // covered by metadataFingerprint.native.test.ts. Renames change ctime.
      const refresh = vi.fn(() => {
        db!
          .prepare('UPDATE tracks SET file_stat_fingerprint = ? WHERE id = 1')
          .run(encodeScanFileFingerprint(scanFileFingerprint(statSync(filePath))))
      })
      const importFiles = vi.fn()
      const send = vi.fn()
      watcher = new MetadataWatchService(
        roots,
        repo,
        { refreshTracksFromFileChanges: refresh } as unknown as MetadataRefreshService,
        { importFiles } as unknown as LibraryIncrementalImportService,
        send,
      )
      const availability = () =>
        db!.prepare('SELECT availability FROM tracks WHERE id=1').pluck().get()
      watcher.start()
      await rename(filePath, parkedPath)
      await waitFor(() => availability() === 'missing')
      expect(repo.getAll()).toEqual([])
      expect(send).toHaveBeenCalledExactlyOnceWith('library:changed', {
        reason: 'track-missing',
        trackIds: [1],
        filePaths: [filePath],
      })

      if (suppressRefresh) watcher.suppressRefreshForPath(filePath)
      await rename(parkedPath, filePath)
      const restoredStat = await stat(filePath)
      expect(restoredStat.isFile()).toBe(true)
      expect([restoredStat.size, restoredStat.mtimeMs]).toEqual([
        originalStat.size,
        originalStat.mtimeMs,
      ])
      await waitFor(() => availability() === 'available')
      expect(repo.getAll().map((track) => track.id)).toEqual([1])
      expect(send).toHaveBeenCalledWith('library:changed', {
        reason: 'track-restored',
        trackIds: [1],
        filePaths: [filePath],
      })

      if (!suppressRefresh) expect(refresh).toHaveBeenCalledOnce()
      const refreshCount = refresh.mock.calls.length
      // Deliver a duplicate notification without changing the file again.
      // A second rename would create a different ctime and require another read.
      const priorStatBatches = markAvailable.mock.calls.length
      ;(watcher as unknown as { enqueueChangedPath(path: string): void }).enqueueChangedPath(
        filePath,
      )
      await waitFor(() => markAvailable.mock.calls.length > priorStatBatches)
      await watcher.pauseFlush()
      expect(send).toHaveBeenCalledTimes(2)
      expect(refresh).toHaveBeenCalledTimes(refreshCount)
      expect(importFiles).not.toHaveBeenCalled()
      expect(snapshot()).toEqual(before)
      expect(db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(1)
      expect(
        db.prepare('SELECT missing_since,file_size,file_mtime_ms FROM tracks WHERE id=1').get(),
      ).toEqual({
        missing_since: null,
        file_size: originalStat.size,
        file_mtime_ms: originalStat.mtimeMs,
      })
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally {
      await watcher?.stop()
      db?.close()
      await rm(root, { recursive: true, force: true })
    }
  },
  25000,
)
