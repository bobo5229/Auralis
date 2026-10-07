import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '../../database/schema'
import { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import { MetadataRefreshService } from './metadataRefreshService'
import { NativePlaybackService } from '../audio/nativePlaybackService'
import { PlaybackFileCoordinator } from '../audio/playbackFileCoordinator'
import { parseAudioMetadata } from './parseAudioMetadata'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const mpv = resolve('resources/audio/mpv.exe'),
  ffmpeg = resolve('resources/audio/ffmpeg.exe')

describe('buffered file and database commit with real Electron, mpv and isolated data', () => {
  let directory: string, source: string, db: Database.Database, player: NativePlaybackService
  let metadata: MetadataRefreshService
  const warnings: unknown[] = []
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'auralis-buffered-db-'))
    source = join(directory, 'source.flac')
    const cover = join(directory, 'cover.png')
    execFileSync(
      ffmpeg,
      [
        '-nostdin',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=red:s=32x32',
        '-frames:v',
        '1',
        cover,
      ],
      { windowsHide: true },
    )
    execFileSync(
      ffmpeg,
      [
        '-nostdin',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=duration=20',
        '-i',
        cover,
        '-map',
        '0:a',
        '-map',
        '1:v',
        '-c:a',
        'flac',
        '-c:v',
        'copy',
        '-disposition:v',
        'attached_pic',
        '-metadata:s:v',
        'title=Album cover',
        '-metadata:s:v',
        'comment=Cover (front)',
        '-metadata',
        'title=Before',
        '-metadata',
        'composer=Composer',
        '-metadata',
        'track=3',
        '-metadata',
        'AURALIS_PRIVATE=retained',
        source,
      ],
      { windowsHide: true },
    )
    db = new DatabaseCtor(':memory:')
    migrateDatabase(db)
    db.prepare('INSERT INTO tracks (id,file_path,title) VALUES (1,?,?)').run(source, 'Before')
    const repository = new MetadataRefreshRepository(db)
    const coordinator = new PlaybackFileCoordinator({
      getTrackFilePath: (id) => repository.getTrackFilePath(id),
      getTrackIdsByFilePath: () => [1],
      sendToRenderer: () => {},
    })
    player = new NativePlaybackService({
      mpvPath: mpv,
      ffmpegPath: ffmpeg,
      coordinator,
      mpvArgs: ['--ao=null'],
      resolveTrack: async () => source,
      emit: () => {},
      warn: (error) => warnings.push(error),
    })
    coordinator.setBufferedWriteCapability((path) => player.canWriteMetadata(path))
    metadata = new MetadataRefreshService(
      repository,
      join(directory, 'artwork'),
      () => {},
      ffmpeg,
      coordinator,
    )
    metadata.setBufferedTagWriteHandler((...args) => player.writeMetadata(...args))
  })
  afterAll(async () => {
    await Promise.all([metadata?.shutdown(), player?.dispose()])
    db?.close()
    if (
      !resolve(directory).startsWith(resolve(tmpdir()) + sep) ||
      !basename(directory).startsWith('auralis-buffered-db-')
    )
      throw new Error('Unsafe test directory')
    await rm(directory, { recursive: true, force: true })
  })
  it('commits verified tags, fingerprint and artwork together while preserving private fields', async () => {
    const before = await parseAudioMetadata(source)
    await player.command({ action: 'start', session: 1, trackId: 1, volume: 1, muted: false })
    await player.command({ action: 'pause', session: 1 })
    const result = await metadata.updateTrackMetadata({
      trackId: 1,
      title: 'After',
      artistDisplay: 'Artist',
      albumTitle: 'Album',
      albumArtistDisplay: null,
      genreDisplay: 'Ambient',
      year: 2026,
      releaseDate: '2026',
    })
    expect(result, warnings.map(String).join('\n')).toEqual({ ok: true })
    const after = await parseAudioMetadata(source)
    expect(after.common.picture).toEqual(before.common.picture)
    expect(after.common.composer).toEqual(before.common.composer)
    expect(after.common.track).toEqual(before.common.track)
    expect(after.native.vorbis?.find((tag) => tag.id === 'AURALIS_PRIVATE')?.value).toBe('retained')
    const row = db
      .prepare(
        'SELECT title,artist,composer,track_no,file_size,file_mtime_ms FROM tracks WHERE id=1',
      )
      .get() as Record<string, unknown>
    const fingerprint = await stat(source)
    expect(row).toMatchObject({
      title: 'After',
      artist: 'Artist',
      composer: 'Composer',
      track_no: 3,
      file_size: fingerprint.size,
      file_mtime_ms: fingerprint.mtimeMs,
    })
    expect(
      (
        db
          .prepare('SELECT artwork_cache_key FROM library_track_display WHERE id=1')
          .get() as Record<string, unknown>
      ).artwork_cache_key,
    ).toBeTruthy()
    expect(db.prepare('SELECT title,artist FROM library_track_display WHERE id=1').get()).toEqual({
      title: 'After',
      artist: 'Artist',
    })
    expect(player.getSpectrumSource()?.isPlaying).toBe(false)
    expect(warnings).toEqual([])
  }, 15000)
})
