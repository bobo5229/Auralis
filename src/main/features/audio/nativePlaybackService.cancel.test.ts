import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativePlaybackEvent } from '@shared/ipc/contracts'
import { NativePlaybackService } from './nativePlaybackService'
import { openMpvClient, type MpvClient, type MpvMessage } from './mpvClient'

vi.mock('./mpvClient', () => ({ openMpvClient: vi.fn() }))

type PendingCommand = {
  name: string
  args: unknown[]
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

type FakeClient = {
  client: MpvClient
  pending: PendingCommand[]
  calls: string[]
  hangNames: Set<string>
  closed: () => boolean
}

type OpenHandle = FakeClient & {
  onEvent: (event: MpvMessage) => void
  onFailure: (error: Error) => void
  signal: AbortSignal
}

const opened: OpenHandle[] = []

function createFakeClient(): FakeClient {
  const pending: PendingCommand[] = []
  const calls: string[] = []
  const hangNames = new Set<string>()
  let closed = false
  const client: MpvClient = {
    command: (...args: unknown[]) => {
      const name = String(args[0])
      calls.push(name)
      if (closed) return Promise.reject(new Error('mpv closed'))
      if (!hangNames.has(name)) {
        if (name === 'get_property' && args[1] === 'duration') return Promise.resolve(120)
        if (name === 'get_property' && args[1] === 'time-pos') return Promise.resolve(0)
        return Promise.resolve(undefined)
      }
      return new Promise((resolve, reject) => {
        pending.push({ name, args, resolve, reject })
      })
    },
    close: async () => {
      if (closed) return
      closed = true
      for (const item of pending.splice(0)) item.reject(new Error('mpv closed'))
    },
  }
  return {
    client,
    pending,
    calls,
    hangNames,
    closed: () => closed,
  }
}

function openImplementation(hangFirst: string[] = []) {
  return async (
    _path: string,
    onEvent: (event: MpvMessage) => void,
    onFailure: (error: Error) => void,
    signal: AbortSignal,
  ) => {
    const fake = createFakeClient()
    if (opened.length === 0) for (const name of hangFirst) fake.hangNames.add(name)
    opened.push({ ...fake, onEvent, onFailure, signal })
    return fake.client
  }
}

function createService() {
  const events: NativePlaybackEvent[] = []
  const warnings: unknown[] = []
  const service = new NativePlaybackService({
    mpvPath: 'mpv.exe',
    ffmpegPath: 'ffmpeg.exe',
    resolveTrack: async (id) => `track-${id}.flac`,
    emit: (event) => events.push(event),
    warn: (error) => warnings.push(error),
  })
  return { service, events, warnings }
}

async function completeStart(
  service: NativePlaybackService,
  session: number,
  trackId = 1,
): Promise<OpenHandle> {
  const start = service.command({
    action: 'start',
    session,
    trackId,
    volume: 1,
    muted: false,
  })
  await vi.waitFor(() => expect(opened.length).toBeGreaterThan(0))
  const handle = opened.at(-1)!
  handle.onEvent({ event: 'file-loaded' })
  await expect(start).resolves.toEqual({ accepted: true })
  return handle
}

function pendingNames(handle: FakeClient): string[] {
  return handle.pending.map((item) => item.name)
}

function beginTagRecovery(service: NativePlaybackService, handle: OpenHandle): void {
  // Keep real event routing and command serialization; inject only the already-prepared window.
  const state = service as unknown as { tags: { tagWindow: unknown } }
  state.tags.tagWindow = {
    phase: 'resume',
    source: { path: 'recovery.flac', dispose: async () => {} },
    resumePath: 'replacement.flac',
    abort: new AbortController(),
  }
  handle.hangNames.add('loadfile')
  handle.onEvent({ event: 'end-file', reason: 'error' })
}

beforeEach(() => {
  opened.length = 0
  vi.mocked(openMpvClient).mockReset()
  vi.mocked(openMpvClient).mockImplementation(openImplementation())
})

describe('NativePlaybackService session cancellation', () => {
  it.each(['start', 'stop'] as const)(
    'ignores a stale tag recovery rejection after %s',
    async (action) => {
      const { service, events } = createService()
      try {
        const old = await completeStart(service, 1)
        beginTagRecovery(service, old)
        await vi.waitFor(() => expect(pendingNames(old)).toContain('loadfile'))
        if (action === 'start') {
          const starting = service.command({
            action: 'start',
            session: 2,
            trackId: 2,
            volume: 1,
            muted: false,
          })
          await vi.waitFor(() => expect(opened).toHaveLength(2))
          opened[1].onEvent({ event: 'file-loaded' })
          await expect(starting).resolves.toEqual({ accepted: true })
          await new Promise<void>((resolve) => setImmediate(resolve))
          expect(opened[1].closed()).toBe(false)
          expect(events.at(-1)?.trackId).toBe(2)
        } else {
          await expect(service.command({ action: 'stop', session: 1 })).resolves.toEqual({
            accepted: true,
          })
          await new Promise<void>((resolve) => setImmediate(resolve))
        }
        expect(events.filter((event) => event.kind === 'error')).toEqual([])
      } finally {
        await service.dispose()
      }
    },
  )

  it('reports a tag recovery failure from the current window', async () => {
    const { service, events } = createService()
    try {
      const handle = await completeStart(service, 1)
      beginTagRecovery(service, handle)
      await vi.waitFor(() => expect(pendingNames(handle)).toContain('loadfile'))
      handle.pending.shift()!.reject(new Error('Recovery decode failed'))
      await vi.waitFor(() => expect(events.at(-1)?.kind).toBe('error'))
      expect(events.at(-1)?.detail).toBe('Recovery decode failed')
      expect(handle.closed()).toBe(true)
    } finally {
      await service.dispose()
    }
  })

  it('returns accepted:false when a pending start load is replaced by a new session', async () => {
    const { service, events } = createService()
    vi.mocked(openMpvClient).mockImplementation(openImplementation(['loadfile']))
    const start1 = service.command({
      action: 'start',
      session: 1,
      trackId: 1,
      volume: 1,
      muted: false,
    })
    await vi.waitFor(() => expect(pendingNames(opened[0])).toContain('loadfile'))

    const start2 = service.command({
      action: 'start',
      session: 2,
      trackId: 2,
      volume: 1,
      muted: false,
    })
    await vi.waitFor(() => expect(opened.length).toBe(2))
    opened[1].onEvent({ event: 'file-loaded' })

    await expect(start1).resolves.toEqual({ accepted: false })
    await expect(start2).resolves.toEqual({ accepted: true })
    expect(events.filter((event) => event.kind === 'error')).toEqual([])
  })

  it('returns accepted:false when setup commands are rejected by session release', async () => {
    const { service, events } = createService()
    vi.mocked(openMpvClient).mockImplementation(openImplementation(['observe_property']))
    const start1 = service.command({
      action: 'start',
      session: 1,
      trackId: 1,
      volume: 1,
      muted: false,
    })
    await vi.waitFor(() => expect(pendingNames(opened[0])).toContain('observe_property'))

    const start2 = service.command({
      action: 'start',
      session: 2,
      trackId: 2,
      volume: 1,
      muted: false,
    })
    await vi.waitFor(() => expect(opened.length).toBe(2))
    opened[1].onEvent({ event: 'file-loaded' })

    await expect(start1).resolves.toEqual({ accepted: false })
    await expect(start2).resolves.toEqual({ accepted: true })
    expect(events.filter((event) => event.kind === 'error')).toEqual([])
  })

  it('returns accepted:false when openMpvClient is aborted mid-startup', async () => {
    const { service, events } = createService()
    const first = createFakeClient()
    vi.mocked(openMpvClient)
      .mockImplementationOnce(async (_path, onEvent, onFailure, signal) => {
        opened.push({ ...first, onEvent, onFailure, signal })
        return new Promise((_resolve, reject) => {
          const onAbort = () => {
            first.client.close()
            reject(new Error('mpv startup cancelled'))
          }
          if (signal.aborted) onAbort()
          else signal.addEventListener('abort', onAbort, { once: true })
        })
      })
      .mockImplementation(openImplementation())
    const start1 = service.command({
      action: 'start',
      session: 1,
      trackId: 1,
      volume: 1,
      muted: false,
    })
    await vi.waitFor(() => expect(opened.length).toBe(1))

    const start2 = service.command({
      action: 'start',
      session: 2,
      trackId: 2,
      volume: 1,
      muted: false,
    })
    await vi.waitFor(() => expect(opened.length).toBe(2))
    opened[1].onEvent({ event: 'file-loaded' })

    await expect(start1).resolves.toEqual({ accepted: false })
    await expect(start2).resolves.toEqual({ accepted: true })
    expect(first.closed()).toBe(true)
    expect(events.filter((event) => event.kind === 'error')).toEqual([])
  })

  it('returns accepted:false for a queued command rejected by session replacement', async () => {
    const { service, events } = createService()
    const handle = await completeStart(service, 1)
    handle.hangNames.add('set_property')
    const pause = service.command({ action: 'pause', session: 1 })
    await vi.waitFor(() => expect(pendingNames(handle)).toContain('set_property'))

    const start2 = service.command({
      action: 'start',
      session: 2,
      trackId: 2,
      volume: 1,
      muted: false,
    })
    await vi.waitFor(() => expect(opened.length).toBe(2))
    opened[1].onEvent({ event: 'file-loaded' })

    await expect(pause).resolves.toEqual({ accepted: false })
    await expect(start2).resolves.toEqual({ accepted: true })
    expect(events.filter((event) => event.kind === 'error')).toEqual([])
  })

  it('returns accepted:false for a queued command rejected by stop on the same session', async () => {
    const { service, events } = createService()
    const handle = await completeStart(service, 1)
    handle.hangNames.add('seek')
    const seek = service.command({ action: 'seek', session: 1, time: 3 })
    await vi.waitFor(() => expect(pendingNames(handle)).toContain('seek'))

    await expect(service.command({ action: 'stop', session: 1 })).resolves.toEqual({
      accepted: true,
    })
    await expect(seek).resolves.toEqual({ accepted: false })
    expect(events.filter((event) => event.kind === 'error')).toEqual([])
  })

  it('returns accepted:false when schedule append is rejected by session replacement', async () => {
    const { service, events } = createService()
    const handle = await completeStart(service, 1)
    handle.hangNames.add('loadfile')
    const next = service.command({
      action: 'next',
      session: 1,
      trackId: 2,
      trimDigitalSilence: false,
    })
    await vi.waitFor(() => expect(pendingNames(handle)).toContain('loadfile'))
    const playlistClearsBefore = handle.calls.filter((name) => name === 'playlist-clear').length

    await expect(service.command({ action: 'stop', session: 1 })).resolves.toEqual({
      accepted: true,
    })
    await expect(next).resolves.toEqual({ accepted: false })
    expect(handle.calls.filter((name) => name === 'playlist-clear')).toHaveLength(
      playlistClearsBefore,
    )
    expect(events.filter((event) => event.kind === 'error')).toEqual([])
  })

  it('still rejects real command failures on the current session', async () => {
    const { service, events } = createService()
    const handle = await completeStart(service, 1)
    handle.hangNames.add('set_property')
    const pause = service.command({ action: 'pause', session: 1 })
    await vi.waitFor(() => expect(pendingNames(handle)).toContain('set_property'))
    for (const item of handle.pending.filter((entry) => entry.name === 'set_property')) {
      item.reject(new Error('mpv: property unavailable'))
    }

    await expect(pause).rejects.toThrow('mpv: property unavailable')
    expect(events.filter((event) => event.kind === 'error')).toEqual([])
  })

  it('still publishes playback failures from the current session client', async () => {
    const { service, events } = createService()
    const handle = await completeStart(service, 1)
    handle.onFailure(new Error('mpv exited (1)'))
    expect(
      events.some((event) => event.kind === 'error' && event.detail === 'mpv exited (1)'),
    ).toBe(true)
  })
})
