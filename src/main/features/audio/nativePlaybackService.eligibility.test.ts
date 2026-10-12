import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativePlaybackEvent } from '@shared/ipc/contracts'
import * as metadata from '../metadata/parseAudioMetadata'
import { NativePlaybackService } from './nativePlaybackService'
import type { PlaybackCoordinator } from './nativePlaybackTypes'
import { openMpvClient, type MpvClient, type MpvMessage } from './mpvClient'

vi.mock('./mpvClient', () => ({ openMpvClient: vi.fn() }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => (resolve = yes))
  return { promise, resolve }
}

const eligibleMetadata = {
  format: { sampleRate: 48000, numberOfChannels: 2 },
} as Awaited<ReturnType<typeof metadata.parseAudioMetadata>>

function createMpvHarness() {
  let routeEvent!: (event: MpvMessage) => void
  let activePath = ''
  let entryId = 0
  const nextPaths: string[] = []
  const command = vi.fn(async (name: string, ...args: unknown[]) => {
    if (name === 'loadfile') {
      const path = String(args[0])
      if (args[1] === 'replace') {
        activePath = path
        nextPaths.length = 0
        entryId += 1
        const loadedEntryId = entryId
        queueMicrotask(() => {
          routeEvent({ event: 'start-file', playlist_entry_id: loadedEntryId })
          routeEvent({ event: 'file-loaded' })
        })
      } else if (args[1] === 'append') {
        nextPaths.push(path)
      }
      return undefined
    }
    if (name === 'playlist-clear') {
      nextPaths.length = 0
      return undefined
    }
    if (name === 'get_property') {
      if (args[0] === 'playlist/0/id') return entryId
      if (args[0] === 'duration') return activePath.endsWith('track-2.flac') ? 0.1 : 10
      if (args[0] === 'time-pos') return 0
      if (args[0] === 'pause') return false
      if (args[0] === 'playlist-pos') return 0
    }
    return undefined
  })

  vi.mocked(openMpvClient).mockImplementation(async (_path, onEvent) => {
    routeEvent = onEvent
    return { command, close: vi.fn(async () => undefined) } as unknown as MpvClient
  })

  return {
    command,
    enterNext() {
      const path = nextPaths.shift()
      if (!path) throw new Error('No next file is queued')
      activePath = path
      routeEvent({ event: 'start-file' })
      routeEvent({ event: 'file-loaded' })
    },
  }
}

function createCoordinator(): PlaybackCoordinator & {
  refreshPlaybackCapability: ReturnType<typeof vi.fn>
} {
  let sequence = 0
  return {
    acquireReadLease: vi.fn(async () => ({ leaseId: `read-${++sequence}`, version: sequence })),
    releaseReadLease: vi.fn(),
    reserveWriteIntent: vi.fn(() => null),
    refreshPlaybackCapability: vi.fn(),
  }
}

function createService(coordinator: PlaybackCoordinator, events: NativePlaybackEvent[]) {
  return new NativePlaybackService({
    mpvPath: 'mpv.exe',
    ffmpegPath: 'ffmpeg.exe',
    coordinator,
    resolveTrack: async (id) => `track-${id}.flac`,
    emit: (event) => events.push(event),
    warn: vi.fn(),
  })
}

afterEach(() => vi.restoreAllMocks())

describe('native file-loaded tag eligibility', () => {
  it('publishes a boundary immediately and enables tag editing only after qualification', async () => {
    const harness = createMpvHarness()
    const coordinator = createCoordinator()
    const events: NativePlaybackEvent[] = []
    const service = createService(coordinator, events)
    const trackBTags = deferred<Awaited<ReturnType<typeof metadata.parseAudioMetadata>>>()
    vi.spyOn(metadata, 'parseAudioMetadata').mockImplementation(async (path) =>
      path.endsWith('track-2.flac') ? trackBTags.promise : eligibleMetadata,
    )

    try {
      await service.command({ action: 'start', session: 1, trackId: 1, volume: 1, muted: false })
      expect(service.canWriteMetadata('track-1.flac')).toBe(true)

      await service.command({ action: 'next', session: 1, trackId: 2, trimDigitalSilence: false })
      harness.enterNext()
      await vi.waitFor(() =>
        expect(metadata.parseAudioMetadata).toHaveBeenCalledWith(
          'track-2.flac',
          expect.objectContaining({ skipCovers: true }),
        ),
      )

      const boundary = events.find((event) => event.kind === 'boundary' && event.trackId === 2)
      expect(boundary).toMatchObject({ currentTime: 0, duration: 0.1 })
      expect(service.canWriteMetadata('track-1.flac')).toBe(false)
      expect(service.canWriteMetadata('track-2.flac')).toBe(false)

      trackBTags.resolve(eligibleMetadata)
      await vi.waitFor(() => expect(coordinator.refreshPlaybackCapability).toHaveBeenCalledTimes(2))
      expect(service.canWriteMetadata('track-2.flac')).toBe(true)
    } finally {
      trackBTags.resolve(eligibleMetadata)
      await service.dispose()
    }
  })

  it('ignores pending qualification from an older same-path repeat', async () => {
    const harness = createMpvHarness()
    const coordinator = createCoordinator()
    const events: NativePlaybackEvent[] = []
    const service = createService(coordinator, events)
    const oldTags = deferred<Awaited<ReturnType<typeof metadata.parseAudioMetadata>>>()
    const currentTags = deferred<Awaited<ReturnType<typeof metadata.parseAudioMetadata>>>()
    const parse = vi.spyOn(metadata, 'parseAudioMetadata')
    parse
      .mockResolvedValueOnce(eligibleMetadata)
      .mockReturnValueOnce(oldTags.promise)
      .mockReturnValueOnce(currentTags.promise)

    try {
      await service.command({ action: 'start', session: 1, trackId: 1, volume: 1, muted: false })
      expect(service.canWriteMetadata('track-1.flac')).toBe(true)

      await service.command({ action: 'next', session: 1, trackId: 1, trimDigitalSilence: false })
      harness.enterNext()
      await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(2))
      expect(service.canWriteMetadata('track-1.flac')).toBe(false)

      await service.command({ action: 'next', session: 1, trackId: 1, trimDigitalSilence: false })
      harness.enterNext()
      await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(3))
      currentTags.resolve({ format: { sampleRate: 48000, numberOfChannels: 3 } } as Awaited<
        ReturnType<typeof metadata.parseAudioMetadata>
      >)
      await vi.waitFor(() => expect(coordinator.refreshPlaybackCapability).toHaveBeenCalledTimes(2))

      oldTags.resolve(eligibleMetadata)
      await new Promise<void>((resolve) => setImmediate(resolve))
      expect(service.canWriteMetadata('track-1.flac')).toBe(false)
      expect(coordinator.refreshPlaybackCapability).toHaveBeenCalledTimes(2)
    } finally {
      oldTags.resolve(eligibleMetadata)
      currentTags.resolve(eligibleMetadata)
      await service.dispose()
    }
  })
})
