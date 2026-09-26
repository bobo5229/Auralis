import { afterEach, expect, it, vi } from 'vitest'
import { NativePlaybackService } from './nativePlaybackService'
import { SoftTransitionPreparer, type SoftTransition } from './softTransition'
import { openMpvClient, type MpvMessage } from './mpvClient'
import type { NativePlaybackEvent } from '../../../shared/ipc/contracts'

vi.mock('./mpvClient', () => ({ openMpvClient: vi.fn() }))
afterEach(() => vi.restoreAllMocks())

async function setup() {
  const plan: SoftTransition = {
    path: 'bridge.wav',
    outgoingEnd: 118,
    incomingStart: 0.048,
    incomingResume: 2.048,
    incomingDuration: 120.048,
    duration: 2,
    dispose: vi.fn(async () => {}),
  }
  let resolve!: (plan: SoftTransition | null) => void
  let reject!: (error: Error) => void
  const pending = new Promise<SoftTransition | null>((yes, no) => {
    resolve = yes
    reject = no
  })
  const prepare = vi
    .spyOn(SoftTransitionPreparer.prototype, 'prepare')
    .mockReturnValueOnce(pending)
    .mockResolvedValue(null)
  const events: NativePlaybackEvent[] = [],
    statuses: string[] = [],
    warnings: unknown[] = []
  let emit!: (event: MpvMessage) => void
  const state = {
    time: 0,
    position: 0,
    end: 'none',
    playlist: [] as { path: string; start: number }[],
    before: (async () => {}) as (name: string, args: unknown[]) => Promise<void>,
  }
  const command = vi.fn(async (rawName: unknown, ...args: unknown[]) => {
    const name = String(rawName)
    await state.before(name, args)
    if (name === 'get_property') {
      if (args[0] === 'duration')
        return state.playlist[state.position]?.path === 'bridge.wav' ? 2 : 120
      if (args[0] === 'time-pos') return state.time
      if (args[0] === 'playlist-pos') return state.position
      if (args[0] === 'path') return state.playlist[state.position]?.path
    }
    if (name === 'loadfile') {
      const item = {
        path: String(args[0]),
        start: Number((args[3] as { start?: string })?.start ?? 0),
      }
      if (args[1] === 'replace') {
        state.playlist = [item]
        state.position = 0
        state.time = item.start
        queueMicrotask(() => {
          emit({ event: 'start-file' })
          emit({ event: 'file-loaded' })
        })
      } else state.playlist.push(item)
    }
    if (name === 'playlist-clear') {
      state.playlist = [state.playlist[state.position]]
      state.position = 0
    }
    if (name === 'playlist-move') {
      const current = state.playlist[state.position]
      const [item] = state.playlist.splice(Number(args[0]), 1)
      state.playlist.splice(Number(args[1]), 0, item)
      state.position = state.playlist.indexOf(current)
    }
    if (name === 'playlist-remove') state.playlist.splice(Number(args[0]), 1)
    if (name === 'set_property' && args[0] === 'file-local-options/end') state.end = String(args[1])
    return undefined
  })
  vi.mocked(openMpvClient).mockImplementation(async (_path, callback) => {
    emit = callback
    return { command, close: vi.fn() }
  })
  const service = new NativePlaybackService({
    mpvPath: 'mpv',
    ffmpegPath: 'ffmpeg',
    resolveTrack: async (id) => `${id}.flac`,
    emit: (e) => events.push(e),
    warn: (e) => warnings.push(e),
    onBoundaryStatus: (e) => statuses.push(e.status),
  })
  await service.command({ action: 'start', session: 1, trackId: 1, volume: 1, muted: false })
  const schedule = (id = 2) =>
    service.command({
      action: 'next',
      session: 1,
      trackId: id,
      trimDigitalSilence: false,
      softTransition: true,
    })
  async function advance() {
    state.position++
    state.time = state.playlist[state.position].start
    emit({ event: 'start-file' })
    emit({ event: 'file-loaded' })
    await vi.waitFor(() => expect(events.at(-1)?.trackId).toBe(2))
  }
  async function install() {
    await schedule()
    resolve(plan)
    await vi.waitFor(() => expect(statuses).toContain('applied'))
  }
  return {
    service,
    state,
    plan,
    events,
    statuses,
    warnings,
    command,
    prepare,
    resolve,
    reject,
    schedule,
    advance,
    install,
    emit: (event: MpvMessage) => emit(event),
  }
}

it('cancels a prepared transition and restores the entire outgoing track', async () => {
  const test = await setup()
  await test.install()
  expect(test.state.playlist.map((item) => item.path)).toEqual(['1.flac', 'bridge.wav', '2.flac'])
  await test.service.command({ action: 'cancel-next', session: 1 })
  expect(test.state.playlist.map((item) => item.path)).toEqual(['1.flac'])
  expect(test.state.end).toBe('none')
  expect(test.plan.dispose).toHaveBeenCalledOnce()
})

it('keeps the B continuation through pause, cancellation and queue replacement', async () => {
  const test = await setup()
  await test.install()
  await test.advance()
  expect(test.events.filter((e) => e.kind === 'boundary')).toHaveLength(1)
  expect(test.events.at(-1)?.duration).toBe(120.048)
  test.emit({ event: 'property-change', name: 'time-pos', data: 0.5 })
  expect(test.events.at(-1)?.currentTime).toBeCloseTo(0.548)
  await test.service.command({ action: 'pause', session: 1 })
  await test.service.command({ action: 'cancel-next', session: 1 })
  expect(test.state.playlist.at(-1)?.path).toBe('2.flac')
  await test.schedule(3)
  await test.service.command({ action: 'cancel-next', session: 1 })
  await test.schedule(4)
  await test.service.command({ action: 'resume', session: 1 })
  await test.advance()
  await vi.waitFor(() => expect(test.state.playlist.at(-1)?.path).toBe('4.flac'))
  expect(test.events.filter((e) => e.kind === 'boundary')).toHaveLength(1)
  expect(test.plan.dispose).toHaveBeenCalledOnce()
  expect(test.warnings).toEqual([])
})

it('seeks in B instead of the bridge and does not emit a second boundary', async () => {
  const test = await setup()
  await test.install()
  await test.advance()
  await test.service.command({ action: 'seek', session: 1, time: 30 })
  await vi.waitFor(() => expect(test.events.at(-1)?.currentTime).toBe(30))
  expect(test.state.playlist).toEqual([{ path: '2.flac', start: 30 }])
  expect(test.events.filter((e) => e.kind === 'boundary').map((e) => e.trackId)).toEqual([2])
  expect(test.plan.dispose).toHaveBeenCalledOnce()
})

it.each(['cancel-next', 'stop', 'seek'] as const)(
  'discards late analysis after %s',
  async (action) => {
    const test = await setup()
    await test.schedule()
    await test.service.command(
      action === 'seek' ? { action, session: 1, time: 20 } : { action, session: 1 },
    )
    test.resolve(test.plan)
    await vi.waitFor(() => expect(test.plan.dispose).toHaveBeenCalledOnce())
    expect(
      test.command.mock.calls.some((call) => call[0] === 'loadfile' && call[1] === 'bridge.wav'),
    ).toBe(false)
  },
)

it.each(['failed', 'late'] as const)(
  'retains ordinary next playback when preparation is %s',
  async (mode) => {
    const test = await setup()
    await test.schedule()
    if (mode === 'failed') test.reject(new Error('Soft transition decode timed out'))
    else {
      test.state.time = 117
      test.resolve(test.plan)
    }
    await vi.waitFor(() =>
      expect(test.statuses).toContain(mode === 'failed' ? 'failed' : 'too-late'),
    )
    expect(test.state.playlist.map((item) => item.path)).toEqual(['1.flac', '2.flac'])
    expect(test.state.end).toBe('none')
  },
)

it('rolls back a failed queue upgrade to the untrimmed next song', async () => {
  const test = await setup()
  test.state.before = async (name) => {
    if (name === 'playlist-move') throw new Error('move failed')
  }
  await test.schedule()
  test.resolve(test.plan)
  await vi.waitFor(() => expect(test.statuses).toContain('failed'))
  expect(test.state.playlist).toEqual([
    { path: '1.flac', start: 0 },
    { path: '2.flac', start: 0 },
  ])
  expect(test.state.end).toBe('none')
})

it('stops the old bridge when a newer playback session starts', async () => {
  const test = await setup()
  await test.install()
  await test.advance()
  await test.service.command({ action: 'start', session: 2, trackId: 8, volume: 1, muted: false })
  expect(test.state.playlist.map((item) => item.path)).toEqual(['8.flac'])
  expect(test.events.at(-1)?.trackId).toBe(8)
  expect(test.plan.dispose).toHaveBeenCalledOnce()
})

it.each(['append', 'move'] as const)(
  'recovers ordinary B when natural advancement overtakes %s',
  async (phase) => {
    const test = await setup()
    await test.schedule()
    test.state.before = async (name, args) => {
      const hit =
        phase === 'append'
          ? name === 'loadfile' &&
            args[0] === '2.flac' &&
            Boolean((args[3] as { start?: string })?.start)
          : name === 'playlist-move' && args[0] === 3
      if (!hit) return
      test.state.before = async () => {}
      await test.advance()
    }
    test.resolve(test.plan)
    await vi.waitFor(() => expect(test.statuses).toContain('cancelled'))
    await vi.waitFor(() => expect(test.state.playlist).toEqual([{ path: '2.flac', start: 0 }]))
    expect(test.events.filter((e) => e.kind === 'boundary').map((e) => e.trackId)).toEqual([2])
    expect(test.events.filter((e) => e.kind === 'error')).toEqual([])
    expect(test.plan.dispose).toHaveBeenCalledOnce()
  },
)
