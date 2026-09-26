import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { NativePlaybackService } from './nativePlaybackService'
import {
  renderSoftTransition,
  scanTransitionAudio,
  readMpvTimestampOrigin,
  SoftTransitionPreparer,
  type TransitionAudio,
} from './softTransition'
import type { NativePlaybackEvent } from '../../../shared/ipc/contracts'

const ffmpeg = resolve('resources/audio/ffmpeg.exe')
const mpv = resolve('resources/audio/mpv.exe')
const directories: string[] = []
const services: NativePlaybackService[] = []
afterEach(async () => {
  services.splice(0).forEach((service) => service.dispose())
  await delay(100)
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})
const run = (args: string[], input?: Buffer) => {
  const result = spawnSync(ffmpeg, args, {
    input,
    windowsHide: true,
    maxBuffer: 512 * 1024 * 1024,
    timeout: 60000,
  })
  if (result.error || result.status !== 0) throw new Error(String(result.error ?? result.stderr))
  return result.stdout
}
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'auralis-transition-test-'))
  directories.push(path)
  return path
}
function samples(rate: number, amplitude: number) {
  const pcm = Buffer.alloc(rate * 6 * 8)
  for (let frame = 0; frame < rate * 6; frame++) {
    const value = amplitude * Math.cos(frame * 0.041)
    pcm.writeFloatLE(value, frame * 8)
    pcm.writeFloatLE(value * 0.8, frame * 8 + 4)
  }
  return pcm
}
function audio(pcm: Buffer, rate: number, origin = 0): TransitionAudio {
  return {
    frames: pcm.length / 8,
    leading: 0,
    trailing: 0,
    head: pcm,
    tail: pcm,
    rate,
    channels: 2,
    origin,
  }
}
async function fixture(dir: string, name: string, rate: number, pcm: Buffer) {
  const path = join(dir, name + '.wav')
  run(
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
      'pcm_f32le',
      path,
    ],
    pcm,
  )
  return path
}
async function waitFor(predicate: () => boolean, timeout = 10000) {
  const start = Date.now()
  while (!predicate() && Date.now() - start < timeout) await delay(20)
  expect(predicate()).toBe(true)
}
function expectPcm(actual: Buffer, expected: Buffer) {
  expect(actual.length).toBe(expected.length)
  let max = 0
  for (let i = 0; i < actual.length; i += 4)
    max = Math.max(max, Math.abs(actual.readFloatLE(i) - expected.readFloatLE(i)))
  expect(max).toBeLessThan(0.00002)
}

it('maps decoded samples into the container timeline and preserves fade endpoints', () => {
  const a = audio(samples(44100, 0.8), 44100, 2112 / 44100)
  const b = audio(samples(44100, -0.7), 44100, 2112 / 44100)
  const mix = renderSoftTransition(a, b, true)
  expect(mix.outgoingEnd).toBeCloseTo(4 + 2112.25 / 44100, 10)
  expect(mix.incomingResume).toBeCloseTo(2 + 2112.25 / 44100, 10)
  expect(mix.wave.readFloatLE(44)).toBe(a.tail.readFloatLE(4 * 44100 * 8))
  expect(mix.wave.readFloatLE(mix.wave.length - 4)).toBe(b.head.readFloatLE(2 * 44100 * 8 - 4))
  let peak = 0
  for (let i = 44; i < mix.wave.length; i += 4)
    peak = Math.max(peak, Math.abs(mix.wave.readFloatLE(i)))
  expect(peak).toBeLessThanOrEqual(0.800001)
})

describe.skipIf(!existsSync(ffmpeg) || !existsSync(mpv))(
  'real decoder and mpv soft transition',
  () => {
    it.each([
      [44100, 44100],
      [48000, 48000],
      [44100, 48000],
    ])(
      'matches native PCM or independently resampled ranges at %i -> %i Hz with one boundary',
      async (rate, outputRate) => {
        const dir = await directory()
        const a = samples(rate, 0.7),
          b = samples(rate, -0.6)
        a.fill(0, a.length - 48 * 8)
        b.fill(0, 0, 32 * 8)
        const paths = [await fixture(dir, 'a', rate, a), await fixture(dir, 'b', rate, b)]
        const statuses: string[] = [],
          events: NativePlaybackEvent[] = [],
          warnings: unknown[] = []
        const output = join(dir, 'joined.pcm')
        const service = new NativePlaybackService({
          mpvPath: mpv,
          ffmpegPath: ffmpeg,
          mpvArgs: [
            '--ao=pcm',
            '--ao-pcm-waveheader=no',
            `--ao-pcm-file=${output}`,
            '--audio-format=float',
            `--audio-samplerate=${outputRate}`,
            '--pause=yes',
          ],
          resolveTrack: async (id) => paths[id - 1],
          emit: (e) => events.push(e),
          warn: (e) => warnings.push(e),
          onBoundaryStatus: (e) => statuses.push(e.status),
        })
        services.push(service)
        await service.command({ action: 'start', session: 1, trackId: 1, volume: 1, muted: false })
        await service.command({
          action: 'next',
          session: 1,
          trackId: 2,
          trimDigitalSilence: true,
          softTransition: true,
        })
        await waitFor(() => statuses.includes('applied'))
        await service.command({ action: 'resume', session: 1 })
        await waitFor(() => events.some((e) => e.kind === 'ended'))
        service.dispose()
        await delay(100)
        const left = { ...audio(a, rate), trailing: 48 },
          right = { ...audio(b, rate), leading: 32 }
        const plan = renderSoftTransition(left, right, true)
        let expected = Buffer.concat([
          a.subarray(0, (rate * 4 - 48) * 8),
          plan.wave.subarray(44),
          b.subarray((rate * 2 + 32) * 8),
        ])
        if (rate !== outputRate) {
          const reference = await fixture(dir, 'reference', rate, expected)
          const rendered = join(dir, 'reference.pcm')
          const result = spawnSync(
            mpv,
            [
              '--no-config',
              '--video=no',
              '--audio-display=no',
              '--volume=100',
              '--replaygain=no',
              '--ao=pcm',
              '--ao-pcm-waveheader=no',
              `--ao-pcm-file=${rendered}`,
              '--audio-format=float',
              `--audio-samplerate=${outputRate}`,
              '--',
              reference,
            ],
            { windowsHide: true, timeout: 10000 },
          )
          expect(result.status).toBe(0)
          const continuous = await readFile(rendered)
          const bridgePath = join(dir, 'reference-bridge.wav')
          await writeFile(bridgePath, plan.wave)
          const segments = [
            { path: paths[0], options: [`--end=${plan.outgoingEnd}`] },
            { path: bridgePath, options: [] },
            {
              path: paths[1],
              options: [
                `--start=${plan.incomingResume}`,
                '--hr-seek=yes',
                '--hr-seek-demuxer-offset=1',
              ],
            },
          ]
          const renderedSegments: Buffer[] = []
          for (const [index, segment] of segments.entries()) {
            const file = join(dir, `resampled-${index}.pcm`)
            const result = spawnSync(
              mpv,
              [
                '--no-config',
                '--video=no',
                '--audio-display=no',
                '--volume=100',
                '--replaygain=no',
                '--ao=pcm',
                '--ao-pcm-waveheader=no',
                `--ao-pcm-file=${file}`,
                '--audio-format=float',
                `--audio-samplerate=${outputRate}`,
                ...segment.options,
                '--',
                segment.path,
              ],
              { windowsHide: true, timeout: 10000 },
            )
            expect(result.status).toBe(0)
            renderedSegments.push(await readFile(file))
          }
          expected = Buffer.concat(renderedSegments)
          // Per-file resampling rounds output lengths independently (at most two
          // output frames for three ranges). The playlist must add nothing to that.
          expect(Math.abs(expected.length - continuous.length)).toBeLessThanOrEqual(2 * 8)
        }
        expectPcm(await readFile(output), expected)
        expect(events.filter((e) => e.kind === 'boundary').map((e) => e.trackId)).toEqual([2])
        expect(events.filter((e) => e.kind === 'error')).toEqual([])
        expect(warnings).toEqual([])
        expect(
          events.filter((e) => e.trackId === 2 && e.kind !== 'ended').every((e) => e.duration > 5),
        ).toBe(true)
      },
      15000,
    )

    it('falls back for mixed rates, consecutive albums, and aborts', async () => {
      const dir = await directory()
      const a = await fixture(dir, 'a', 44100, samples(44100, 0.2))
      const b = await fixture(dir, 'b', 48000, samples(48000, 0.2))
      const preparer = new SoftTransitionPreparer(ffmpeg, mpv)
      expect(await preparer.prepare(a, b, true, new AbortController().signal)).toBeNull()
      const c = join(dir, 'c.flac'),
        d = join(dir, 'd.flac')
      for (const [file, track] of [
        [c, '1'],
        [d, '2'],
      ])
        run([
          '-v',
          'error',
          '-i',
          a,
          '-metadata',
          'album=Album',
          '-metadata',
          'artist=Artist',
          '-metadata',
          'disc=1',
          '-metadata',
          `track=${track}`,
          file,
        ])
      expect(await preparer.prepare(c, d, true, new AbortController().signal)).toBeNull()
      const incomplete = join(dir, 'missing-disc.flac')
      run([
        '-v',
        'error',
        '-i',
        a,
        '-metadata',
        'album=Album',
        '-metadata',
        'artist=Artist',
        '-metadata',
        'track=2',
        incomplete,
      ])
      expect(await preparer.prepare(c, incomplete, true, new AbortController().signal)).toBeNull()
      const aborted = new AbortController()
      aborted.abort()
      await expect(preparer.prepare(a, a, false, aborted.signal)).rejects.toThrow()
    })

    it('pauses and seeks within the visible B track on muted WASAPI output', async () => {
      const dir = await directory()
      const paths = [
        await fixture(dir, 'a', 44100, samples(44100, 0.2)),
        await fixture(dir, 'b', 44100, samples(44100, 0.3)),
      ]
      const statuses: string[] = [],
        events: NativePlaybackEvent[] = [],
        warnings: unknown[] = []
      const service = new NativePlaybackService({
        mpvPath: mpv,
        ffmpegPath: ffmpeg,
        mpvArgs: ['--ao=wasapi', '--pause=yes'],
        resolveTrack: async (id) => paths[id - 1],
        emit: (e) => events.push(e),
        warn: (e) => warnings.push(e),
        onBoundaryStatus: (e) => statuses.push(e.status),
      })
      services.push(service)
      await service.command({ action: 'start', session: 1, trackId: 1, volume: 0.2, muted: true })
      await service.command({
        action: 'next',
        session: 1,
        trackId: 2,
        softTransition: true,
        trimDigitalSilence: false,
      })
      await waitFor(() => statuses.includes('applied'))
      await service.command({ action: 'resume', session: 1 })
      await waitFor(() => events.some((e) => e.kind === 'boundary'))
      await service.command({ action: 'pause', session: 1 })
      await service.command({ action: 'cancel-next', session: 1 })
      await delay(100)
      const pausedAt = events.at(-1)!.currentTime
      await delay(200)
      expect(events.at(-1)?.currentTime).toBeCloseTo(pausedAt, 2)
      expect(events.at(-1)?.isPlaying).toBe(false)
      await service.command({ action: 'seek', session: 1, time: 3 })
      await waitFor(() => Math.abs((events.at(-1)?.currentTime ?? 0) - 3) < 0.1)
      expect(events.at(-1)?.isPlaying).toBe(false)
      await service.command({ action: 'resume', session: 1 })
      await waitFor(() => (events.at(-1)?.currentTime ?? 0) > 3.1)
      expect(events.filter((e) => e.kind === 'boundary').map((e) => e.trackId)).toEqual([2])
      expect(events.filter((e) => e.kind === 'error')).toEqual([])
      expect(warnings).toEqual([])
    }, 15000)

    it.skipIf(!process.env.AURALIS_TRANSITION_MANIFEST)(
      'matches original AAC and MP3 timestamps using the production preparer',
      async () => {
        const manifest = JSON.parse(
          await readFile(process.env.AURALIS_TRANSITION_MANIFEST!, 'utf8'),
        ) as { tracks: { id: string; path: string }[] }
        const dir = await directory()
        for (const [index, ids] of [
          ['without', 'humble'],
          ['humble', 'quiet'],
          ['without', 'livebicycle'],
        ].entries()) {
          const paths = ids.map((id) => manifest.tracks.find((t) => t.id === id)!.path)
          const plan = await new SoftTransitionPreparer(ffmpeg, mpv).prepare(
            paths[0],
            paths[1],
            true,
            new AbortController().signal,
          )
          expect(plan).not.toBeNull()
          if (!plan) throw new Error('Missing real transition')
          try {
            const expected = await scanTransitionAudio(
              ffmpeg,
              paths[1],
              44100,
              2,
              new AbortController().signal,
            )
            expected.origin -= await readMpvTimestampOrigin(
              mpv,
              paths[1],
              new AbortController().signal,
            )
            expect(plan.incomingStart).toBeGreaterThanOrEqual(expected.origin)
            expect(plan.incomingStart - expected.origin).toBeLessThanOrEqual(0.1)
            const pcm = join(dir, `resume-${index}.pcm`)
            const r = spawnSync(
              mpv,
              [
                '--no-config',
                '--video=no',
                '--audio-display=no',
                '--volume=100',
                '--replaygain=no',
                '--hr-seek=yes',
                '--hr-seek-demuxer-offset=1',
                `--start=${plan.incomingResume}`,
                `--end=${plan.incomingResume + 1}`,
                '--ao=pcm',
                '--ao-pcm-waveheader=no',
                `--ao-pcm-file=${pcm}`,
                '--audio-format=float',
                '--',
                paths[1],
              ],
              { windowsHide: true, timeout: 20000 },
            )
            expect(r.status).toBe(0)
            const reference = run([
              '-v',
              'error',
              '-i',
              paths[1],
              '-map',
              '0:a:0',
              '-c:a',
              'pcm_f32le',
              '-f',
              'f32le',
              'pipe:1',
            ])
            const frame = Math.round((plan.incomingResume - expected.origin) * 44100 - 0.25)
            expectPcm(await readFile(pcm), reference.subarray(frame * 8, (frame + 44100) * 8))
          } finally {
            await plan.dispose()
          }
        }
        await writeFile(join(dir, 'verified.txt'), 'timestamp mapping verified', 'utf8')
      },
      45000,
    )
  },
)
