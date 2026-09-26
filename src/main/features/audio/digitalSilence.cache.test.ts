import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { parseFile } from 'music-metadata'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DigitalSilenceAnalyzer } from './digitalSilence'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
vi.mock('node:fs/promises', () => ({ stat: vi.fn() }))
vi.mock('music-metadata', () => ({ parseFile: vi.fn() }))

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

async function finish(index: number) {
  await vi.waitFor(() => expect(children.length).toBeGreaterThan(index))
  const bytes = Buffer.alloc(12)
  bytes.writeFloatLE(1, 4)
  children[index].stdout.emit('data', bytes)
  children[index].emit('close', 0)
}

describe('digital silence scan reuse', () => {
  it('shares concurrent scans and reuses fingerprinted results without another decoder', async () => {
    const analyzer = new DigitalSilenceAnalyzer('ffmpeg.exe')
    const signal = new AbortController().signal
    const first = analyzer.boundary('left', 'right', signal)
    const second = analyzer.boundary('left', 'right', signal)
    await vi.waitFor(() => expect(children).toHaveLength(1))
    await finish(0)
    await finish(1)
    expect(await first).toEqual(await second)
    await analyzer.boundary('left', 'right', signal)
    expect(children).toHaveLength(2)
  })

  it('serializes different files and invalidates the cache on fingerprint change', async () => {
    const analyzer = new DigitalSilenceAnalyzer('ffmpeg.exe')
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
  })

  it('does not reuse an aborted lifetime scan in a new playback lifetime', async () => {
    const analyzer = new DigitalSilenceAnalyzer('ffmpeg.exe')
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
})
