import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { performance } from 'node:perf_hooks'
import { PlaybackSpectrumService } from './playbackSpectrumService'
import type { PlaybackSpectrumFrame, SpectrumSubscription } from '@shared/types/playbackSpectrum'

const executable = resolve('resources/audio/ffmpeg.exe')
let directory: string
const services: PlaybackSpectrumService[] = []

function waveFile(frequency: (time: number) => number, opposed = false): Buffer {
  const rate = 48000,
    count = rate * 10
  const channels = opposed ? 2 : 1
  const data = Buffer.alloc(44 + count * 2 * channels)
  data.write('RIFF')
  data.writeUInt32LE(data.length - 8, 4)
  data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(channels, 22)
  data.writeUInt32LE(rate, 24)
  data.writeUInt32LE(rate * 2 * channels, 28)
  data.writeUInt16LE(2 * channels, 32)
  data.writeUInt16LE(16, 34)
  data.write('data', 36)
  data.writeUInt32LE(count * 2 * channels, 40)
  for (let i = 0; i < count; i++) {
    const f = frequency(i / rate)
    const sample = f ? Math.round(6000 * Math.sin((2 * Math.PI * f * i) / rate)) : 0
    data.writeInt16LE(sample, 44 + i * 2 * channels)
    if (opposed) data.writeInt16LE(-sample, 44 + i * 2 * channels + 2)
  }
  return data
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'auralis-spectrum-'))
  await writeFile(
    join(directory, '1.wav'),
    waveFile((t) => (t < 2 ? 70 : t < 4 ? 1000 : t < 6 ? 0 : 70)),
  )
  await writeFile(
    join(directory, '2.wav'),
    waveFile(() => 8000),
  )
  await writeFile(
    join(directory, '3.wav'),
    waveFile(() => 70, true),
  )
})
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.dispose()))
})
afterAll(async () => {
  if (
    !resolve(directory).startsWith(resolve(tmpdir()) + sep) ||
    !directory.includes('auralis-spectrum-')
  )
    throw new Error('Unexpected test directory')
  await rm(directory, { recursive: true, force: true })
})

function create() {
  const frames: PlaybackSpectrumFrame[] = [],
    warnings: unknown[] = []
  const leases = new Set<string>()
  let id = 0
  const service = new PlaybackSpectrumService({
    ffmpegPath: executable,
    resolveTrack: async (trackId) => join(directory, `${trackId}.wav`),
    emit: (frame) => frames.push(frame),
    warn: (error) => warnings.push(error),
    coordinator: {
      acquireReadLease: async () => {
        const leaseId = String(++id)
        leases.add(leaseId)
        return { leaseId, version: 1 }
      },
      releaseReadLease: (leaseId) => {
        leases.delete(leaseId)
      },
    },
  })
  services.push(service)
  let revision = 0
  let request: SpectrumSubscription = {
    subscriptionId: 1,
    revision: 0,
    enabled: true,
    trackId: 1,
    currentTime: 0.7,
    isPlaying: true,
  }
  async function send(patch: Partial<SpectrumSubscription> = {}) {
    request = { ...request, ...patch, revision: ++revision }
    return service.subscribe(request)
  }
  async function run(position: number, duration = 650) {
    const started = performance.now()
    while (performance.now() - started < duration) {
      await send({ currentTime: position + (performance.now() - started) / 1000, isPlaying: true })
      await delay(70)
    }
    return frames
      .filter((frame) => frame.status === 'ready' && frame.trackId === request.trackId)
      .at(-1)
  }
  return { service, frames, warnings, leases, send, run }
}

describe('timestamped playback spectrum using real FFmpeg', () => {
  it('does not lose phase-opposed stereo music when analyzing its frequency content', async () => {
    const { send, run } = create()
    await send({ trackId: 3, currentTime: 0.7 })
    const frame = await run(0.7)
    expect(frame!.rms).toBeGreaterThan(0.08)
    expect(frame!.bass).toBeGreaterThan(0.08)
    expect(Math.max(...frame!.bands)).toBeGreaterThan(0.5)
  })
  it('fails once for unavailable sources and stays idle until the subscription changes', async () => {
    const resolveTrack = vi.fn(async () => {
      throw new Error('Unavailable track')
    })
    const frames: PlaybackSpectrumFrame[] = []
    const service = new PlaybackSpectrumService({
      ffmpegPath: executable,
      resolveTrack,
      emit: (frame) => frames.push(frame),
      warn: () => {},
    })
    services.push(service)
    const request = {
      subscriptionId: 1,
      revision: 1,
      enabled: true,
      trackId: 1,
      currentTime: 0,
      isPlaying: true,
    }
    await service.subscribe(request)
    await service.subscribe({ ...request, revision: 2, currentTime: 0.1 })
    expect(resolveTrack).toHaveBeenCalledOnce()
    expect(frames.at(-1)?.status).toBe('unavailable')
    expect(service.diagnostics.decoderStarts).toBe(0)
  })
  it('follows low/high/silent sections and seeks, with bounded buffers and no paused work', async () => {
    const { service, frames, warnings, leases, send, run } = create()
    const low = await run(0.5)
    expect(low).toBeDefined()
    expect(low!.bands.indexOf(Math.max(...low!.bands))).toBeLessThan(7)
    expect(low!.bass).toBeGreaterThan(0.08)
    const high = await run(2.3)
    expect(high!.epoch).toBeGreaterThan(low!.epoch)
    expect(high!.bands.indexOf(Math.max(...high!.bands))).toBeGreaterThan(15)
    expect(high!.bass).toBeLessThan(0.00025)
    expect(high!.currentTime).toBeGreaterThan(2.3)
    const silence = await run(4.3)
    expect(silence!.bands).toEqual(Array(32).fill(0))
    expect(silence!.rms).toBe(0)
    expect(silence!.bass).toBe(0)
    await send({ isPlaying: false })
    const analyzed = service.diagnostics.analyzedFrames,
      count = frames.length
    await delay(150)
    expect(service.diagnostics.analyzedFrames).toBe(analyzed)
    expect(frames.length).toBe(count)
    await service.dispose()
    expect(leases.size).toBe(0)
    expect(warnings).toEqual([])
    expect(service.diagnostics.maxBufferedFrames).toBeLessThan(64)
    expect(service.diagnostics.maxCarryBytes).toBeLessThanOrEqual(512 * 1024)
  }, 10000)

  it('drops replaced tracks, old revisions and disabled subscriptions', async () => {
    const { frames, warnings, leases, send, run, service } = create()
    await run(0.4, 350)
    await send({ trackId: 2, currentTime: 1 })
    const start = frames.length
    const next = await run(1, 500)
    expect(next!.trackId).toBe(2)
    expect(next!.bands.indexOf(Math.max(...next!.bands))).toBeGreaterThan(27)
    expect(
      frames
        .slice(start)
        .filter((frame) => frame.status === 'ready')
        .every((frame) => frame.trackId === 2),
    ).toBe(true)
    expect(
      await service.subscribe({
        subscriptionId: 1,
        revision: 0,
        enabled: true,
        trackId: 1,
        currentTime: 0,
        isPlaying: true,
      }),
    ).toEqual({ accepted: false })
    await send({ enabled: false })
    const count = service.diagnostics.analyzedFrames
    await delay(150)
    expect(service.diagnostics.analyzedFrames).toBe(count)
    await service.dispose()
    expect(leases.size).toBe(0)
    expect(warnings).toEqual([])
  }, 10000)

  it('deduplicates slow resolution and never starts decoding after cancellation', async () => {
    let complete!: (path: string) => void
    const resolveTrack = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          complete = resolve
        }),
    )
    const service = new PlaybackSpectrumService({
      ffmpegPath: executable,
      resolveTrack,
      emit: () => {},
      warn: () => {},
    })
    services.push(service)
    const base = {
      subscriptionId: 1,
      revision: 1,
      enabled: true,
      trackId: 1,
      currentTime: 0,
      isPlaying: true,
    }
    const first = service.subscribe(base)
    await service.subscribe({ ...base, revision: 2, currentTime: 0.1 })
    expect(resolveTrack).toHaveBeenCalledTimes(1)
    await service.subscribe({ ...base, revision: 3, enabled: false })
    complete(join(directory, '1.wav'))
    expect(await first).toEqual({ accepted: false })
    expect(service.diagnostics.decoderStarts).toBe(0)
  })
})
