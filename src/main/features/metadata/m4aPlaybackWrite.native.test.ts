import { createRequire } from 'node:module'
import type Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { migrateDatabase } from '../../database/schema'
import { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import { MetadataRefreshService } from './metadataRefreshService'
import { NativePlaybackService } from '../audio/nativePlaybackService'
import { PlaybackFileCoordinator } from '../audio/playbackFileCoordinator'
import type { NativePlaybackEvent } from '@shared/ipc/contracts'
import { parseAudioMetadata } from './parseAudioMetadata'
import { publishWindowsM4a } from './windowsM4aPublication'
import { copyFile } from 'node:fs/promises'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const mpvPath = resolve('resources/audio/mpv.exe'),
  ffmpegPath = resolve('resources/audio/ffmpeg.exe')
const edit = (trackId: number, title: string) => ({
  trackId,
  title,
  artistDisplay: 'New Artist',
  albumTitle: 'New Album',
  albumArtistDisplay: null,
  genreDisplay: 'Jazz',
  year: 2026,
  releaseDate: '2026',
})

describe('M4A publication through native playback, metadata service and real Electron SQLite', () => {
  let root: string, db: Database.Database, repository: MetadataRefreshRepository
  const paths = new Map<number, string>()
  const players: NativePlaybackService[] = []
  const services: MetadataRefreshService[] = []
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'auralis-mpv-m4a-production-'))
    db = new DatabaseCtor(':memory:')
    migrateDatabase(db)
    for (const [codec, base] of [
      ['aac', 1],
      ['alac', 3],
    ] as const) {
      for (const id of [base, base + 1]) {
        const raw = join(root, `${id}.s16`),
          source = join(root, `${id}.m4a`)
        const pcm = Buffer.alloc(48000 * 6 * 4)
        let random = 215324 + id
        for (let n = 0; n < pcm.length / 2; n++) {
          random = (Math.imul(random, 1664525) + 1013904223) >>> 0
          pcm.writeInt16LE(Math.round((random / 2 ** 32 - 0.5) * 16000), n * 2)
        }
        await writeFile(raw, pcm)
        execFileSync(
          ffmpegPath,
          [
            '-nostdin',
            '-v',
            'error',
            '-f',
            's16le',
            '-ar',
            '48000',
            '-ac',
            '2',
            '-i',
            raw,
            '-c:a',
            codec,
            '-movflags',
            '+faststart',
            '-metadata',
            'title=Before',
            '-metadata',
            'composer=Retained',
            source,
          ],
          { windowsHide: true },
        )
        paths.set(id, source)
        db.prepare('INSERT INTO tracks (id,file_path,title) VALUES (?,?,?)').run(
          id,
          source,
          'Before',
        )
      }
    }
    repository = new MetadataRefreshRepository(db)
  })
  afterAll(async () => {
    await Promise.all(services.map((s) => s.shutdown()))
    await Promise.all(players.map((s) => s.dispose()))
    db?.close()
    if (basename(root).startsWith('auralis-mpv-m4a-production-'))
      await rm(root, { recursive: true, force: true })
  })
  function setup(base: number, output?: string) {
    const events: NativePlaybackEvent[] = [],
      warnings: unknown[] = []
    const send = vi.fn()
    const coordinator = new PlaybackFileCoordinator({
      getTrackFilePath: (id) => paths.get(id) ?? null,
      getTrackIdsByFilePath: (path) => [...paths].filter(([, p]) => p === path).map(([id]) => id),
      sendToRenderer: send,
    })
    const player = new NativePlaybackService({
      mpvPath,
      ffmpegPath,
      coordinator,
      resolveTrack: async (id) => paths.get(id)!,
      emit: (e) => events.push(e),
      warn: (e) => warnings.push(e),
      mpvArgs: output
        ? [
            '--ao=pcm',
            `--ao-pcm-file=${output}`,
            '--ao-pcm-waveheader=no',
            '--af=lavfi=[arealtime]',
            '--audio-samplerate=48000',
            '--audio-channels=stereo',
            '--prefetch-playlist=yes',
            '--cache=yes',
            '--demuxer-readahead-secs=30',
          ]
        : ['--ao=null'],
    })
    coordinator.setFileReplacementCapability((path) => player.canReplaceMetadata(path))
    const metadata = new MetadataRefreshService(
      repository,
      join(root, 'artwork'),
      send,
      ffmpegPath,
      coordinator,
    )
    metadata.setPlaybackTagWriteHandler((...args) => player.writeMetadata(...args))
    players.push(player)
    services.push(metadata)
    return { player, metadata, coordinator, events, warnings, send, base }
  }
  it.each([
    ['aac', 1],
    ['alac', 3],
  ] as const)(
    'preserves every sample of a %s queue while saving current and preloaded next tags',
    async (codec, base) => {
      async function play(editTags: boolean) {
        const output = join(root, `${codec}-${editTags}.f32`)
        const { player, metadata, coordinator, events, warnings, send } = setup(base, output)
        await player.command({
          action: 'start',
          session: 1,
          trackId: base,
          volume: 1,
          muted: false,
        })
        expect(
          await player.command({
            action: 'next',
            session: 1,
            trackId: base + 1,
            trimDigitalSilence: false,
          }),
        ).toEqual({ accepted: true })
        if (editTags) {
          await vi.waitFor(() => expect(events.at(-1)?.currentTime).toBeGreaterThan(0.5), {
            timeout: 3500,
          })
          // Confirm mpv itself has opened the next file, beyond merely owning its lease.
          await vi.waitFor(() => {
            const probe = JSON.parse(
              execFileSync(
                'python',
                [resolve('scripts/mpv-m4a-write-probe/handle.py'), 'probe', paths.get(base + 1)!],
                { windowsHide: true },
              ).toString(),
            )
            expect(probe.winError).toBe(32)
          })
          for (const [id, title] of [
            [base, 'Current edited'],
            [base + 1, '大标签'.repeat(44000)],
            [base + 1, 'Next edited'],
          ] as const) {
            expect(coordinator.getTrackState(id).status).toBe('playback-editable')
            expect(
              await metadata.updateTrackMetadata(edit(id, title)),
              warnings.map(String).join('\n'),
            ).toEqual({ ok: true })
            expect((await parseAudioMetadata(paths.get(id)!)).common.title).toBe(title)
            const fingerprint = await stat(paths.get(id)!)
            expect(
              JSON.parse(
                db
                  .prepare('SELECT file_stat_fingerprint FROM tracks WHERE id=?')
                  .pluck()
                  .get(id) as string,
              ),
            ).toEqual([
              fingerprint.size,
              fingerprint.mtimeMs,
              fingerprint.ctimeMs,
              fingerprint.dev,
              fingerprint.ino,
            ])
            expect(
              db.prepare('SELECT title,file_size,file_mtime_ms FROM tracks WHERE id=?').get(id),
            ).toEqual({ title, file_size: fingerprint.size, file_mtime_ms: fingerprint.mtimeMs })
            expect(send).toHaveBeenCalledWith('library:changed', {
              reason: 'metadata-refresh',
              trackIds: [id],
              filePaths: [paths.get(id)!],
            })
          }
        }
        await vi.waitFor(() => expect(events.some((e) => e.kind === 'ended')).toBe(true), {
          timeout: 18000,
        })
        await player.dispose()
        expect(events.filter((e) => e.kind === 'boundary')).toHaveLength(1)
        expect(events.filter((e) => e.kind === 'error')).toEqual([])
        expect(warnings).toEqual([])
        return readFile(output)
      }
      const baseline = await play(false)
      const edited = await play(true)
      expect(edited.length).toBeGreaterThan(48000 * 10 * 8)
      expect(edited.equals(baseline)).toBe(true)
    },
    40000,
  )
  it('keeps old bytes and playback on publication failure, releases the write gate, and allows retry', async () => {
    const { player, metadata, coordinator, warnings, events, send } = setup(1)
    const source = paths.get(1)!
    await player.command({ action: 'start', session: 1, trackId: 1, volume: 1, muted: false })
    await player.command({ action: 'pause', session: 1 })
    await player.command({ action: 'seek', session: 1, time: 2 })
    await vi.waitFor(() => expect(events.at(-1)?.currentTime).toBeGreaterThan(1))
    const beforePlayback = player.getSpectrumSource()
    const before = await readFile(source)
    const beforeRow = db.prepare('SELECT title FROM tracks WHERE id=1').get()
    // Hold reconciliation as if a refresh job is active, to inspect failure then retry.
    const activeJob = vi.spyOn(metadata, 'hasActiveJob').mockReturnValue(true)
    const blocker = spawn(
      'python',
      [resolve('scripts/mpv-m4a-write-probe/handle.py'), 'hold', source],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let ready = ''
    blocker.stdout.on('data', (b) => (ready += b))
    try {
      await vi.waitFor(() => expect(ready).toContain('\n'))
      expect(JSON.parse(ready).opened).toBe(true)
      expect(await metadata.updateTrackMetadata(edit(1, 'Blocked'))).toEqual({
        ok: false,
        reason: 'file-in-use',
      })
      expect((await readFile(source)).equals(before)).toBe(true)
      expect(db.prepare('SELECT title FROM tracks WHERE id=1').get()).toEqual(beforeRow)
      expect(send.mock.calls.some(([, event]) => event.reason === 'metadata-refresh')).toBe(false)
      expect(player.getSpectrumSource()).toEqual(beforePlayback)
      expect(coordinator.getTrackState(1).status).toBe('playback-editable')
      expect((await readdir(root)).some((n) => n.includes('auralis-replacement-'))).toBe(false)
    } finally {
      const closed = new Promise<void>((yes) => blocker.once('close', () => yes()))
      blocker.stdin.end('\n')
      await closed
    }
    expect(warnings).toHaveLength(1)
    expect(await metadata.updateTrackMetadata(edit(1, 'Retry succeeded'))).toEqual({ ok: true })
    expect(db.prepare('SELECT title FROM tracks WHERE id=1').get()).toEqual({
      title: 'Retry succeeded',
    })
    activeJob.mockRestore()
    expect(player.getSpectrumSource()).toEqual(beforePlayback)
    await player.dispose()
  }, 10000)
  it('rejects a stale file identity and leaves the original and staged bytes intact', async () => {
    const original = paths.get(1)!,
      staging = original + '.auralis-replacement-stale-test'
    await copyFile(original, staging)
    const expected = await stat(original, { bigint: true })
    const before = await readFile(original)
    await expect(
      publishWindowsM4a(original, staging, { ...expected, ino: expected.ino + 1n }, ffmpegPath),
    ).rejects.toMatchObject({ reason: 'file-changed' })
    expect((await readFile(original)).equals(before)).toBe(true)
    expect((await readFile(staging)).equals(before)).toBe(true)
    await rm(staging)
  })
})
