import { createLibraryScanEvents } from '@main/ipc/libraryScanEvents'
import { createRequire } from 'node:module'
import { copyFile, mkdtemp, rename, rm, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type Database from 'better-sqlite3'
import { afterEach, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../../database/schema'
import { TrackRepository } from '../../repositories/trackRepository'
import { parseAudioMetadata } from '../metadata/parseAudioMetadata'
import { LibraryIncrementalImportService } from './libraryIncrementalImportService'

const artwork = vi.hoisted(() => ({ hook: undefined as (() => Promise<void>) | undefined }))
vi.mock('../artwork/resolveArtworkForFile', () => ({
  readArtworkForFile: async () => {
    await artwork.hook?.()
    return { artworkCacheKey: null, artworkRead: { status: 'absent' } }
  },
}))

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const roots: string[] = []
afterEach(async () => {
  artwork.hook = undefined
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function generateAudio(filePath: string, title: string, isrc: string) {
  await promisify(execFile)(
    fileURLToPath(new URL('../../../../resources/audio/ffmpeg.exe', import.meta.url)),
    [
      '-nostdin',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=duration=0.1',
      '-metadata',
      `title=${title}`,
      '-metadata',
      'artist=Artist',
      '-metadata',
      'album=Album',
      '-metadata',
      `isrc=${isrc}`,
      filePath,
    ],
    { windowsHide: true },
  )
}

it.each(['stable', 'in-place', 'atomic-same-size-and-mtime'] as const)(
  'protects stored identity and history during actual FLAC import: %s',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'auralis-incremental-fingerprint-'))
    roots.push(root)
    const incoming = join(root, 'incoming.flac')
    const replacement = join(root, 'replacement.flac')
    const oldPath = join(root, 'old-missing.flac')
    await generateAudio(incoming, 'Song A', 'USA012600001')
    await generateAudio(replacement, 'Song B', 'USA012600002')
    if (mode === 'atomic-same-size-and-mtime') await utimes(incoming, 1720000000, 1720000000)
    const metadata = await parseAudioMetadata(incoming, { duration: true })
    const fingerprint = await stat(incoming)
    const db = new DatabaseCtor(':memory:')
    try {
      migrateDatabase(db)
      db.prepare(
        'INSERT INTO tracks(id,file_path,title,artist,album,duration_seconds,file_size,isrc) VALUES(1,?,?,?,?,?,?,?)',
      ).run(
        oldPath,
        metadata.common.title,
        metadata.common.artist,
        metadata.common.album,
        metadata.format.duration,
        fingerprint.size,
        metadata.common.isrc?.[0],
      )
      db.prepare('INSERT INTO track_play_stats(track_id,play_count) VALUES(1,7)').run()
      const repo = new TrackRepository(db)
      const send = vi.fn()
      const service = new LibraryIncrementalImportService(
        repo,
        join(root, 'cache'),
        createLibraryScanEvents(send).changed,
      )
      if (mode !== 'stable') {
        artwork.hook = async () => {
          if (mode === 'in-place') await copyFile(replacement, incoming)
          else {
            await utimes(replacement, fingerprint.atime, fingerprint.mtime)
            expect((await stat(replacement)).size).toBe(fingerprint.size)
            await rename(replacement, incoming)
            expect((await stat(incoming)).mtimeMs).toBe(fingerprint.mtimeMs)
            expect((await stat(incoming)).ino).not.toBe(fingerprint.ino)
          }
        }
      }
      const result = await service.importFiles([incoming])
      const storedIdentity = () =>
        db
          .prepare(
            'SELECT t.file_path,t.title,t.isrc,p.play_count FROM tracks t LEFT JOIN track_play_stats p ON p.track_id=t.id WHERE t.id=1',
          )
          .get()
      expect(storedIdentity()).toEqual({
        file_path: mode === 'stable' ? incoming : oldPath,
        title: 'Song A',
        isrc: 'USA012600001',
        play_count: 7,
      })
      if (mode === 'stable') {
        expect(result).toEqual({ imported: [incoming], unstable: [], failed: [] })
        expect(send).toHaveBeenCalledWith('library:changed', {
          reason: 'track-relocated',
          trackIds: [1],
          filePaths: [incoming],
        })
      } else {
        expect(result).toEqual({ imported: [], unstable: [incoming], failed: [] })
        expect(repo.getAll()).toHaveLength(1)
        expect(send).not.toHaveBeenCalled()
        // The watcher retry can import B without transferring A's ID or history.
        artwork.hook = undefined
        expect(await service.importFiles([incoming])).toEqual({
          imported: [incoming],
          unstable: [],
          failed: [],
        })
        expect(storedIdentity()).toEqual({
          file_path: oldPath,
          title: 'Song A',
          isrc: 'USA012600001',
          play_count: 7,
        })
        expect(
          db
            .prepare(
              'SELECT t.id,t.title,t.isrc,p.play_count FROM tracks t LEFT JOIN track_play_stats p ON p.track_id=t.id WHERE t.file_path=?',
            )
            .get(incoming),
        ).toEqual({ id: 2, title: 'Song B', isrc: 'USA012600002', play_count: null })
        expect(send).toHaveBeenCalledWith('library:changed', {
          reason: 'track-added',
          trackIds: [],
          filePaths: [incoming],
        })
      }
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally {
      db.close()
    }
  },
  10000,
)
