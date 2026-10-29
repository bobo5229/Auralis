import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BufferedTagPlayback } from './bufferedTagPlayback'
import { NativePlaybackSession } from './nativePlaybackSession'
import { PlaybackFileCoordinator } from './playbackFileCoordinator'
import type { MpvClient } from './mpvClient'
import type { TagAudioBuffer, TagAudioSnapshot } from './tagAudioBuffer'

const io = vi.hoisted(() => ({
  stat: vi.fn(),
  metadata: vi.fn(),
  snapshot: vi.fn(),
  buffer: vi.fn(),
  prepare: vi.fn(),
  origin: vi.fn(),
}))

vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  stat: io.stat,
}))
vi.mock('../metadata/parseAudioMetadata', () => ({ parseAudioMetadata: io.metadata }))
vi.mock('../metadata/audioTagWriteService', () => ({ prepareAudioTagWrite: io.prepare }))
vi.mock('./softTransition', () => ({ readMpvTimestampOrigin: io.origin }))
vi.mock('./tagAudioBuffer', async (original) => ({
  ...(await original<typeof import('./tagAudioBuffer')>()),
  createTagAudioSnapshot: io.snapshot,
  prepareTagAudioBuffer: io.buffer,
}))

const filePath = 'D:/isolated/buffered-lifecycle.flac'
const edit = {
  trackId: 1,
  title: 'Edited',
  artistDisplay: null,
  albumTitle: null,
  albumArtistDisplay: null,
  genreDisplay: null,
  year: null,
  releaseDate: null,
}
const gates: Array<() => void> = []
const harnesses: Array<{
  tags: BufferedTagPlayback
  runtime: NativePlaybackSession
  saves: Promise<unknown>[]
}> = []

function gate() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  gates.push(resolve)
  return { promise, resolve }
}

function snapshot(path: string): TagAudioSnapshot {
  return { path, dispose: vi.fn(async () => {}) }
}

function buffer(path: string, start = 4): TagAudioBuffer {
  return { ...snapshot(path), start, end: start + 8, rate: 48000, frames: 384000, origin: 0 }
}

async function setup() {
  const source = snapshot('D:/isolated/recovery.flac')
  const pcm = buffer('D:/isolated/bridge.wav')
  const prepared = {
    stagingPath: 'D:/isolated/staging.flac',
    assertUnchanged: vi.fn(async () => {}),
    commit: vi.fn(async (check: () => void) => {
      check()
    }),
    dispose: vi.fn(async () => {}),
  }
  io.snapshot.mockResolvedValue(source)
  io.buffer.mockResolvedValue(pcm)
  io.prepare.mockResolvedValue(prepared)
  const view = {
    trackId: 1,
    loaded: true,
    path: filePath,
    paused: false,
    currentTime: 0,
    duration: 30,
  }
  const decoder = { path: filePath, time: 0 }
  const client: MpvClient = {
    command: vi.fn(async (name: unknown, ...args: unknown[]) => {
      if (name === 'get_property') {
        if (args[0] === 'path') return decoder.path
        if (args[0] === 'time-pos' || args[0] === 'audio-pts') return decoder.time
        if (args[0] === 'playlist-pos') return 0
      }
      return undefined
    }),
    close: vi.fn(async () => {}),
  }
  const coordinator = new PlaybackFileCoordinator({
    getTrackFilePath: () => filePath,
    getTrackIdsByFilePath: () => [1],
    trackEditStateChanged: () => {},
  })
  const runtime = new NativePlaybackSession(coordinator)
  runtime.begin(1)
  runtime.client = client
  runtime.holdCurrentLease((await coordinator.acquireReadLease(filePath, 'mpv-current')).leaseId)
  const scheduling = {
    canBeginTagWrite: () => true,
    suspendPreparation: vi.fn(() => null),
    cancelNext: vi.fn(async () => {}),
    deferPrevious: vi.fn(),
    drainAnalysis: vi.fn(async () => {}),
    restoreDeferredNext: vi.fn(),
  }
  const warn = vi.fn()
  const failure = vi.fn()
  const resumeReaders = vi.fn()
  const tags = new BufferedTagPlayback(
    {
      mpvPath: 'mpv.exe',
      ffmpegPath: 'ffmpeg.exe',
      coordinator,
      warn,
      suspendFileReaders: async () => resumeReaders,
    },
    runtime,
    () => ({ ...view }),
    scheduling,
    (time) => {
      view.currentTime = time
    },
    failure,
  )
  coordinator.setBufferedWriteCapability((path) => tags.canWriteMetadata(path))
  await tags.refreshEligibility(filePath, 1, client)
  const saves: Promise<unknown>[] = []
  function save(reconcile: (commit: () => Promise<void>) => Promise<void> = (commit) => commit()) {
    const result = tags.writeMetadata(filePath, edit, reconcile)
    saves.push(result)
    return result
  }
  async function queued() {
    await vi.waitFor(() =>
      expect(client.command).toHaveBeenCalledWith('loadfile', pcm.path, 'append', -1, {}),
    )
  }
  async function loaded(path: string) {
    decoder.path = path
    expect(tags.onStartFile()).toBe(true)
    expect(await tags.handleFileLoaded(runtime.id, runtime.client!)).toBe(true)
  }
  const h = {
    source,
    pcm,
    prepared,
    view,
    decoder,
    client,
    coordinator,
    runtime,
    scheduling,
    warn,
    failure,
    resumeReaders,
    tags,
    saves,
    save,
    queued,
    loaded,
  }
  harnesses.push(h)
  return h
}

beforeEach(() => {
  vi.resetAllMocks()
  io.stat.mockResolvedValue({ size: 1000, mtimeMs: 1 })
  io.metadata.mockResolvedValue({ format: { sampleRate: 48000, numberOfChannels: 2 } })
  io.origin.mockResolvedValue(0)
})

afterEach(async () => {
  for (const resolve of gates.splice(0)) resolve()
  for (const h of harnesses.splice(0)) {
    h.tags.reset()
    await h.runtime.release()
    await Promise.allSettled(h.saves)
    await h.tags.cleanup()
  }
})

describe('buffered tag playback asynchronous ownership', () => {
  it('retains recovery audio when cancellation races a queued file load', async () => {
    const h = await setup()
    const result = h.save()
    await h.queued()
    expect(h.tags.onStartFile()).toBe(true)
    h.tags.cancelWrite()
    expect(await result).toEqual({ ok: false, reason: 'playback-changed' })
    expect(h.client.command).toHaveBeenCalledWith('loadfile', h.source.path, 'replace', -1, {
      start: '0',
      'hr-seek': 'yes',
      'hr-seek-demuxer-offset': '1',
    })
    expect(h.prepared.commit).not.toHaveBeenCalled()
    expect(h.source.dispose).not.toHaveBeenCalled()
    expect(h.pcm.dispose).not.toHaveBeenCalled()
    await h.loaded(h.source.path)
    await h.tags.cleanup()
    expect(h.tags.isActive()).toBe(false)
    expect(h.tags.fallbackPath).toBe(h.source.path)
    expect(h.source.dispose).not.toHaveBeenCalled()
    expect(h.pcm.dispose).toHaveBeenCalledTimes(1)
    expect(h.coordinator.getTrackState(1).status).toBe('playback-editable')
    expect(h.failure).not.toHaveBeenCalled()
  })

  it('does not retry a committed write when reconciliation fails', async () => {
    const h = await setup()
    const reconcile = vi.fn(async (commit: () => Promise<void>) => {
      await commit()
      throw new Error('catalog reconciliation failed')
    })
    const result = h.save(reconcile)
    await h.queued()
    await h.loaded(h.pcm.path)
    expect(await result).toEqual({ ok: false, reason: 'playback-restore-failed' })
    expect(reconcile).toHaveBeenCalledTimes(1)
    expect(h.prepared.commit).toHaveBeenCalledTimes(1)
    expect(h.prepared.dispose).toHaveBeenCalledTimes(1)
    expect(h.resumeReaders).toHaveBeenCalledTimes(1)
    expect(h.coordinator.getTrackState(1).status).toBe('playback-in-use')
    expect(h.source.dispose).not.toHaveBeenCalled()
    expect(h.pcm.dispose).not.toHaveBeenCalled()
  })

  it('reacquires the logical read lease if file-loaded finishes the window during staging disposal', async () => {
    const h = await setup()
    const disposing = gate()
    const release = gate()
    h.prepared.dispose.mockImplementation(async () => {
      disposing.resolve()
      await release.promise
    })
    const result = h.save(async (commit) => {
      await commit()
      throw new Error('catalog reconciliation failed')
    })
    await h.queued()
    await h.loaded(h.pcm.path)
    await disposing.promise
    expect(h.runtime.currentLeaseId).toBeNull()
    // A seek selects the recovery file while the original write is already in finally.
    await h.tags.seek(h.client, 2)
    await h.loaded(h.source.path)
    expect(h.tags.isActive()).toBe(false)
    release.resolve()
    expect(await result).toEqual({ ok: false, reason: 'playback-restore-failed' })
    expect(h.runtime.currentLeaseId).toMatch(/^lease_read_/)
    expect(h.coordinator.tryAcquireWriteLease(filePath)).toEqual({
      ok: false,
      reason: 'playback-in-use',
    })
    expect(h.tags.fallbackPath).toBe(h.source.path)
    expect(h.source.dispose).not.toHaveBeenCalled()
  })

  it('finishes an old save without closing the successor client or releasing its lease', async () => {
    const h = await setup()
    const preparing = gate()
    const release = gate()
    io.prepare.mockImplementation(async () => {
      preparing.resolve()
      await release.promise
      return h.prepared
    })
    const result = h.save()
    await preparing.promise
    h.tags.reset()
    await h.runtime.release()
    const successor: MpvClient = {
      command: vi.fn(async () => undefined),
      close: vi.fn(async () => {}),
    }
    h.runtime.begin(2)
    h.runtime.client = successor
    const lease = h.coordinator
      .acquireReadLease(filePath, 'mpv-current', h.runtime.signal)
      .then((value) => {
        h.runtime.holdCurrentLease(value.leaseId)
        return value.leaseId
      })
    release.resolve()
    expect(await result).toEqual({ ok: false, reason: 'playback-changed' })
    const successorLease = await lease
    expect(h.runtime.currentLeaseId).toBe(successorLease)
    expect(successor.close).not.toHaveBeenCalled()
    expect(successor.command).not.toHaveBeenCalled()
    expect(h.prepared.commit).not.toHaveBeenCalled()
    expect(h.source.dispose).toHaveBeenCalledTimes(1)
    expect(h.tags.isActive()).toBe(false)
    expect(h.tags.canReuseTransport).toBe(true)
    expect(h.failure).not.toHaveBeenCalled()
  })

  it('keeps the active snapshot through cleanup and releases it after the logical boundary', async () => {
    const h = await setup()
    const result = h.save()
    await h.queued()
    h.tags.onStartFile()
    h.tags.cancelWrite()
    await result
    await h.loaded(h.source.path)
    await h.tags.cleanup()
    await h.tags.cleanup()
    expect(h.source.dispose).not.toHaveBeenCalled()
    expect(h.pcm.dispose).toHaveBeenCalledTimes(1)
    expect(h.tags.canReuseTransport).toBe(false)
    h.tags.onLogicalBoundary()
    await h.tags.cleanup()
    expect(h.source.dispose).toHaveBeenCalledTimes(1)
    expect(h.tags.canReuseTransport).toBe(true)
  })

  it('disposes both missed buffers and fails after exactly two preparation attempts', async () => {
    const h = await setup()
    const first = buffer('D:/isolated/late-1.wav', 1)
    const second = buffer('D:/isolated/late-2.wav', 1)
    io.buffer.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    expect(await h.save()).toEqual({ ok: false, reason: 'buffer-preparation-failed' })
    expect(io.buffer).toHaveBeenCalledTimes(2)
    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(second.dispose).toHaveBeenCalledTimes(1)
    expect(h.source.dispose).toHaveBeenCalledTimes(1)
    expect(h.prepared.commit).not.toHaveBeenCalled()
    expect(vi.mocked(h.client.command).mock.calls.some(([name]) => name === 'loadfile')).toBe(false)
    expect(h.scheduling.restoreDeferredNext).toHaveBeenCalledTimes(1)
    expect(h.tags.canReuseTransport).toBe(true)
    expect(h.coordinator.getTrackState(1).status).toBe('playback-editable')
  })
})
