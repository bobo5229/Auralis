import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { beforeEach, expect, it, vi } from 'vitest'
import { parseAudioMetadata } from '../metadata/parseAudioMetadata'
import { readMpvTimestampOrigin } from './audioTimestamp'
import { LiveSilenceAnalyzer } from './liveSilence'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
vi.mock('node:fs/promises', () => ({ stat: vi.fn() }))
vi.mock('../metadata/parseAudioMetadata', () => ({ parseAudioMetadata: vi.fn() }))
vi.mock('./audioTimestamp', async (original) => ({
  ...(await original<typeof import('./audioTimestamp')>()),
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
  vi.mocked(stat).mockImplementation(
    async () => ({ size: 100, mtimeMs: revision }) as Awaited<ReturnType<typeof stat>>,
  )
  vi.mocked(parseAudioMetadata).mockResolvedValue({
    common: { genre: ['Live'] },
    format: { sampleRate: 48000, numberOfChannels: 1, duration: 10 },
  } as Awaited<ReturnType<typeof parseAudioMetadata>>)
  vi.mocked(readMpvTimestampOrigin).mockResolvedValue(0)
  vi.mocked(spawn).mockImplementation(() => {
    const process = child()
    children.push(process)
    return process as unknown as ReturnType<typeof spawn>
  })
})
async function finish(index: number, pts = 0) {
  await vi.waitFor(() => expect(children.length).toBeGreaterThan(index))
  const text = `[Parsed_ashowinfo_0 @ 1234] n:0 pts:${pts} pts_time:0 channels:1 rate:48000\nsilence_start: 0\nsilence_end: 2\nsilence_start: 4\nsilence_end: 5\nsilence_start: 8\nsilence_end: 10`
  // Preserve parser behavior across arbitrary stderr chunks, including an EOF without newline.
  for (let offset = 0; offset < text.length; offset += 17)
    children[index].stderr.emit('data', Buffer.from(text.slice(offset, offset + 17)))
  children[index].stdout.emit('data', Buffer.alloc(10 * 48000 * 4))
  children[index].emit('close', 0)
}

it('shares concurrent scans and reuses timestamped edges until the file fingerprint changes', async () => {
  const analyzer = new LiveSilenceAnalyzer('ffmpeg', 'mpv')
  vi.mocked(readMpvTimestampOrigin).mockImplementation(async (_mpv, path) =>
    path === 'left' ? 0.25 : 0.5,
  )
  const scan = () => analyzer.boundary('left', 'right', new AbortController().signal)
  const first = scan(),
    second = scan()
  await finish(0, 36000)
  await finish(1, 60000)
  const expected = { start: 2.75 + 0.25 / 48000, end: 8.5 + 0.25 / 48000 }
  expect(await first).toEqual(expected)
  expect(await second).toEqual(expected)
  expect(await scan()).toEqual(expected)
  expect(children).toHaveLength(2)
  revision++
  const revised = scan()
  await finish(2, 36000)
  await finish(3, 60000)
  await revised
  expect(children).toHaveLength(4)
})

it('kills an active decoder on cancellation and permits a new lifetime to retry', async () => {
  const analyzer = new LiveSilenceAnalyzer('ffmpeg', 'mpv')
  const old = new AbortController()
  const rejected = expect(analyzer.boundary('left', 'right', old.signal)).rejects.toThrow(
    'cancelled',
  )
  await vi.waitFor(() => expect(children).toHaveLength(1))
  old.abort()
  await rejected
  expect(children[0].kill).toHaveBeenCalledOnce()
  const retry = analyzer.boundary('left', 'right', new AbortController().signal)
  await finish(1)
  await finish(2)
  expect(await retry).not.toBeNull()
})

it('does not cache scans cancelled during the mpv timestamp query', async () => {
  const analyzer = new LiveSilenceAnalyzer('ffmpeg', 'mpv')
  const old = new AbortController()
  let started!: () => void
  const queried = new Promise<void>((resolve) => {
    started = resolve
  })
  vi.mocked(readMpvTimestampOrigin).mockImplementationOnce(async (_mpv, _path, signal) => {
    started()
    await new Promise<void>((resolve) =>
      signal.addEventListener('abort', () => resolve(), { once: true }),
    )
    return 0
  })
  const rejected = expect(analyzer.boundary('left', 'right', old.signal)).rejects.toThrow()
  await finish(0)
  await queried
  old.abort()
  await rejected
  const retry = analyzer.boundary('left', 'right', new AbortController().signal)
  await finish(1)
  await finish(2)
  await retry
  expect(readMpvTimestampOrigin).toHaveBeenCalledTimes(3)
})

it('rejects file changes during analysis and does not cache those results', async () => {
  const analyzer = new LiveSilenceAnalyzer('ffmpeg', 'mpv')
  vi.mocked(readMpvTimestampOrigin).mockImplementationOnce(async () => {
    revision++
    return 0
  })
  const rejected = expect(
    analyzer.boundary('left', 'right', new AbortController().signal),
  ).rejects.toThrow('Audio changed')
  await finish(0)
  await rejected
  const retryIndex = children.length
  const retry = analyzer.boundary('left', 'right', new AbortController().signal)
  await finish(retryIndex)
  await finish(retryIndex + 1)
  expect(await retry).not.toBeNull()
})

it('keeps unsupported audio unchanged without starting a decoder', async () => {
  const analyzer = new LiveSilenceAnalyzer('ffmpeg', 'mpv')
  vi.mocked(parseAudioMetadata).mockResolvedValue({ common: {}, format: {} } as Awaited<
    ReturnType<typeof parseAudioMetadata>
  >)
  expect(await analyzer.boundary('left', 'right', new AbortController().signal)).toBeNull()
  expect(spawn).not.toHaveBeenCalled()
})
