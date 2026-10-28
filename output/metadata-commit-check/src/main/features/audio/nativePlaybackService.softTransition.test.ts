import { afterEach, expect, it, vi } from 'vitest'
import { NativePlaybackService } from './nativePlaybackService'
import { SoftTransitionPreparer, type SoftTransition } from './softTransition'
import { openMpvClient, type MpvMessage } from './mpvClient'
import type { NativePlaybackEvent } from '../../../shared/ipc/contracts'
import type { PlaybackCoordinator } from './nativePlaybackTypes'
import type { NativeNextTrackScheduler } from './nativeNextTrackScheduler'
import { LiveSilenceAnalyzer } from './liveSilence'

vi.mock('./mpvClient', () => ({ openMpvClient: vi.fn() }))
afterEach(() => vi.restoreAllMocks())

it('drains file analysis for saving and resumes deferred refinement without rebuilding its playlist', async () => {
  const test = await setup()
  await test.schedule()
  expect(test.prepare).toHaveBeenCalledOnce()
  const scheduler = (test.service as unknown as { scheduler: NativeNextTrackScheduler }).scheduler
  let drained = false
  const suspended = scheduler.suspendMetadataAnalysis().then((resume) => {
    drained = true
    return resume
  })
  await Promise.resolve()
  expect(drained).toBe(false)
  test.resolve(null)
  const resume = await suspended
  await test.schedule(3)
  expect(test.prepare).toHaveBeenCalledOnce()
  const commands = test.command.mock.calls.length
  resume()
  await vi.waitFor(() => expect(test.prepare).toHaveBeenCalledTimes(2))
  expect(
    test.command.mock.calls
      .slice(commands)
      .some(([name]) => name === 'playlist-clear' || name === 'loadfile'),
  ).toBe(false)
  expect(test.state.playlist.map((entry) => entry.path)).toEqual(['1.flac', '3.flac'])
  await test.service.dispose()
})

async function setup(coordinator?: PlaybackCoordinator) {
  const liveBoundary = vi.spyOn(LiveSilenceAnalyzer.prototype, 'boundary').mockResolvedValue(null)
  const isLiveAlbum = vi.fn<(id: number) => boolean>(() => false)
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
  let nextEntryId = 0
  const entryIds = new WeakMap<object, number>()
  const entryFilters = new WeakMap<object, { label: string; start: number }[]>()
  const state = {
    time: 0,
    position: 0,
    end: 'none',
    paused: false,
    idle: false,
    playlist: [] as { path: string; start: number }[],
    filters: [] as { label: string; start: number }[],
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
      if (args[0] === 'playlist/0/id') return entryIds.get(state.playlist[0])
      if (args[0] === 'pause') return state.paused
      if (args[0] === 'af') return state.filters
    }
    if (name === 'loadfile') {
      const options = args[3] as { start?: string; af?: string }
      const trimmedStart = options?.af?.match(/atrim=start=([^\]]+)/)?.[1]
      const item = {
        path: String(args[0]),
        start: Number(options?.start ?? trimmedStart ?? 0),
      }
      entryFilters.set(
        item,
        trimmedStart ? [{ label: 'auralis-soft-transition', start: Number(trimmedStart) }] : [],
      )
      const entryId = ++nextEntryId
      entryIds.set(item, entryId)
      if (args[1] === 'replace') {
        state.playlist = [item]
        state.position = 0
        state.time = item.start
        state.filters = entryFilters.get(item)!
        queueMicrotask(() => {
          emit({ event: 'start-file', playlist_entry_id: entryId })
          emit({ event: 'file-loaded' })
        })
      } else {
        state.playlist.push(item)
        if (args[1] === 'append-play' && state.idle) {
          state.idle = false
          state.position = state.playlist.length - 1
          state.time = item.start
          state.filters = entryFilters.get(item)!
          queueMicrotask(() => {
            emit({ event: 'start-file', playlist_entry_id: entryId })
            emit({ event: 'file-loaded' })
          })
        }
      }
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
    if (name === 'set_property' && args[0] === 'pause') state.paused = Boolean(args[1])
    if (name === 'af' && args[0] === 'remove')
      state.filters = state.filters.filter((filter) => `@${filter.label}` !== args[1])
    if (name === 'seek') {
      state.time = Math.max(Number(args[0]), ...state.filters.map((filter) => filter.start))
      emit({ event: 'property-change', name: 'time-pos', data: state.time })
    }
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
    coordinator,
    isLiveAlbum,
  })
  await service.command({ action: 'start', session: 1, trackId: 1, volume: 1, muted: false })
  const schedule = (id = 2, durationSeconds = 2) =>
    service.command({
      action: 'next',
      session: 1,
      trackId: id,
      trimDigitalSilence: false,
      softTransition: true,
      softTransitionDurationSeconds: durationSeconds,
    })
  async function advance(load = true) {
    state.position++
    state.time = state.playlist[state.position].start
    state.filters = entryFilters.get(state.playlist[state.position]) ?? []
    emit({ event: 'start-file' })
    if (!load) return
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
    liveBoundary,
    isLiveAlbum,
    resolve,
    reject,
    schedule,
    advance,
    install,
    emit: (event: MpvMessage) => emit(event),
  }
}

it('replaces crossfade with a direct Live boundary even when digital trimming is off', async () => {
  const test = await setup()
  test.isLiveAlbum.mockReturnValue(true)
  test.liveBoundary.mockResolvedValue({ start: 1.5, end: 117 })
  await test.schedule()
  await vi.waitFor(() => expect(test.statuses).toContain('applied'))
  expect(test.prepare).not.toHaveBeenCalled()
  expect(test.state.playlist).toEqual([
    { path: '1.flac', start: 0 },
    { path: '2.flac', start: 1.5 },
  ])
  expect(test.state.end).toBe('117')
  await test.service.dispose()
})

it('keeps ordinary gapless playback for Live without edge silence', async () => {
  const test = await setup()
  test.isLiveAlbum.mockReturnValue(true)
  test.liveBoundary.mockResolvedValue(null)
  await test.schedule()
  await vi.waitFor(() => expect(test.statuses).toContain('unchanged'))
  expect(test.prepare).not.toHaveBeenCalled()
  expect(test.state.playlist).toEqual([
    { path: '1.flac', start: 0 },
    { path: '2.flac', start: 0 },
  ])
  expect(test.state.end).toBe('none')
  await test.service.dispose()
})

it.each(['cancel-next', 'stop'] as const)(
  'discards a pending Live scan after %s',
  async (action) => {
    const test = await setup()
    test.isLiveAlbum.mockReturnValue(true)
    let finish!: (result: { start: number; end: number }) => void
    test.liveBoundary.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    await test.schedule()
    await test.service.command({ action, session: 1 })
    const calls = test.command.mock.calls.length
    finish({ start: 1.5, end: 117 })
    await vi.waitFor(() => expect(test.statuses).toContain('cancelled'))
    expect(test.command).toHaveBeenCalledTimes(calls)
    expect(test.prepare).not.toHaveBeenCalled()
    await test.service.dispose()
  },
)

it('allows seeking back into B after its trimmed continuation has loaded', async () => {
  const test = await setup()
  await test.install()
  await test.advance()
  await test.advance()
  await vi.waitFor(() => expect(test.plan.dispose).toHaveBeenCalledOnce())
  expect(test.state.filters).toEqual([{ label: 'auralis-soft-transition', start: 2.048 }])
  test.state.filters.push({ label: 'user-equalizer', start: 0 })
  await test.service.command({ action: 'seek', session: 1, time: 0.5 })
  expect(test.state.time).toBe(0.5)
  expect(test.events.at(-1)?.currentTime).toBe(0.5)
  expect(test.state.filters).toEqual([{ label: 'user-equalizer', start: 0 }])
  const remove = test.command.mock.calls.findIndex(([name]) => name === 'af')
  const seek = test.command.mock.calls.findIndex(([name]) => name === 'seek')
  expect(remove).toBeGreaterThan(-1)
  expect(remove).toBeLessThan(seek)
  await test.service.dispose()
})

it('drops a seek when playback ends while reading continuation filters', async () => {
  const test = await setup()
  await test.install()
  await test.advance()
  await test.advance()
  await vi.waitFor(() => expect(test.plan.dispose).toHaveBeenCalledOnce())
  test.state.before = async (name, args) => {
    if (name === 'get_property' && args[0] === 'af')
      test.emit({ event: 'property-change', name: 'idle-active', data: true })
  }
  await expect(test.service.command({ action: 'seek', session: 1, time: 0.5 })).resolves.toEqual({
    accepted: false,
  })
  expect(test.command.mock.calls.some(([name]) => name === 'af' || name === 'seek')).toBe(false)
  await test.service.dispose()
})

it('uses a new duration for deferred preparation without replacing the active bridge', async () => {
  const test = await setup()
  await test.install()
  await test.advance()
  const previous = test.state.playlist.map((entry) => ({ ...entry }))
  await test.service.command({ action: 'cancel-next', session: 1 })
  await test.schedule(3, 6)
  expect(test.state.playlist).toEqual(previous)
  expect(test.plan.dispose).not.toHaveBeenCalled()
  await test.advance()
  await vi.waitFor(() => expect(test.prepare).toHaveBeenCalledTimes(2))
  expect(test.prepare).toHaveBeenLastCalledWith(
    '2.flac',
    '3.flac',
    false,
    expect.any(AbortSignal),
    6,
  )
  expect(test.events.filter((e) => e.kind === 'boundary').map((e) => e.trackId)).toEqual([2])
  await test.service.dispose()
})

it('cancels a prepared transition and restores the entire outgoing track', async () => {
  const test = await setup()
  await test.install()
  expect(test.state.playlist.map((item) => item.path)).toEqual(['1.flac', 'bridge.wav', '2.flac'])
  await test.service.command({ action: 'cancel-next', session: 1 })
  expect(test.state.playlist.map((item) => item.path)).toEqual(['1.flac'])
  expect(test.state.end).toBe('none')
  expect(test.plan.dispose).toHaveBeenCalledOnce()
})

it.each(['cancel-next', 'replacement'] as const)(
  'keeps B complete when natural advancement overtakes %s playlist clearing',
  async (action) => {
    const coordinator = {
      acquireReadLease: vi.fn(async (path: string) => ({ leaseId: path, version: 1 })),
      releaseReadLease: vi.fn(),
      isReadLeaseForTrack: () => true,
      markReadLeaseCurrent: vi.fn(),
    }
    const test = await setup(coordinator)
    await test.install()
    test.state.before = async (name) => {
      if (name !== 'playlist-clear') return
      test.state.before = async () => {}
      await test.advance()
      test.state.time = 0.75
      test.emit({ event: 'property-change', name: 'time-pos', data: 0.75 })
    }
    await (action === 'cancel-next'
      ? test.service.command({ action, session: 1 })
      : test.schedule(3))
    expect(test.state.playlist).toEqual([
      { path: 'bridge.wav', start: 0 },
      { path: '2.flac', start: 2.048 },
    ])
    expect(test.state.time).toBe(0.75)
    expect(test.events.at(-1)?.currentTime).toBeCloseTo(0.798)
    expect(coordinator.releaseReadLease).not.toHaveBeenCalledWith('2.flac')
    expect(coordinator.markReadLeaseCurrent).toHaveBeenCalledExactlyOnceWith('2.flac')
    expect(test.plan.dispose).not.toHaveBeenCalled()
    await test.service.command({ action: 'pause', session: 1 })
    await test.schedule(4)
    await test.service.command({ action: 'resume', session: 1 })
    await test.advance()
    await vi.waitFor(() => expect(test.state.playlist.at(-1)?.path).toBe('4.flac'))
    expect(test.events.filter((e) => e.kind === 'boundary').map((e) => e.trackId)).toEqual([2])
    expect(test.events.filter((e) => e.kind === 'error')).toEqual([])
    expect(coordinator.releaseReadLease).not.toHaveBeenCalledWith('2.flac')
    expect(test.plan.dispose).toHaveBeenCalledOnce()
    expect(test.warnings).toEqual([])
    await test.service.dispose()
    expect(coordinator.releaseReadLease.mock.calls.filter(([id]) => id === '2.flac')).toHaveLength(
      1,
    )
  },
)

it('retains B ownership when only start-file arrives before cancellation completes', async () => {
  const coordinator = {
    acquireReadLease: vi.fn(async (path: string) => ({ leaseId: path, version: 1 })),
    releaseReadLease: vi.fn(),
    isReadLeaseForTrack: () => true,
    markReadLeaseCurrent: vi.fn(),
  }
  const test = await setup(coordinator)
  await test.install()
  test.state.before = async (name) => {
    if (name !== 'playlist-clear') return
    test.state.before = async () => {}
    await test.advance(false)
  }
  await test.service.command({ action: 'cancel-next', session: 1 })
  expect(test.state.playlist).toEqual([
    { path: 'bridge.wav', start: 0 },
    { path: '2.flac', start: 2.048 },
  ])
  expect(coordinator.releaseReadLease).not.toHaveBeenCalledWith('2.flac')
  test.emit({ event: 'file-loaded' })
  await vi.waitFor(() => expect(test.events.at(-1)?.trackId).toBe(2))
  expect(coordinator.markReadLeaseCurrent).toHaveBeenCalledExactlyOnceWith('2.flac')
  await test.service.command({ action: 'cancel-next', session: 1 })
  expect(test.state.playlist.at(-1)).toEqual({ path: '2.flac', start: 2.048 })
  await test.advance()
  expect(test.events.filter((e) => e.kind === 'boundary').map((e) => e.trackId)).toEqual([2])
  expect(test.warnings).toEqual([])
  await test.service.dispose()
})

it('does not append B again when clearing preserves its already entered continuation', async () => {
  const test = await setup()
  await test.install()
  test.state.before = async (name) => {
    if (name !== 'playlist-clear') return
    test.state.before = async () => {}
    await test.advance()
    await test.advance()
  }
  await test.service.command({ action: 'cancel-next', session: 1 })
  expect(test.state.playlist).toEqual([{ path: '2.flac', start: 2.048 }])
  expect(test.events.filter((e) => e.kind === 'boundary').map((e) => e.trackId)).toEqual([2])
  expect(test.plan.dispose).toHaveBeenCalledOnce()
  expect(test.warnings).toEqual([])
  await test.service.dispose()
})

it.each(['stop', 'start'] as const)(
  'does not restore an obsolete continuation after %s replaces cancellation ownership',
  async (action) => {
    const test = await setup()
    await test.install()
    let replacement: Promise<{ accepted: boolean }> | undefined
    test.state.before = async (name, args) => {
      if (name === 'playlist-clear') await test.advance()
      if (name !== 'loadfile' || args[1] !== 'append-play') return
      test.state.before = async () => {}
      test.state.idle = true
      test.emit({ event: 'idle' })
      expect(test.events.filter((e) => e.kind === 'ended')).toEqual([])
      replacement = test.service.command(
        action === 'stop'
          ? { action, session: 2 }
          : { action, session: 2, trackId: 8, volume: 1, muted: false },
      )
      // Closing the old transport rejects the command already waiting in IPC.
      throw new Error('mpv closed')
    }
    expect(await test.service.command({ action: 'cancel-next', session: 1 })).toEqual({
      accepted: false,
    })
    expect(await replacement).toEqual({ accepted: true })
    expect(test.state.playlist.some((item) => item.path === '2.flac')).toBe(false)
    if (action === 'start') {
      expect(test.state.playlist).toEqual([{ path: '8.flac', start: 0 }])
      expect(test.events.at(-1)?.trackId).toBe(8)
    }
    expect(test.plan.dispose).toHaveBeenCalledOnce()
    expect(test.warnings).toEqual([])
    await test.service.dispose()
  },
)

it('continues B after the bridge reaches EOF while its continuation is being restored', async () => {
  const coordinator = {
    acquireReadLease: vi.fn(async (path: string) => ({ leaseId: path, version: 1 })),
    releaseReadLease: vi.fn(),
    isReadLeaseForTrack: () => true,
    markReadLeaseCurrent: vi.fn(),
  }
  const test = await setup(coordinator)
  await test.install()
  test.state.before = async (name, args) => {
    if (name === 'playlist-clear') await test.advance()
    if (name !== 'loadfile' || args[1] !== 'append-play') return
    test.state.before = async () => {}
    test.state.idle = true
    test.emit({ event: 'property-change', name: 'idle-active', data: true })
    test.emit({ event: 'idle' })
    expect(test.events.filter((e) => e.kind === 'ended')).toEqual([])
    expect(coordinator.releaseReadLease).not.toHaveBeenCalledWith('2.flac')
  }
  await test.service.command({ action: 'cancel-next', session: 1 })
  await vi.waitFor(() => expect(test.service.getSpectrumSource()?.path).toBe('2.flac'))
  expect(test.events.at(-1)?.currentTime).toBe(2.048)
  expect(test.events.filter((e) => e.kind === 'boundary').map((e) => e.trackId)).toEqual([2])
  expect(test.events.filter((e) => e.kind === 'ended')).toEqual([])
  expect(coordinator.releaseReadLease).not.toHaveBeenCalledWith('2.flac')
  expect(test.plan.dispose).toHaveBeenCalledOnce()
  test.emit({ event: 'property-change', name: 'time-pos', data: 119.75 })
  expect(test.events.at(-1)?.currentTime).toBe(119.75)
  test.emit({ event: 'idle' })
  expect(test.events.filter((e) => e.kind === 'ended')).toHaveLength(1)
  expect(coordinator.releaseReadLease.mock.calls.filter(([id]) => id === '2.flac')).toHaveLength(1)
  expect(test.warnings).toEqual([])
  await test.service.dispose()
})

it.each([false, true])(
  'settles failed continuation restoration with bridge idle=%s and permits a live retry',
  async (idle) => {
    const coordinator = {
      acquireReadLease: vi.fn(async (path: string) => ({ leaseId: path, version: 1 })),
      releaseReadLease: vi.fn(),
      isReadLeaseForTrack: () => true,
      markReadLeaseCurrent: vi.fn(),
    }
    const test = await setup(coordinator)
    await test.install()
    test.state.before = async (name, args) => {
      if (name === 'playlist-clear') await test.advance()
      if (name !== 'loadfile' || args[1] !== 'append-play') return
      test.state.before = async () => {}
      if (idle) {
        test.state.idle = true
        test.emit({ event: 'idle' })
        expect(test.events.filter((e) => e.kind === 'ended')).toEqual([])
      }
      throw new Error('continuation append failed')
    }
    await expect(test.service.command({ action: 'cancel-next', session: 1 })).rejects.toThrow(
      'continuation append failed',
    )
    if (idle) {
      expect(test.events.filter((e) => e.kind === 'ended')).toHaveLength(1)
      expect(
        coordinator.releaseReadLease.mock.calls.filter(([id]) => id === '2.flac'),
      ).toHaveLength(1)
      expect(test.plan.dispose).toHaveBeenCalledOnce()
    } else {
      expect(coordinator.releaseReadLease).not.toHaveBeenCalledWith('2.flac')
      expect(test.plan.dispose).not.toHaveBeenCalled()
      const clearCalls = test.command.mock.calls.filter(
        ([name]) => name === 'playlist-clear',
      ).length
      await test.service.command({ action: 'cancel-next', session: 1 })
      expect(test.command.mock.calls.filter(([name]) => name === 'playlist-clear')).toHaveLength(
        clearCalls,
      )
      expect(test.state.playlist).toEqual([
        { path: 'bridge.wav', start: 0 },
        { path: '2.flac', start: 2.048 },
      ])
      await test.advance()
      await vi.waitFor(() => expect(test.plan.dispose).toHaveBeenCalledOnce())
      expect(test.events.filter((e) => e.kind === 'ended')).toEqual([])
    }
    expect(test.events.filter((e) => e.kind === 'boundary').map((e) => e.trackId)).toEqual([2])
    expect(test.warnings).toEqual([])
    await test.service.dispose()
    expect(coordinator.releaseReadLease.mock.calls.filter(([id]) => id === '2.flac')).toHaveLength(
      1,
    )
  },
)

it('keeps the B continuation through pause, cancellation and queue replacement', async () => {
  const test = await setup()
  await test.install()
  await test.advance()
  expect(test.events.filter((e) => e.kind === 'boundary')).toHaveLength(1)
  expect(test.events.at(-1)?.duration).toBe(120.048)
  test.emit({ event: 'property-change', name: 'time-pos', data: 0.5 })
  expect(test.events.at(-1)?.currentTime).toBeCloseTo(0.548)
  expect(test.service.getSpectrumSource()).toMatchObject({
    path: 'bridge.wav',
    trackId: 2,
    currentTime: 0.548,
    timelineOffset: 0.048,
  })
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
  expect(test.service.getSpectrumSource()).toMatchObject({
    path: '2.flac',
    trackId: 2,
    currentTime: 30,
    timelineOffset: 0,
  })
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
          ? name === 'loadfile' && args[0] === '2.flac' && Boolean((args[3] as { af?: string })?.af)
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

it('retains a duration update deferred behind an in-flight transport command during bridge', async () => {
  const test = await setup()
  await test.install()
  await test.advance()
  let release!: () => void
  let blocked = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  test.state.before = async (name, args) => {
    if (name === 'set_property' && args[0] === 'volume' && args[1] === 50) {
      blocked = true
      await gate
    }
  }
  const volume = test.service.command({ action: 'volume', session: 1, volume: 0.5, muted: false })
  await vi.waitFor(() => expect(blocked).toBe(true))
  const cancel = test.service.command({ action: 'cancel-next', session: 1 })
  await test.schedule(3, 6)
  release()
  await Promise.all([volume, cancel])
  test.state.before = async () => {}
  await test.advance()
  await vi.waitFor(() => expect(test.prepare).toHaveBeenCalledTimes(2), { timeout: 500 })
  expect(test.prepare).toHaveBeenLastCalledWith(
    '2.flac',
    '3.flac',
    false,
    expect.any(AbortSignal),
    6,
  )
  await test.service.dispose()
})

it('retains a new duration request when cancellation waits behind transport during a tag write', async () => {
  const test = await setup()
  const tags = (test.service as unknown as { tags: { isActive(): boolean } }).tags
  const active = vi.spyOn(tags, 'isActive').mockReturnValue(true)
  let release!: () => void
  let blocked = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  test.state.before = async (name, args) => {
    if (name === 'set_property' && args[0] === 'volume' && args[1] === 50) {
      blocked = true
      await gate
    }
  }
  const volume = test.service.command({ action: 'volume', session: 1, volume: 0.5, muted: false })
  await vi.waitFor(() => expect(blocked).toBe(true))
  const cancel = test.service.command({ action: 'cancel-next', session: 1 })
  await test.schedule(3, 6)
  release()
  await Promise.all([volume, cancel])
  active.mockReturnValue(false)
  const scheduler = (test.service as unknown as { scheduler: NativeNextTrackScheduler }).scheduler
  scheduler.restoreDeferredNext()
  await vi.waitFor(() => expect(test.prepare).toHaveBeenCalledOnce())
  expect(test.prepare).toHaveBeenLastCalledWith(
    '1.flac',
    '3.flac',
    false,
    expect.any(AbortSignal),
    6,
  )
  test.resolve(null)
  await scheduler.drainAnalysis()
  await test.service.dispose()
})

it.each([
  [true, true],
  [true, false],
  [false, true],
  [false, false],
])('uses album classification for the boundary: %s -> %s', async (left, right) => {
  const test = await setup()
  test.isLiveAlbum.mockImplementation((id) => (id === 1 ? left : right))
  await test.schedule()
  if (left && right) {
    await vi.waitFor(() => expect(test.statuses).toContain('unchanged'))
    expect(test.liveBoundary).toHaveBeenCalledOnce()
    expect(test.prepare).not.toHaveBeenCalled()
  } else {
    await vi.waitFor(() => expect(test.prepare).toHaveBeenCalledOnce())
    expect(test.liveBoundary).not.toHaveBeenCalled()
    test.resolve(null)
  }
  expect(test.isLiveAlbum).toHaveBeenCalledWith(1)
  if (left) expect(test.isLiveAlbum).toHaveBeenCalledWith(2)
  await test.service.dispose()
})

it('honors disabled soft transitions without starting Live analysis', async () => {
  const test = await setup()
  test.isLiveAlbum.mockReturnValue(true)
  await test.service.command({
    action: 'next',
    session: 1,
    trackId: 2,
    trimDigitalSilence: false,
    softTransition: false,
  })
  expect(test.liveBoundary).not.toHaveBeenCalled()
  expect(test.prepare).not.toHaveBeenCalled()
  await test.service.dispose()
})

it('reads updated album classification when a metadata write releases deferred analysis', async () => {
  const test = await setup()
  const scheduler = (test.service as unknown as { scheduler: NativeNextTrackScheduler }).scheduler
  const resume = await scheduler.suspendMetadataAnalysis()
  await test.schedule()
  expect(test.isLiveAlbum).not.toHaveBeenCalled()
  test.isLiveAlbum.mockReturnValue(true)
  resume()
  await vi.waitFor(() => expect(test.statuses).toContain('unchanged'))
  expect(test.isLiveAlbum.mock.calls.map(([id]) => id)).toEqual([1, 2])
  expect(test.prepare).not.toHaveBeenCalled()
  await test.service.dispose()
})
