import { afterEach, describe, expect, it, vi } from 'vitest'
import { DigitalSilenceAnalyzer, type DigitalBoundary } from './digitalSilence'
import { NativePlaybackService } from './nativePlaybackService'
import { openMpvClient, type MpvClient, type MpvMessage } from './mpvClient'

vi.mock('./mpvClient', () => ({ openMpvClient: vi.fn() }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

async function setup() {
  const analysis = deferred<DigitalBoundary | null>()
  vi.spyOn(DigitalSilenceAnalyzer.prototype, 'boundary').mockReturnValue(analysis.promise)
  const statuses: string[] = []
  const warnings: unknown[] = []
  let emit!: (event: MpvMessage) => void
  const state = {
    time: 0,
    position: 0,
    end: 'none',
    playlist: [] as { path: string; start: string }[],
    before: (async () => {}) as (name: string, args: unknown[]) => Promise<void>,
  }
  const command = vi.fn(async (name: string, ...args: unknown[]) => {
    await state.before(name, args)
    if (name === 'get_property') {
      if (args[0] === 'duration') return 120
      if (args[0] === 'time-pos') return state.time
      if (args[0] === 'playlist-pos') return state.position
    }
    if (name === 'loadfile') {
      const item = { path: String(args[0]), start: (args[3] as { start?: string })?.start ?? '0' }
      if (args[1] === 'replace') {
        state.playlist = [item]
        state.position = 0
        queueMicrotask(() => emit({ event: 'file-loaded' }))
      } else state.playlist.push(item)
    }
    if (name === 'playlist-clear') {
      state.playlist = [state.playlist[state.position]!]
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
    return { command, close: vi.fn() } as MpvClient
  })
  const service = new NativePlaybackService({
    mpvPath: 'mpv.exe',
    ffmpegPath: 'ffmpeg.exe',
    resolveTrack: async (id) => `track-${id}.flac`,
    emit: vi.fn(),
    warn: (error) => warnings.push(error),
    onBoundaryStatus: ({ status }) => statuses.push(status),
  })
  await service.command({ action: 'start', session: 1, trackId: 1, volume: 1, muted: false })
  const schedule = () =>
    service.command({ action: 'next', session: 1, trackId: 2, trimDigitalSilence: true })
  const settle = async (status: string) => vi.waitFor(() => expect(statuses).toContain(status))
  return {
    service,
    analysis,
    statuses,
    warnings,
    state,
    command,
    schedule,
    settle,
    emit: (event: MpvMessage) => emit(event),
  }
}

afterEach(() => vi.restoreAllMocks())

describe('nonblocking digital boundary refinement', () => {
  it('acknowledges ordinary prequeue before analysis and upgrades only afterward', async () => {
    const test = await setup()
    await expect(test.schedule()).resolves.toEqual({ accepted: true })
    expect(test.state.playlist).toEqual([
      { path: 'track-1.flac', start: '0' },
      { path: 'track-2.flac', start: '0' },
    ])
    expect(test.statuses).toEqual(['analyzing'])
    test.analysis.resolve({ start: 0.04, end: 119.96 })
    await test.settle('applied')
    expect(test.state.playlist).toEqual([
      { path: 'track-1.flac', start: '0' },
      { path: 'track-2.flac', start: '0.04' },
    ])
    expect(test.state.end).toBe('119.96')
  })

  it.each(['failure', 'timeout', 'unchanged', 'late'] as const)(
    'preserves ordinary prequeue on %s',
    async (reason) => {
      const test = await setup()
      await test.schedule()
      if (reason === 'failure' || reason === 'timeout')
        test.analysis.reject(new Error(`scan ${reason}`))
      else {
        if (reason === 'late') test.state.time = 118
        test.analysis.resolve(reason === 'unchanged' ? null : { start: 0.04, end: 119.96 })
      }
      await test.settle(
        reason === 'unchanged' ? 'unchanged' : reason === 'late' ? 'too-late' : 'failed',
      )
      expect(test.state.playlist).toHaveLength(2)
      expect(test.state.playlist[1].start).toBe('0')
      expect(test.state.end).toBe('none')
      expect(test.command.mock.calls.filter(([name]) => name === 'loadfile')).toHaveLength(2)
    },
  )

  it.each(['cancel-next', 'stop'] as const)('ignores results after %s', async (action) => {
    const test = await setup()
    await test.schedule()
    await test.service.command({ action, session: 1 })
    const calls = test.command.mock.calls.length
    test.analysis.resolve({ start: 0.04, end: 119.96 })
    await test.settle('cancelled')
    expect(test.command).toHaveBeenCalledTimes(calls)
  })

  it('does not apply a previous plan after a seek and replacement plan', async () => {
    const test = await setup()
    await test.schedule()
    await test.service.command({ action: 'cancel-next', session: 1 })
    await test.service.command({ action: 'seek', session: 1, time: 50 })
    await test.service.command({
      action: 'next',
      session: 1,
      trackId: 3,
      trimDigitalSilence: false,
    })
    test.analysis.resolve({ start: 0.04, end: 119.96 })
    await test.settle('cancelled')
    expect(test.state.playlist[1]).toEqual({ path: 'track-3.flac', start: '0' })
    expect(test.state.end).toBe('none')
  })

  it.each(['append', 'end'] as const)(
    'restores ordinary prequeue after %s update fails',
    async (step) => {
      const test = await setup()
      await test.schedule()
      let failed = false
      test.state.before = async (name, args) => {
        if (
          !failed &&
          (step === 'append'
            ? name === 'loadfile'
            : name === 'set_property' && args[1] === '119.96')
        ) {
          failed = true
          throw new Error('update failed')
        }
      }
      test.analysis.resolve({ start: 0.04, end: 119.96 })
      await test.settle('failed')
      expect(test.state.playlist).toHaveLength(2)
      expect(test.state.playlist[1].start).toBe('0')
      expect(test.state.end).toBe('none')
    },
  )

  it('removes the temporary duplicate if playback crosses the boundary during append', async () => {
    const test = await setup()
    await test.schedule()
    test.state.before = async (name) => {
      if (name === 'loadfile') {
        test.state.position = 1
        test.emit({ event: 'start-file' })
      }
    }
    test.analysis.resolve({ start: 0.04, end: 119.96 })
    await test.settle('cancelled')
    await vi.waitFor(() =>
      expect(test.state.playlist).toEqual([{ path: 'track-2.flac', start: '0' }]),
    )
    expect(test.state.end).toBe('none')
    expect(test.command.mock.calls.some(([name]) => name === 'playlist-remove')).toBe(false)
  })

  it('preserves the entered item when a delayed move crosses the boundary', async () => {
    const test = await setup()
    await test.schedule()
    test.state.before = async (name) => {
      if (name === 'playlist-move') {
        test.state.position = 1
        test.emit({ event: 'start-file' })
      }
    }
    test.analysis.resolve({ start: 0.04, end: 119.96 })
    await test.settle('cancelled')
    await vi.waitFor(() =>
      expect(test.state.playlist).toEqual([{ path: 'track-2.flac', start: '0' }]),
    )
    expect(test.command.mock.calls.some(([name]) => name === 'playlist-remove')).toBe(false)
    expect(test.state.end).toBe('none')
  })

  it('clears a delayed end option that lands after the next item starts', async () => {
    const test = await setup()
    await test.schedule()
    test.state.before = async (name, args) => {
      if (name === 'set_property' && args[1] === '119.96') {
        test.state.position = 1
        test.emit({ event: 'start-file' })
      }
    }
    test.analysis.resolve({ start: 0.04, end: 119.96 })
    await test.settle('cancelled')
    await vi.waitFor(() => expect(test.state.end).toBe('none'))
    expect(test.state.playlist).toEqual([{ path: 'track-2.flac', start: '0.04' }])
  })

  it('restores the ordinary item if the update window closes after replacement', async () => {
    const test = await setup()
    await test.schedule()
    test.state.before = async (name) => {
      if (name === 'playlist-remove') test.state.time = 118
    }
    test.analysis.resolve({ start: 0.04, end: 119.96 })
    await test.settle('too-late')
    expect(test.state.playlist).toEqual([
      { path: 'track-1.flac', start: '0' },
      { path: 'track-2.flac', start: '0' },
    ])
    expect(test.state.end).toBe('none')
  })

  it('ignores results from a replaced playback session', async () => {
    const test = await setup()
    await test.schedule()
    await test.service.command({ action: 'start', session: 2, trackId: 3, volume: 1, muted: false })
    test.analysis.resolve({ start: 0.04, end: 119.96 })
    await test.settle('cancelled')
    expect(test.state.playlist).toEqual([{ path: 'track-3.flac', start: '0' }])
    expect(test.state.end).toBe('none')
  })
})
