import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { parseFile } from 'music-metadata'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DigitalSilenceAnalyzer } from './digitalSilence'
import { readMpvTimestampOrigin } from './audioTimestamp'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
vi.mock('node:fs/promises', () => ({ stat: vi.fn() }))
vi.mock('music-metadata', () => ({ parseFile: vi.fn() }))
vi.mock('./audioTimestamp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./audioTimestamp')>()),
  readMpvTimestampOrigin: vi.fn(),
}))

function child() {
  const process = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => {
      queueMicrotask(() => process.emit('close', 1))
      return true
    }),
  })
  return process
}
let children: ReturnType<typeof child>[]
let revision: number

beforeEach(() => {
  vi.resetAllMocks()
  children = []
  revision = 1
  vi.mocked(readMpvTimestampOrigin).mockResolvedValue(0)
  vi.mocked(stat).mockImplementation(
    async () => ({ size: 100, mtimeMs: revision }) as Awaited<ReturnType<typeof stat>>,
  )
  vi.mocked(parseFile).mockImplementation(
    async (path) =>
      ({
        common: {
          album: 'Album',
          artist: 'Artist',
          track: { no: String(path).includes('left') ? 1 : 2 },
          disk: { no: 1 },
        },
        format: { sampleRate: 48000, numberOfChannels: 1, duration: 10 },
      }) as Awaited<ReturnType<typeof parseFile>>,
  )
  vi.mocked(spawn).mockImplementation(() => {
    const process = child()
    children.push(process)
    return process as unknown as ReturnType<typeof spawn>
  })
})

async function finish(index: number, pts = 0) {
  await vi.waitFor(() => expect(children.length).toBeGreaterThan(index))
  const bytes = Buffer.alloc(12)
  bytes.writeFloatLE(1, 4)
  const diagnostics = `[Parsed_ashowinfo_0 @ 1234] n:0 pts:${pts} pts_time:0 channels:1 rate:48000`
  // A log line may be split across arbitrary stderr chunks.
  children[index].stderr.emit('data', Buffer.from(diagnostics.slice(0, 40)))
  children[index].stderr.emit('data', Buffer.from(diagnostics.slice(40)))
  children[index].stdout.emit('data', bytes)
  children[index].emit('close', 0)
}

describe('digital silence scan reuse', () => {
  it('shares concurrent scans and reuses fingerprinted results without another decoder', async () => {
    const analyzer = new DigitalSilenceAnalyzer('ffmpeg.exe', 'mpv.exe')
    const signal = new AbortController().signal
    const first = analyzer.boundary('left', 'right', signal)
    const second = analyzer.boundary('left', 'right', signal)
    await vi.waitFor(() => expect(children).toHaveLength(1))
    await finish(0)
    await finish(1)
    expect(await first).toEqual(await second)
    await analyzer.boundary('left', 'right', signal)
    expect(children).toHaveLength(2)
    expect(readMpvTimestampOrigin).toHaveBeenCalledTimes(2)
  })

  it('serializes different files and invalidates the cache on fingerprint change', async () => {
    const analyzer = new DigitalSilenceAnalyzer('ffmpeg.exe', 'mpv.exe')
    const signal = new AbortController().signal
    const first = analyzer.boundary('left', 'right', signal)
    await finish(0)
    await finish(1)
    await first
    revision++
    const second = analyzer.boundary('left', 'right', signal)
    const other = analyzer.boundary('left-other', 'right-other', signal)
    await vi.waitFor(() => expect(children).toHaveLength(3))
    await finish(2)
    await finish(3)
    await finish(4)
    await finish(5)
    await Promise.all([second, other])
    expect(children).toHaveLength(6)
    expect(readMpvTimestampOrigin).toHaveBeenCalledTimes(6)
  })

  it('does not reuse an aborted lifetime scan in a new playback lifetime', async () => {
    const analyzer = new DigitalSilenceAnalyzer('ffmpeg.exe', 'mpv.exe')
    const old = new AbortController()
    const first = analyzer.boundary('left', 'right', old.signal)
    const rejected = expect(first).rejects.toThrow('cancelled')
    await vi.waitFor(() => expect(children).toHaveLength(1))
    old.abort()
    const second = analyzer.boundary('left', 'right', new AbortController().signal)
    await rejected
    await finish(1)
    await finish(2)
    expect(await second).not.toBeNull()
  })

  it('caches each decoded origin after subtracting its actual demuxer origin', async () => {
    const analyzer = new DigitalSilenceAnalyzer('ffmpeg.exe', 'mpv.exe')
    vi.mocked(readMpvTimestampOrigin).mockImplementation(async (_executable, path) =>
      path === 'left' ? 0.25 : 0.5,
    )
    const signal = new AbortController().signal
    const boundary = analyzer.boundary('left', 'right', signal)
    await finish(0, 36000)
    await finish(1, 60000)
    const expected = { start: 0.75 + 1.25 / 48000, end: 0.5 + 2.25 / 48000 }
    expect(await boundary).toEqual(expected)
    expect(await analyzer.boundary('left', 'right', signal)).toEqual(expected)
    expect(readMpvTimestampOrigin).toHaveBeenCalledTimes(2)
  })

  it('does not cache a scan cancelled during its mpv origin query', async () => {
    const analyzer = new DigitalSilenceAnalyzer('ffmpeg.exe', 'mpv.exe')
    let queried!: () => void
    const queryStarted = new Promise<void>((resolve) => {
      queried = resolve
    })
    vi.mocked(readMpvTimestampOrigin).mockImplementationOnce(async (_executable, _path, signal) => {
      queried()
      await new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      )
      return 0
    })
    const old = new AbortController()
    const rejected = expect(analyzer.boundary('left', 'right', old.signal)).rejects.toThrow()
    await finish(0)
    await queryStarted
    old.abort()
    await rejected
    const second = analyzer.boundary('left', 'right', new AbortController().signal)
    await finish(1)
    await finish(2)
    expect(await second).not.toBeNull()
    expect(readMpvTimestampOrigin).toHaveBeenCalledTimes(3)
  })

  it('allows demuxer rounding within one sample and rejects larger negative origins', async () => {
    const analyzer = new DigitalSilenceAnalyzer('ffmpeg.exe', 'mpv.exe')
    const signal = new AbortController().signal
    vi.mocked(readMpvTimestampOrigin).mockResolvedValue(0.000001)
    const rounded = analyzer.boundary('left', 'right', signal)
    await finish(0)
    await finish(1)
    expect(await rounded).toEqual({
      start: 1.25 / 48000 - 0.000001,
      end: 2.25 / 48000 - 0.000001,
    })
    revision++
    vi.mocked(readMpvTimestampOrigin).mockResolvedValue(2 / 48000)
    const invalid = expect(analyzer.boundary('left', 'right', signal)).rejects.toThrow(
      'Unsupported rebased audio timestamp',
    )
    await finish(2)
    await invalid
  })

  it('rejects missing timestamps and file changes during the mpv query', async () => {
    const analyzer = new DigitalSilenceAnalyzer('ffmpeg.exe', 'mpv.exe')
    const signal = new AbortController().signal
    const missing = expect(analyzer.boundary('left', 'right', signal)).rejects.toThrow(
      'Missing audio timestamp',
    )
    await vi.waitFor(() => expect(children).toHaveLength(1))
    const pcm = Buffer.alloc(4)
    pcm.writeFloatLE(1)
    children[0].stdout.emit('data', pcm)
    children[0].emit('close', 0)
    await missing
    expect(readMpvTimestampOrigin).not.toHaveBeenCalled()
    vi.mocked(readMpvTimestampOrigin).mockImplementationOnce(async () => {
      revision++
      return 0
    })
    const changed = expect(analyzer.boundary('left', 'right', signal)).rejects.toThrow(
      'Audio changed',
    )
    await finish(1)
    await changed
    const second = analyzer.boundary('left', 'right', signal)
    await finish(2)
    await finish(3)
    expect(await second).not.toBeNull()
  })
})
