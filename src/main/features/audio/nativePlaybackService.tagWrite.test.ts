import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { parseAudioMetadata } from '../metadata/parseAudioMetadata'
import type { NativePlaybackEvent } from '@shared/ipc/contracts'
import { NativePlaybackService } from './nativePlaybackService'
import { PlaybackFileCoordinator } from './playbackFileCoordinator'
import { createTagAudioSnapshot, prepareTagAudioBuffer } from './tagAudioBuffer'

const mpvPath = resolve('resources/audio/mpv.exe')
const ffmpegPath = resolve('resources/audio/ffmpeg.exe')
const available = process.platform === 'win32' && existsSync(mpvPath) && existsSync(ffmpegPath)
const edit = {
  trackId: 1,
  title: 'Edited',
  artistDisplay: 'Artist',
  albumTitle: 'Album',
  albumArtistDisplay: null,
  genreDisplay: null,
  year: null,
  releaseDate: null,
}

describe.skipIf(!available)('buffered tag writes with real mpv and isolated music', () => {
  let directory: string
  let source: string
  const services: NativePlaybackService[] = []
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'auralis-buffered-tags-test-'))
    source = join(directory, 'source.flac')
    const pcm = Buffer.alloc(48000 * 30 * 4)
    for (let index = 0; index < pcm.length / 4; index++) {
      pcm.writeInt16LE(Math.round(10000 * Math.sin(index * 0.053)), index * 4)
      pcm.writeInt16LE(Math.round(12000 * Math.sin(index * 0.029)), index * 4 + 2)
    }
    const raw = join(directory, 'source.pcm')
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
        '-metadata',
        'title=Original',
        '-metadata',
        'artist=Artist',
        '-metadata',
        'album=Album',
        '-metadata',
        'composer=Composer',
        '-metadata',
        'track=3',
        source,
      ],
      { windowsHide: true },
    )
    for (const [extension, codec] of [
      ['wav', 'pcm_s16le'],
      ['mp3', 'libmp3lame'],
      ['m4a', 'aac'],
      ['ogg', 'libvorbis'],
      ['opus', 'libopus'],
    ])
      execFileSync(
        ffmpegPath,
        [
          '-nostdin',
          '-v',
          'error',
          '-i',
          source,
          '-c:a',
          codec!,
          join(directory, `source.${extension}`),
        ],
        { windowsHide: true },
      )
  })
  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.dispose()))
    vi.restoreAllMocks()
  })
  afterAll(async () => {
    if (
      !resolve(directory).startsWith(resolve(tmpdir()) + sep) ||
      !basename(directory).startsWith('auralis-buffered-tags-test-')
    )
      throw new Error('Unsafe test directory')
    await rm(directory, { recursive: true, force: true })
  })
  function setup(file = source, nextFile = file) {
    const events: NativePlaybackEvent[] = [],
      warnings: unknown[] = []
    const boundaries: string[] = []
    const coordinator = new PlaybackFileCoordinator({
      getTrackFilePath: (id) => (id === 2 ? nextFile : file),
      getTrackIdsByFilePath: (path) => (path === file ? [1] : []),
      sendToRenderer: () => {},
    })
    const service = new NativePlaybackService({
      mpvPath,
      ffmpegPath,
      coordinator,
      mpvArgs: ['--ao=null', '--prefetch-playlist=no'],
      resolveTrack: async (id) => (id === 2 ? nextFile : file),
      emit: (event) => events.push(event),
      warn: (error) => warnings.push(error),
      onBoundaryStatus: (event) => boundaries.push(event.status),
    })
    coordinator.setBufferedWriteCapability((path) => service.canWriteMetadata(path))
    services.push(service)
    return { service, coordinator, events, warnings, boundaries }
  }
  it.each(['wav', 'ogg'])(
    'writes %s tags while paused without losing composer or track number',
    async (extension) => {
      const file = join(directory, `source.${extension}`)
      const originalTags = await parseAudioMetadata(file)
      const { service, coordinator, events, warnings } = setup(file)
      await service.command({ action: 'start', session: 1, trackId: 1, volume: 1, muted: false })
      await service.command({ action: 'pause', session: 1 })
      expect(coordinator.getTrackState(1).status).toBe('playback-editable')
      const result = await service.writeMetadata(file, edit, async (commit) => {
        await commit()
      })
      expect(result, warnings.map(String).join('\n')).toEqual({ ok: true })
      const tags = await parseAudioMetadata(file)
      expect(tags.common.title).toBe('Edited')
      expect(tags.common.composer).toEqual(originalTags.common.composer)
      expect(tags.common.track).toEqual(originalTags.common.track)
      expect(events.at(-1)?.isPlaying).toBe(false)
      expect(events.filter((event) => event.kind === 'boundary' || event.kind === 'error')).toEqual(
        [],
      )
    },
    15000,
  )
  it.each(['mp3', 'm4a', 'opus'])(
    'keeps %s occupied because its EDL seam has not met the sample standard',
    async (extension) => {
      const file = join(directory, `source.${extension}`)
      const before = await readFile(file)
      const { service, coordinator } = setup(file)
      await service.command({ action: 'start', session: 1, trackId: 1, volume: 1, muted: false })
      expect(coordinator.getTrackState(1).status).toBe('playback-in-use')
      expect(await service.writeMetadata(file, edit, async () => {})).toEqual({
        ok: false,
        reason: 'playback-in-use',
      })
      expect((await readFile(file)).equals(before)).toBe(true)
    },
  )
  it('saves while paused, retains non-edited tags, and restores the same position without unpausing', async () => {
    const { service, coordinator, events, warnings } = setup()
    await service.command({ action: 'start', session: 1, trackId: 1, volume: 1, muted: false })
    await service.command({ action: 'pause', session: 1 })
    await service.command({ action: 'seek', session: 1, time: 1 })
    await vi.waitFor(() => expect(events.at(-1)!.currentTime).toBeGreaterThan(0.7))
    const position = events.at(-1)!.currentTime
    expect(coordinator.getTrackState(1).status).toBe('playback-editable')
    const result = await service.writeMetadata(source, edit, async (commit) => {
      await commit()
    })
    expect(result, warnings.map(String).join('\n')).toEqual({ ok: true })
    const tags = await parseAudioMetadata(source)
    expect(tags.common.title).toBe('Edited')
    expect(tags.common.composer).toEqual(['Composer'])
    expect(tags.common.track.no).toBe(3)
    expect(events.at(-1)?.currentTime).toBeCloseTo(position, 3)
    expect(events.at(-1)?.isPlaying).toBe(false)
    expect(events.filter((event) => ['boundary', 'ended', 'error'].includes(event.kind))).toEqual(
      [],
    )
    expect(coordinator.getTrackState(1).status).toBe('playback-editable')
    expect(warnings).toEqual([])
  }, 15000)
  it('continues playing with one logical song during a real file replacement', async () => {
    const { service, coordinator, events, warnings } = setup()
    await service.command({ action: 'start', session: 2, trackId: 1, volume: 1, muted: false })
    const start = events.length
    const result = await service.writeMetadata(
      source,
      { ...edit, title: 'Playing edit' },
      async (commit) => {
        await commit()
        expect((await parseAudioMetadata(source)).common.title).toBe('Playing edit')
      },
    )
    expect(result, warnings.map(String).join('\n')).toEqual({ ok: true })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const during = events.slice(start)
    expect(during.every((event) => event.trackId === 1 && event.session === 2)).toBe(true)
    expect(during.filter((event) => ['boundary', 'ended', 'error'].includes(event.kind))).toEqual(
      [],
    )
    expect(during.every((event) => event.duration === 30)).toBe(true)
    expect(during.every((event) => !event.buffering && event.isPlaying)).toBe(true)
    expect(coordinator.getTrackState(1).status).toBe('playback-editable')
    expect(warnings).toEqual([])
  }, 25000)
  it('returns a preparation failure without changing the file or playback when disk preparation fails', async () => {
    const { service, coordinator, events } = setup()
    await service.command({ action: 'start', session: 3, trackId: 1, volume: 1, muted: false })
    await service.command({ action: 'pause', session: 3 })
    const before = await readFile(source)
    const result = await service.writeMetadata(
      source,
      { ...edit, releaseDate: 'not-a-date' },
      async (commit) => {
        await commit()
      },
    )
    expect(result.ok).toBe(false)
    expect((await readFile(source)).equals(before)).toBe(true)
    expect(events.at(-1)?.isPlaying).toBe(false)
    expect(coordinator.getTrackState(1).status).toBe('playback-editable')
  }, 15000)
  it('cancels a pending save on stop and does not restart its old session', async () => {
    const { service, coordinator, events } = setup()
    await service.command({ action: 'start', session: 4, trackId: 1, volume: 1, muted: false })
    const before = await stat(source)
    const save = service.writeMetadata(source, { ...edit, title: 'Cancelled' }, async (commit) => {
      await commit()
    })
    await service.command({ action: 'stop', session: 5 })
    expect(await save).toEqual({ ok: false, reason: 'playback-changed' })
    expect((await stat(source)).mtimeMs).toBe(before.mtimeMs)
    expect(service.getSpectrumSource()).toBeNull()
    expect(coordinator.getTrackState(1).status).toBe('editable')
    expect(events.filter((event) => event.session === 5 && event.isPlaying)).toEqual([])
  }, 15000)
  it('retains the original and continues from the recovery snapshot when another process denies replacement', async () => {
    const { service, coordinator, events } = setup()
    const holder = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        '$handle = [System.IO.File]::Open($env:AURALIS_TEST_LOCK_FILE, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read); [Console]::Out.WriteLine("ready"); [Console]::ReadLine() | Out-Null; $handle.Dispose()',
      ],
      {
        windowsHide: true,
        env: { ...process.env, AURALIS_TEST_LOCK_FILE: source },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    const closed = new Promise<void>((resolve) => holder.once('close', () => resolve()))
    try {
      await new Promise<void>((resolve, reject) => {
        holder.stdout.once('data', () => resolve())
        holder.once('error', reject)
        holder.once('exit', (code) => {
          if (code) reject(new Error('Unable to hold isolated file'))
        })
      })
      const original = await readFile(source)
      await service.command({ action: 'start', session: 6, trackId: 1, volume: 1, muted: false })
      const result = await service.writeMetadata(
        source,
        { ...edit, title: 'Blocked edit' },
        async (commit) => {
          await commit()
        },
      )
      expect(result).toEqual({ ok: false, reason: 'file-in-use' })
      expect((await readFile(source)).equals(original)).toBe(true)
      expect(events.filter((event) => event.kind === 'error' || event.kind === 'boundary')).toEqual(
        [],
      )
      await service.command({ action: 'seek', session: 6, time: 2 })
      await vi.waitFor(() => expect(coordinator.getTrackState(1).status).toBe('playback-editable'))
      expect(service.getSpectrumSource()?.path).not.toBe(source)
    } finally {
      holder.stdin.end('\n')
      await closed
    }
  }, 15000)
  it('reports a restore failure and keeps the snapshot playing when reconciliation outlasts the PCM buffer', async () => {
    const { service, events, warnings } = setup()
    await service.command({ action: 'start', session: 7, trackId: 1, volume: 1, muted: false })
    const result = await service.writeMetadata(
      source,
      { ...edit, title: 'Slow reconciliation' },
      async (commit) => {
        await commit()
        await new Promise((resolve) => setTimeout(resolve, 9500))
      },
    )
    expect(result, warnings.map(String).join('\n')).toEqual({
      ok: false,
      reason: 'playback-restore-failed',
    })
    expect(events.filter((event) => ['boundary', 'ended', 'error'].includes(event.kind))).toEqual(
      [],
    )
    expect(service.getSpectrumSource()?.path).not.toBe(source)
    expect(events.at(-1)?.isPlaying).toBe(true)
    expect((await parseAudioMetadata(source)).common.title).toBe('Slow reconciliation')
  }, 25000)
  it('a seek cancels preparation without rewriting the file or restoring the old position', async () => {
    const { service, coordinator, events } = setup()
    await service.command({ action: 'start', session: 8, trackId: 1, volume: 1, muted: false })
    await service.command({ action: 'pause', session: 8 })
    const original = await readFile(source)
    const save = service.writeMetadata(source, edit, async (commit) => {
      await commit()
    })
    await service.command({ action: 'seek', session: 8, time: 5 })
    expect(await save).toEqual({ ok: false, reason: 'playback-changed' })
    expect((await readFile(source)).equals(original)).toBe(true)
    expect(events.at(-1)!.currentTime).toBeGreaterThan(4.5)
    expect(coordinator.getTrackState(1).status).toBe('playback-editable')
  }, 15000)
  it('creates a bounded exact PCM interval and keeps its recovery snapshot independent of the original', async () => {
    const snapshot = await createTagAudioSnapshot(source)
    const buffer = await prepareTagAudioBuffer(
      mpvPath,
      ffmpegPath,
      snapshot.path,
      1,
      30,
      true,
      new AbortController().signal,
    )
    try {
      expect(buffer.start).toBe(1)
      expect(buffer.end).toBe(9)
      expect(buffer.frames).toBe(48000 * 8)
      expect((await stat(buffer.path)).size).toBeLessThan(64 * 1024 * 1024)
      expect(snapshot.path).not.toBe(source)
    } finally {
      await buffer.dispose()
      await snapshot.dispose()
    }
  }, 15000)
  it('saves a shortened tail buffer and emits exactly one real song end', async () => {
    const file = join(directory, 'tail.flac')
    execFileSync(
      ffmpegPath,
      ['-nostdin', '-v', 'error', '-i', source, '-t', '9', '-c:a', 'flac', file],
      { windowsHide: true },
    )
    const { service, coordinator, events, warnings } = setup(file)
    await service.command({ action: 'start', session: 9, trackId: 1, volume: 1, muted: false })
    const result = await service.writeMetadata(file, edit, async (commit) => {
      await commit()
    })
    expect(result, warnings.map(String).join('\n')).toEqual({ ok: true })
    await vi.waitFor(
      () => expect(events.filter((event) => event.kind === 'ended')).toHaveLength(1),
      { timeout: 12000 },
    )
    expect(events.filter((event) => ['boundary', 'error'].includes(event.kind))).toEqual([])
    expect(coordinator.getTrackState(1).status).toBe('editable')
  }, 20000)
  it('serializes repeated saves and lets a later seek leave the EDL continuation', async () => {
    const { service, events, warnings } = setup()
    await service.command({ action: 'start', session: 10, trackId: 1, volume: 1, muted: false })
    const save = service.writeMetadata(source, edit, async (commit) => {
      await commit()
    })
    expect(await service.writeMetadata(source, edit, async () => {})).toEqual({
      ok: false,
      reason: 'playback-in-use',
    })
    expect(await save, warnings.map(String).join('\n')).toEqual({ ok: true })
    await service.command({ action: 'pause', session: 10 })
    const position = events.at(-1)!.currentTime
    expect(
      await service.writeMetadata(source, { ...edit, title: 'Second save' }, async (commit) => {
        await commit()
      }),
    ).toEqual({ ok: true })
    expect(events.at(-1)!.currentTime).toBeCloseTo(position, 3)
    await service.command({ action: 'resume', session: 10 })
    await service.command({ action: 'seek', session: 10, time: 2 })
    await vi.waitFor(() => {
      expect(service.getSpectrumSource()?.currentTime).toBeGreaterThan(1.5)
      expect(service.getSpectrumSource()!.currentTime).toBeLessThan(4)
    })
    expect(events.filter((event) => ['boundary', 'error'].includes(event.kind))).toEqual([])
  }, 25000)
  it('cancels and replans a queued soft transition while saving the current song', async () => {
    const next = join(directory, 'next.flac')
    execFileSync(
      ffmpegPath,
      [
        '-nostdin',
        '-v',
        'error',
        '-i',
        source,
        '-c:a',
        'copy',
        '-metadata',
        'album=Next album',
        next,
      ],
      { windowsHide: true },
    )
    const { service, boundaries, events, warnings } = setup(source, next)
    await service.command({ action: 'start', session: 11, trackId: 1, volume: 1, muted: false })
    await service.command({ action: 'pause', session: 11 })
    await service.command({
      action: 'next',
      session: 11,
      trackId: 2,
      softTransition: true,
      trimDigitalSilence: false,
    })
    await vi.waitFor(() => expect(boundaries).toContain('applied'), { timeout: 8000 })
    expect(service.canWriteMetadata(source)).toBe(true)
    expect(
      await service.writeMetadata(source, edit, async (commit) => {
        await commit()
      }),
      warnings.map(String).join('\n'),
    ).toEqual({ ok: true })
    await vi.waitFor(
      () => expect(boundaries.filter((status) => status === 'applied').length).toBeGreaterThan(1),
      { timeout: 8000 },
    )
    expect(events.filter((event) => ['boundary', 'ended', 'error'].includes(event.kind))).toEqual(
      [],
    )
  }, 20000)
  it('lets seek during the exclusive window cancel the old continuation without losing recovery audio', async () => {
    const { service, events, coordinator } = setup()
    await service.command({ action: 'start', session: 12, trackId: 1, volume: 1, muted: false })
    let entered!: () => void, release!: () => void
    const bridge = new Promise<void>((resolve) => {
      entered = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = await readFile(source)
    const save = service.writeMetadata(source, edit, async (commit) => {
      entered()
      await gate
      await commit()
    })
    await bridge
    await service.command({ action: 'seek', session: 12, time: 2 })
    release()
    expect(await save).toEqual({ ok: false, reason: 'playback-changed' })
    await vi.waitFor(() => {
      expect(events.at(-1)!.currentTime).toBeGreaterThan(1.5)
      expect(events.at(-1)!.currentTime).toBeLessThan(4)
    })
    expect((await readFile(source)).equals(original)).toBe(true)
    expect(service.getSpectrumSource()?.path).not.toBe(source)
    expect(coordinator.getTrackState(1).status).toBe('playback-editable')
    expect(events.filter((event) => ['boundary', 'error'].includes(event.kind))).toEqual([])
  }, 15000)
})
