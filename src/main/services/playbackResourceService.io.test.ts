import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlaybackResourceService } from './playbackResourceService'
import { probeAudioDecode } from '../features/audio/audioDecodeProbe'

const io = vi.hoisted(() => ({
  size: 100,
  stats: 0,
  streams: 0,
  parses: 0,
  leases: 0,
  releases: 0,
  gate: null as Promise<void> | null,
}))
vi.mock('electron', () => ({ protocol: {} }))
vi.mock('@main/logging/logger', () => ({ logger: { warn: vi.fn() } }))
vi.mock('node:fs/promises', () => ({
  stat: vi.fn(async () => {
    io.stats++
    return { isFile: () => true, size: io.size, mtimeMs: io.size }
  }),
}))
vi.mock('node:fs', () => ({
  createReadStream: vi.fn(() => {
    io.streams++
    return { destroy: vi.fn() }
  }),
}))
vi.mock('music-metadata', () => ({
  parseStream: vi.fn(async () => {
    io.parses++
    if (io.gate) await io.gate
    return { format: { duration: 3, numberOfChannels: 2, sampleRate: 48000 } }
  }),
}))

beforeEach(() => {
  Object.assign(io, {
    size: 100,
    stats: 0,
    streams: 0,
    parses: 0,
    leases: 0,
    releases: 0,
    gate: null,
  })
})

describe('playback resource probe I/O with controlled dependencies', () => {
  it('coalesces same-file concurrent probes while keeping a changed version separate', async () => {
    const filePath = resolve('isolated-concurrent-probe.wav')
    const initialParses = io.parses
    const initialStreams = io.streams
    let finish!: () => void
    io.gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    try {
      io.size = 111
      const old = Array.from({ length: 8 }, () => probeAudioDecode(filePath))
      await vi.waitFor(() => expect(io.parses).toBe(initialParses + 1))
      io.size = 222
      const current = Array.from({ length: 8 }, () => probeAudioDecode(filePath))
      await vi.waitFor(() => expect(io.parses).toBe(initialParses + 2))
      finish()
      expect(await Promise.all(old)).toEqual(Array(8).fill(null))
      const results = await Promise.all(current)
      expect(results.every((probe) => probe?.fileSize === 222)).toBe(true)
      expect(new Set(results).size).toBe(1)
      expect(io.streams - initialStreams).toBe(2)
      expect(await probeAudioDecode(filePath)).toBe(results[0])
      expect(io.parses - initialParses).toBe(2)
    } finally {
      finish()
      io.gate = null
      io.size = 100
    }
  })
  it('avoids headers for native paths and retains cold, cached and changed renderer probes', async () => {
    const root = resolve('isolated-io-count')
    const filePath = join(root, 'song.wav')
    const service = new PlaybackResourceService({
      tracks: { getFilePathById: () => filePath, markMissingByFilePaths: () => [] },
      getRootPaths: () => [root],
      files: {
        acquireReadLease: async () => {
          io.leases++
          return { leaseId: String(io.leases), version: 1 }
        },
        releaseReadLease: () => {
          io.releases++
        },
      },
      libraryChanged: () => {},
    })
    const counts = () => ({
      stats: io.stats,
      streams: io.streams,
      parses: io.parses,
      leases: io.leases,
      releases: io.releases,
    })
    await expect(service.resolveTrack(1)).resolves.toBe(filePath)
    await expect(service.resolveTrack(1)).resolves.toBe(filePath)
    expect(counts()).toEqual({ stats: 2, streams: 0, parses: 0, leases: 2, releases: 2 })
    const cold = await service.getAudioUrl(1)
    expect(cold?.decodeProbe?.fileSize).toBe(100)
    expect(counts()).toEqual({ stats: 5, streams: 1, parses: 1, leases: 3, releases: 3 })
    expect(await service.getAudioUrl(1)).toEqual(cold)
    expect(counts()).toEqual({ stats: 7, streams: 1, parses: 1, leases: 4, releases: 4 })
    io.size = 200
    expect((await service.getAudioUrl(1))?.decodeProbe?.fileSize).toBe(200)
    expect(counts()).toEqual({ stats: 10, streams: 2, parses: 2, leases: 5, releases: 5 })
    let finish!: () => void
    io.gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    io.size = 300
    const pending = service.getAudioUrl(1)
    await vi.waitFor(() => expect(io.parses).toBe(3))
    expect(io.leases).toBe(6)
    expect(io.releases).toBe(5)
    io.size = 400
    finish()
    expect((await pending)?.decodeProbe).toBeNull()
    expect(counts()).toEqual({ stats: 13, streams: 3, parses: 3, leases: 6, releases: 6 })
    io.gate = null
  })
})
