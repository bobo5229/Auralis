import { afterAll, describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { NativePlaybackEvent } from '@shared/ipc/contracts'
import { LiveSilenceAnalyzer } from './liveSilence'
import { NativePlaybackService } from './nativePlaybackService'
import { SoftTransitionPreparer } from './softTransition'

const ffmpeg = resolve('resources/audio/ffmpeg.exe')
const mpv = resolve('resources/audio/mpv.exe')
const rate = 44100
const directories: string[] = []
const services: NativePlaybackService[] = []
afterAll(async () => {
  vi.restoreAllMocks()
  await Promise.all(services.map((service) => service.dispose()))
  for (const path of directories) {
    if (dirname(path) !== tmpdir() || !basename(path).startsWith('auralis-live-test-'))
      throw new Error('Unexpected Live test directory')
    await rm(path, { recursive: true, force: true })
  }
})
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'auralis-live-test-'))
  directories.push(path)
  return path
}
function run(executable: string, args: string[], input?: Buffer) {
  const result = spawnSync(executable, args, {
    input,
    windowsHide: true,
    timeout: 20000,
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) throw new Error(String(result.error ?? result.stderr))
  return result.stdout
}
function signal(segments: { seconds: number; level: number; rightOnly?: boolean }[]) {
  return Buffer.concat(
    segments.map(({ seconds, level, rightOnly }) => {
      const pcm = Buffer.alloc(Math.round(seconds * rate) * 8)
      for (let frame = 0; frame < pcm.length / 8; frame++) {
        const value = level * Math.cos(frame * 0.043)
        pcm.writeFloatLE(rightOnly ? 0 : value, frame * 8)
        pcm.writeFloatLE(value * 0.8, frame * 8 + 4)
      }
      return pcm
    }),
  )
}
async function fixture(dir: string, name: string, extension: string, pcm: Buffer, genre: string) {
  const path = join(dir, `${name}.${extension}`)
  const codec =
    extension === 'wav'
      ? 'pcm_f32le'
      : extension === 'mp3'
        ? 'libmp3lame'
        : extension === 'm4a'
          ? 'aac'
          : 'flac'
  run(
    ffmpeg,
    [
      '-v',
      'error',
      '-f',
      'f32le',
      '-ar',
      String(rate),
      '-ac',
      '2',
      '-i',
      'pipe:0',
      '-c:a',
      codec,
      '-metadata',
      `genre=${genre}`,
      '-metadata',
      'album=Concert',
      ...(extension === 'mp3' ? ['-id3v2_version', '3'] : []),
      path,
    ],
    pcm,
  )
  return path
}
async function until(predicate: () => boolean, diagnostics: () => unknown, timeout = 10000) {
  const deadline = Date.now() + timeout
  while (!predicate() && Date.now() < deadline) await delay(20)
  expect(predicate(), JSON.stringify(diagnostics())).toBe(true)
}
function render(path: string, output: string, options: string[]) {
  run(mpv, [
    '--no-config',
    '--load-scripts=no',
    '--video=no',
    '--audio-display=no',
    '--volume=100',
    '--replaygain=no',
    '--ao=pcm',
    '--ao-pcm-waveheader=no',
    '--audio-format=float',
    `--ao-pcm-file=${output}`,
    ...options,
    '--',
    path,
  ])
}
const tone = (seconds: number, level = 0.2) => ({ seconds, level })
const silence = (seconds: number) => tone(seconds, 0)

describe.skipIf(!existsSync(ffmpeg) || !existsSync(mpv))('isolated real Live playback', () => {
  it.each([
    ['wav', 'Live', 'Pop'],
    ['flac', 'Pop', ' LIVE '],
    ['mp3', 'Live;Cantopop', 'Pop'],
    ['m4a', 'Pop', 'Pop; Live'],
  ])(
    'joins %s edges with genres %s / %s without mixing or losing inner pauses',
    async (extension, leftGenre, rightGenre) => {
      const dir = await directory()
      const a = signal([tone(3), silence(1.25), tone(3), silence(2)])
      const b = signal([silence(1.5), tone(3, 0.3), silence(1.25), tone(3, 0.3)])
      const paths = [
        await fixture(dir, 'a', extension, a, leftGenre),
        await fixture(dir, 'b', extension, b, rightGenre),
      ]
      const hashes = await Promise.all(
        paths.map(async (path) =>
          createHash('sha256')
            .update(await readFile(path))
            .digest('hex'),
        ),
      )
      const plan = await new LiveSilenceAnalyzer(ffmpeg, mpv).boundary(
        paths[0],
        paths[1],
        new AbortController().signal,
      )
      expect(plan.live).toBe(true)
      expect(plan.boundary).not.toBeNull()
      const boundary = plan.boundary!
      expect(boundary.start).toBeCloseTo(1.5, 1)
      expect(boundary.end).toBeCloseTo(7.25, 1)
      const output = join(dir, 'joined.pcm')
      const statuses: string[] = [],
        events: NativePlaybackEvent[] = [],
        warnings: unknown[] = []
      const prepare = vi.spyOn(SoftTransitionPreparer.prototype, 'prepare')
      const service = new NativePlaybackService({
        mpvPath: mpv,
        ffmpegPath: ffmpeg,
        mpvArgs: ['--ao=pcm', '--ao-pcm-waveheader=no', `--ao-pcm-file=${output}`, '--pause=yes'],
        resolveTrack: async (id) => paths[id - 1],
        emit: (event) => events.push(event),
        warn: (error) => warnings.push(error),
        onBoundaryStatus: (event) => statuses.push(event.status),
      })
      services.push(service)
      await service.command({ action: 'start', session: 1, trackId: 1, volume: 1, muted: false })
      await service.command({
        action: 'next',
        session: 1,
        trackId: 2,
        trimDigitalSilence: false,
        softTransition: true,
        softTransitionDurationSeconds: 6,
      })
      await until(
        () => statuses.includes('applied'),
        () => ({ statuses, warnings }),
      )
      expect(prepare).not.toHaveBeenCalled()
      prepare.mockRestore()
      await service.command({ action: 'resume', session: 1 })
      await until(
        () => events.some((event) => event.kind === 'ended'),
        () => ({ events: events.slice(-8), warnings }),
      )
      await service.dispose()
      const segments = [join(dir, 'a.pcm'), join(dir, 'b.pcm')]
      render(paths[0], segments[0], [`--end=${boundary.end}`])
      render(paths[1], segments[1], [`--af=lavfi=[atrim=start=${boundary.start}]`])
      const expected = Buffer.concat(await Promise.all(segments.map((path) => readFile(path))))
      const actual = await readFile(output)
      expect(actual.length).toBe(expected.length)
      let error = 0
      for (let i = 0; i < actual.length; i += 4)
        error = Math.max(error, Math.abs(actual.readFloatLE(i) - expected.readFloatLE(i)))
      expect(error).toBeLessThan(0.00002)
      // Both 1.25-second interior pauses survive in full; the 3.5 seconds at the join do not.
      expect(actual.length / 8 / rate).toBeCloseTo(14.5, 1)
      if (extension === 'wav') {
        const ideal = Buffer.concat([
          a.subarray(0, Math.round(7.25 * rate) * 8),
          b.subarray(Math.round(1.5 * rate) * 8),
        ])
        expect(actual.length).toBe(ideal.length)
        // mpv can canonicalize negative zero; every numeric PCM value must match exactly.
        let difference = 0
        for (let i = 0; i < actual.length; i += 4)
          difference = Math.max(difference, Math.abs(actual.readFloatLE(i) - ideal.readFloatLE(i)))
        expect(difference).toBe(0)
      }
      expect(
        events.filter((event) => event.kind === 'boundary').map((event) => event.trackId),
      ).toEqual([2])
      expect(events.filter((event) => event.kind === 'error')).toEqual([])
      expect(warnings).toEqual([])
      expect(
        await Promise.all(
          paths.map(async (path) =>
            createHash('sha256')
              .update(await readFile(path))
              .digest('hex'),
          ),
        ),
      ).toEqual(hashes)
    },
    20000,
  )

  it('keeps short silence, audible quiet tails, single-channel sound and all-silent files', async () => {
    const dir = await directory()
    const analyzer = new LiveSilenceAnalyzer(ffmpeg, mpv)
    const b = await fixture(dir, 'b', 'flac', signal([tone(4)]), 'Live')
    for (const [name, tail] of [
      ['short', silence(0.5)],
      ['quiet', tone(2, 0.005)],
      ['right', { ...tone(2), rightOnly: true }],
    ] as const) {
      const a = await fixture(dir, name, 'flac', signal([tone(3), tail]), 'Live')
      expect(await analyzer.boundary(a, b, new AbortController().signal)).toEqual({
        live: true,
        boundary: null,
      })
    }
    const allSilent = await fixture(dir, 'silent', 'flac', signal([silence(3)]), 'Live')
    expect(await analyzer.boundary(allSilent, b, new AbortController().signal)).toEqual({
      live: true,
      boundary: null,
    })
    const lastSample = await fixture(
      dir,
      'last-sample',
      'wav',
      signal([tone(3), silence(2), tone(1 / rate)]),
      'Live',
    )
    expect(await analyzer.boundary(lastSample, b, new AbortController().signal)).toEqual({
      live: true,
      boundary: null,
    })
    const noise = await fixture(
      dir,
      'low',
      'flac',
      signal([tone(3), tone(2, 10 ** (-75 / 20))]),
      'Live',
    )
    expect(
      (await analyzer.boundary(noise, b, new AbortController().signal)).boundary?.end,
    ).toBeCloseTo(3, 2)
  }, 15000)

  it('streams a long file and invalidates its cached edge after file replacement', async () => {
    const dir = await directory()
    const a = await fixture(dir, 'a', 'flac', signal([tone(90), silence(2)]), 'Live')
    const b = await fixture(dir, 'b', 'flac', signal([tone(4)]), 'Pop')
    const analyzer = new LiveSilenceAnalyzer(ffmpeg, mpv)
    const scan = () => analyzer.boundary(a, b, new AbortController().signal)
    expect((await scan()).boundary?.end).toBeCloseTo(90, 2)
    expect((await scan()).boundary?.end).toBeCloseTo(90, 2)
    const replacement = await fixture(dir, 'replacement', 'flac', signal([tone(5)]), 'Live')
    await writeFile(a, await readFile(replacement))
    expect(await scan()).toEqual({ live: true, boundary: null })
  }, 20000)

  it('honors cancellation without poisoning the next scan', async () => {
    const dir = await directory()
    const paths = await Promise.all(
      ['a', 'b'].map((name) => fixture(dir, name, 'flac', signal([tone(3), silence(2)]), 'Live')),
    )
    const analyzer = new LiveSilenceAnalyzer(ffmpeg, mpv)
    const controller = new AbortController()
    const work = analyzer.boundary(paths[0], paths[1], controller.signal)
    controller.abort()
    await expect(work).rejects.toThrow()
    expect(
      (await analyzer.boundary(paths[0], paths[1], new AbortController().signal)).boundary,
    ).not.toBeNull()
  }, 15000)

  it('pauses and seeks back into B after its Live intro was skipped on muted WASAPI', async () => {
    const dir = await directory()
    const paths = [
      await fixture(dir, 'a', 'm4a', signal([tone(4), silence(2)]), 'Live'),
      await fixture(dir, 'b', 'm4a', signal([silence(1.5), tone(6)]), 'Live'),
    ]
    const events: NativePlaybackEvent[] = [],
      statuses: string[] = [],
      warnings: unknown[] = []
    const service = new NativePlaybackService({
      mpvPath: mpv,
      ffmpegPath: ffmpeg,
      mpvArgs: ['--ao=wasapi', '--pause=yes'],
      resolveTrack: async (id) => paths[id - 1],
      emit: (event) => events.push(event),
      warn: (error) => warnings.push(error),
      onBoundaryStatus: (event) => statuses.push(event.status),
    })
    services.push(service)
    await service.command({ action: 'start', session: 1, trackId: 1, volume: 0.2, muted: true })
    await service.command({
      action: 'next',
      session: 1,
      trackId: 2,
      trimDigitalSilence: false,
      softTransition: true,
      softTransitionDurationSeconds: 6,
    })
    await until(
      () => statuses.includes('applied'),
      () => ({ statuses, warnings }),
    )
    await service.command({ action: 'resume', session: 1 })
    await until(
      () => events.at(-1)?.trackId === 2 && events.at(-1)!.currentTime > 1.8,
      () => events.slice(-6),
    )
    await service.command({ action: 'pause', session: 1 })
    await service.command({ action: 'seek', session: 1, time: 0.5 })
    await until(
      () => Math.abs((events.at(-1)?.currentTime ?? 0) - 0.5) < 0.1,
      () => events.slice(-6),
    )
    expect(events.at(-1)?.isPlaying).toBe(false)
    await service.command({ action: 'resume', session: 1 })
    await until(
      () => events.at(-1)!.currentTime > 0.8 && events.at(-1)!.currentTime < 1.5,
      () => events.slice(-6),
    )
    expect(
      events.filter((event) => event.kind === 'boundary').map((event) => event.trackId),
    ).toEqual([2])
    expect(warnings).toEqual([])
    await service.dispose()
  }, 15000)
})
