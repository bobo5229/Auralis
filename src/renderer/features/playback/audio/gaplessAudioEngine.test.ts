import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GaplessAudioEngine } from './gaplessAudioEngine'
import { audioDecodeBudget, MAX_DECODE_BUDGET_BYTES, readEncodedAudio } from './audioDecodeBudget'
import type { AudioDecodeProbe } from '@shared/types/audioDecode'

const probe: AudioDecodeProbe = {
  fileSize: 4,
  fileMtimeMs: 1,
  durationSeconds: 10,
  numberOfChannels: 2,
  sampleRate: 48000,
}
const buffer = () => ({ length: 480000, numberOfChannels: 2, duration: 10 }) as AudioBuffer
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
let decode: ReturnType<typeof vi.fn<() => Promise<AudioBuffer>>>
let resume: ReturnType<typeof vi.fn<() => Promise<void>>>
let sourceStart: ReturnType<typeof vi.fn>
let fetchAudio: ReturnType<typeof vi.fn>
let engine: GaplessAudioEngine
let sources: Array<{ onended: (() => void) | null }>
let suspended = false

beforeEach(() => {
  sources = []
  suspended = false
  decode = vi.fn(async () => buffer())
  resume = vi.fn(async () => undefined)
  sourceStart = vi.fn()
  fetchAudio = vi.fn(async () => new Response(new Uint8Array(4)))
  vi.stubGlobal('fetch', fetchAudio)
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal(
    'AudioContext',
    class {
      sampleRate = 48000
      currentTime = 0
      get state() {
        return suspended ? 'suspended' : 'running'
      }
      destination = {}
      decodeAudioData = decode
      resume = resume
      close = vi.fn(async () => undefined)
      createGain() {
        return { gain: { value: 1 }, connect: vi.fn() }
      }
      createBufferSource() {
        const source = {
          buffer: null,
          connect: vi.fn(),
          start: sourceStart,
          stop: vi.fn(),
          disconnect: vi.fn(),
          onended: null as (() => void) | null,
        }
        sources.push(source)
        return source
      }
    },
  )
  engine = new GaplessAudioEngine({
    onCurrentEnded: vi.fn(),
    onPlaybackStateChange: vi.fn(),
    onTimeUpdate: vi.fn(),
  })
})
afterEach(() => {
  engine.destroy()
  vi.unstubAllGlobals()
})

describe('decode admission and lifecycle', () => {
  it('drops a predecode that settles after the current source has ended', async () => {
    expect(await engine.start(1, 'audio://1', 0, probe)).toBe(true)
    const pending = deferred<AudioBuffer>()
    decode.mockReturnValueOnce(pending.promise)
    const next = engine.scheduleNext(2, 'audio://2', { decodeProbe: probe })
    await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(2))
    sources[0].onended?.()
    pending.resolve(buffer())
    expect(await next).toBe(false)
    expect(sourceStart).toHaveBeenCalledOnce()
    expect(engine.getSnapshot().isPlaying).toBe(false)
  })
  it.each([
    undefined,
    { ...probe, durationSeconds: 7201 },
    { ...probe, durationSeconds: 600, numberOfChannels: 16 },
    { ...probe, sampleRate: 10000000 },
    { ...probe, durationSeconds: NaN },
  ])('rejects before fetch/decode: %j', async (input) => {
    expect(await engine.start(1, 'audio://1', 0, input)).toBe(false)
    expect(fetchAudio).not.toHaveBeenCalled()
    expect(decode).not.toHaveBeenCalled()
  })

  it('starts short audio and schedules the next boundary', async () => {
    expect(await engine.start(1, 'audio://1', 0, probe)).toBe(true)
    expect(await engine.scheduleNext(2, 'audio://2', { decodeProbe: probe })).toBe(true)
    expect(sourceStart).toHaveBeenCalledTimes(2)
    expect(decode).toHaveBeenCalledTimes(2)
  })

  it('keeps the cancelled decode reservation until settlement and rejects B without a second decode', async () => {
    const pending = deferred<AudioBuffer>()
    decode.mockReturnValueOnce(pending.promise)
    const a = engine.start(1, 'audio://1', 0, probe)
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce())
    expect(await engine.start(2, 'audio://2', 0, probe)).toBe(false)
    engine.cancel()
    pending.resolve(buffer())
    expect(await a).toBe(false)
    expect(sourceStart).not.toHaveBeenCalled()
    expect(await engine.start(3, 'audio://3', 0, probe)).toBe(true)
    expect(decode).toHaveBeenCalledTimes(2)
  })

  it.each(['cancel', 'destroy', 'pause'] as const)(
    'does not start after %s during resume',
    async (action) => {
      suspended = true
      const pending = deferred<void>()
      resume.mockReturnValueOnce(pending.promise)
      const start = engine.start(1, 'audio://1', 0, probe)
      await vi.waitFor(() => expect(resume).toHaveBeenCalledOnce())
      engine[action]()
      pending.resolve()
      expect(await start).toBe(false)
      expect(sourceStart).not.toHaveBeenCalled()
    },
  )

  it('does not install a decode after destruction', async () => {
    const pending = deferred<AudioBuffer>()
    decode.mockReturnValueOnce(pending.promise)
    const start = engine.start(1, 'audio://1', 0, probe)
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce())
    engine.destroy()
    pending.resolve(buffer())
    expect(await start).toBe(false)
    expect(await engine.start(2, 'audio://2', 0, probe)).toBe(false)
    expect(sourceStart).not.toHaveBeenCalled()
  })

  it('accounts for held current/next and deduplicates source references', async () => {
    const largeProbe = { ...probe, durationSeconds: 120 }
    decode.mockResolvedValue({ length: 5760000, numberOfChannels: 2, duration: 120 } as AudioBuffer)
    expect(await engine.start(1, 'audio://1', 0, largeProbe)).toBe(true)
    expect(await engine.scheduleNext(2, 'audio://2', { decodeProbe: largeProbe })).toBe(true)
    // Current and next are also referenced by sources. 92 MiB held + 368 MiB reserved fits.
    const medium = { ...probe, durationSeconds: 480 }
    decode.mockResolvedValue({
      length: 23040000,
      numberOfChannels: 2,
      duration: 480,
    } as AudioBuffer)
    expect(await engine.prepare(3, 'audio://3', medium)).toBe(true)
    expect(await engine.prepare(4, 'audio://4', medium)).toBe(false)
    expect(decode).toHaveBeenCalledTimes(3)
  })

  it('releases reservations on fetch/decode failure; failed prefetch preserves current', async () => {
    fetchAudio.mockRejectedValueOnce(new Error('read failed'))
    expect(await engine.start(1, 'audio://1', 0, probe)).toBe(false)
    decode.mockRejectedValueOnce(new Error('decode failed'))
    expect(await engine.start(1, 'audio://1', 0, probe)).toBe(false)
    expect(await engine.start(1, 'audio://1', 0, probe)).toBe(true)
    expect(await engine.scheduleNext(2, 'audio://2')).toBe(false)
    expect(engine.getSnapshot().isPlaying).toBe(true)
  })

  it('counts encoded copies and active reservations in admission', () => {
    const decision = audioDecodeBudget(probe, 96000, 0, 0)
    expect(decision).toEqual({ allowed: true, pcmBytes: 7680000, reservationBytes: 15360008 })
    expect(audioDecodeBudget(probe, 48000, 0, MAX_DECODE_BUDGET_BYTES).allowed).toBe(false)
  })

  it.each<HeadersInit>([{}, { 'content-length': '1' }])(
    'cancels an oversized stream with untrusted length %j',
    async (headers) => {
      const cancel = vi.fn()
      let reads = 0
      const response = new Response(
        new ReadableStream(
          {
            pull(controller) {
              reads++
              controller.enqueue(new Uint8Array(3))
            },
            cancel,
          },
          { highWaterMark: 0 },
        ),
        { headers },
      )
      await expect(readEncodedAudio(response, 4)).rejects.toThrow('exceeds budget')
      expect(cancel).toHaveBeenCalledOnce()
      expect(reads).toBe(2)
    },
  )
})
