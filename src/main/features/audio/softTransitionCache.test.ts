import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SoftTransitionPreparer, type SoftTransition } from './softTransition'

const fixture = vi.hoisted(() => ({ version: 1 }))
vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
vi.mock('music-metadata', () => ({
  parseFile: vi.fn(async () => ({
    common: { track: { no: null }, disk: { no: null } },
    format: { sampleRate: 8000, numberOfChannels: 2, duration: 16 },
  })),
}))
vi.mock('./audioTimestamp', async (original) => ({
  ...(await original<typeof import('./audioTimestamp')>()),
  readMpvTimestampOrigin: vi.fn(async () => 0),
}))
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  stat: vi.fn(async () => ({ size: 8000 * 16 * 8, mtimeMs: fixture.version })),
}))
const plans: SoftTransition[] = []
beforeEach(() => {
  fixture.version = 1
  vi.mocked(spawn).mockReset()
  vi.mocked(spawn).mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
    })
    queueMicrotask(() => {
      const pcm = Buffer.alloc(8000 * 16 * 8)
      for (let offset = 0; offset < pcm.length; offset += 4) pcm.writeFloatLE(0.25, offset)
      child.stderr.emit(
        'data',
        Buffer.from('[Parsed_ashowinfo_0 @ 1234] n:0 pts:0 pts_time:0 channels:2 rate:8000'),
      )
      child.stdout.emit('data', pcm)
      child.emit('close', 0)
      child.stdout.destroy()
      child.stderr.destroy()
    })
    return child as unknown as ReturnType<typeof spawn>
  })
})
afterEach(async () => {
  await Promise.all(plans.splice(0).map((plan) => plan.dispose()))
})

it('grows cached windows when needed and reuses longer windows for shorter fades', async () => {
  const preparer = new SoftTransitionPreparer('ffmpeg', 'mpv')
  async function prepare(seconds: number) {
    const plan = await preparer.prepare(
      'a.wav',
      'b.wav',
      false,
      new AbortController().signal,
      seconds,
    )
    expect(plan).not.toBeNull()
    plans.push(plan!)
    expect(plan!.duration).toBe(seconds)
  }
  await prepare(2)
  expect(spawn).toHaveBeenCalledTimes(2)
  await prepare(1)
  expect(spawn).toHaveBeenCalledTimes(2)
  await prepare(6)
  expect(spawn).toHaveBeenCalledTimes(4)
  await prepare(2.5)
  expect(spawn).toHaveBeenCalledTimes(4)
  fixture.version++
  await prepare(6)
  expect(spawn).toHaveBeenCalledTimes(6)
})
