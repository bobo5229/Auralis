import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { scanTransitionAudio } from './softTransition'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

function createChild() {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', 1))
      return true
    }),
  })
  return child
}

let child: ReturnType<typeof createChild>
beforeEach(() => {
  child = createChild()
  vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>)
})
afterEach(() => {
  child.stdout.destroy()
  child.stderr.destroy()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

it.each([
  { name: 'short file', frames: 37, channels: 2, sizes: [3, 11, 64] },
  { name: 'exact window', frames: 100800, channels: 2, sizes: [257, 13, 65536] },
  { name: 'wrapped window', frames: 302419, channels: 2, sizes: [65536, 3, 130001] },
  { name: 'oversized chunk', frames: 302419, channels: 2, sizes: [4000000] },
  {
    name: 'mixed oversized and small chunks',
    frames: 302419,
    channels: 2,
    sizes: [65539, 950001, 17],
  },
  { name: 'mono window', frames: 302419, channels: 1, sizes: [1, 65536, 17] },
])(
  'retains exact PCM edges, silence counts and timestamps for a $name',
  async ({ frames, channels, sizes }) => {
    const rate = 48000
    const bytesPerFrame = channels * 4
    const pcm = Buffer.alloc(frames * bytesPerFrame)
    for (let frame = 2; frame < frames - 3; frame++) {
      for (let channel = 0; channel < channels; channel++) {
        pcm.writeFloatLE(
          (channel ? -1 : 1) * ((frame % 997) / 1000 + 0.0001),
          frame * bytesPerFrame + channel * 4,
        )
      }
    }
    const pending = scanTransitionAudio(
      'ffmpeg.exe',
      'synthetic.wav',
      rate,
      channels,
      new AbortController().signal,
    )
    const diagnostics =
      '[Parsed_ashowinfo_0 @ 1234] n:0 pts:240 pts_time:0.005 channels:' +
      channels +
      ' rate:' +
      rate
    child.stderr.emit('data', Buffer.from(diagnostics.slice(0, 40)))
    child.stderr.emit('data', Buffer.from(diagnostics.slice(40)))
    child.stdout.emit('data', Buffer.alloc(0))
    for (let offset = 0, index = 0; offset < pcm.length; index++) {
      const end = Math.min(pcm.length, offset + sizes[index % sizes.length])
      child.stdout.emit('data', pcm.subarray(offset, end))
      offset = end
    }
    child.stdout.emit('data', Buffer.alloc(0))
    child.emit('close', 0)
    const audio = await pending
    const limit = Math.ceil(rate * 2.1) * bytesPerFrame
    expect(audio.frames).toBe(frames)
    expect(audio.leading).toBe(2)
    expect(audio.trailing).toBe(3)
    expect(audio.origin).toBe(0.005)
    expect(audio.head.equals(pcm.subarray(0, limit))).toBe(true)
    expect(audio.tail.equals(pcm.subarray(-limit))).toBe(true)
    const firstSample = audio.head.readFloatLE(2 * bytesPerFrame)
    const lastSample = audio.tail.readFloatLE(audio.tail.length - 4 * bytesPerFrame)
    pcm.fill(0)
    expect(audio.head.readFloatLE(2 * bytesPerFrame)).toBe(firstSample)
    expect(audio.tail.readFloatLE(audio.tail.length - 4 * bytesPerFrame)).toBe(lastSample)
  },
)

it('kills an in-flight decoder on cancellation and removes the abort listener', async () => {
  const controller = new AbortController()
  const remove = vi.spyOn(controller.signal, 'removeEventListener')
  const pending = expect(
    scanTransitionAudio('ffmpeg.exe', 'synthetic.wav', 48000, 2, controller.signal),
  ).rejects.toThrow('cancel')
  controller.abort()
  await pending
  expect(child.kill).toHaveBeenCalledOnce()
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
})

it('does not start a decoder for an already cancelled request', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(
    scanTransitionAudio('ffmpeg.exe', 'synthetic.wav', 48000, 2, controller.signal),
  ).rejects.toThrow()
  expect(spawn).not.toHaveBeenCalled()
})
