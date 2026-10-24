import type { Stats } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { probeAudioDecode } from '@main/features/audio/audioDecodeProbe'
import { PlaybackResourceService } from './playbackResourceService'

vi.mock('electron', () => ({ protocol: {} }))
vi.mock('node:fs/promises', () => ({ stat: vi.fn() }))
vi.mock('@main/features/audio/audioDecodeProbe', () => ({ probeAudioDecode: vi.fn() }))
vi.mock('@main/logging/logger', () => ({ logger: { warn: vi.fn() } }))

const root = resolve('isolated-library')
const path = join(root, 'song.flac')
const probe = {
  fileSize: 100,
  fileMtimeMs: 200,
  durationSeconds: 3,
  numberOfChannels: 2,
  sampleRate: 48000,
}

function setup() {
  const dependencies = {
    tracks: {
      getFilePathById: vi.fn<() => string | null>(() => path),
      markMissingByFilePaths: vi.fn(() => [1, 2]),
    },
    getRootPaths: vi.fn(() => [root]),
    files: {
      acquireReadLease: vi.fn(async () => ({ leaseId: 'probe-lease', version: 1 })),
      releaseReadLease: vi.fn(),
    },
    libraryChanged: vi.fn(),
  }
  return { service: new PlaybackResourceService(dependencies), ...dependencies }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(stat).mockResolvedValue({ isFile: () => true } as Stats)
  vi.mocked(probeAudioDecode).mockResolvedValue(probe)
})

describe('playback resource resolution', () => {
  it('keeps the read lease until the decode probe completes', async () => {
    let finish!: (value: typeof probe) => void
    vi.mocked(probeAudioDecode).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const f = setup()
    const result = f.service.getAudioUrl(1)
    await vi.waitFor(() => expect(probeAudioDecode).toHaveBeenCalledWith(path))
    expect(f.files.acquireReadLease).toHaveBeenCalledWith(path, 'audio-probe')
    expect(f.files.releaseReadLease).not.toHaveBeenCalled()
    finish(probe)
    await expect(result).resolves.toEqual({
      url: 'auralis-audio://track/1',
      decodeProbe: probe,
    })
    expect(f.files.releaseReadLease).toHaveBeenCalledExactlyOnceWith('probe-lease')
    expect(f.libraryChanged).not.toHaveBeenCalled()
  })

  it.each([null, join(root, 'notes.txt'), resolve(root, '..', 'other-library', 'song.flac')])(
    'rejects an unavailable, unsupported or unauthorized path before file access: %s',
    async (filePath) => {
      const f = setup()
      f.tracks.getFilePathById.mockReturnValue(filePath)
      await expect(f.service.getAudioUrl(1)).resolves.toBeNull()
      expect(f.files.acquireReadLease).not.toHaveBeenCalled()
      expect(stat).not.toHaveBeenCalled()
      expect(f.tracks.markMissingByFilePaths).not.toHaveBeenCalled()
    },
  )

  it('checks the current roots for each request', async () => {
    const f = setup()
    await f.service.getAudioUrl(1)
    f.getRootPaths.mockReturnValue([])
    await expect(f.service.getAudioUrl(1)).resolves.toBeNull()
    expect(f.files.acquireReadLease).toHaveBeenCalledOnce()
  })

  it.each(['ENOENT', 'ENOTDIR'])(
    'marks missing tracks only for confirmed absence (%s)',
    async (code) => {
      vi.mocked(stat).mockRejectedValue(Object.assign(new Error('Unavailable'), { code }))
      const f = setup()
      await expect(f.service.getAudioUrl(1)).resolves.toBeNull()
      expect(f.tracks.markMissingByFilePaths).toHaveBeenCalledWith([path])
      expect(f.libraryChanged).toHaveBeenCalledExactlyOnceWith({
        reason: 'track-missing',
        trackIds: [1, 2],
        filePaths: [path],
      })
      expect(f.files.releaseReadLease).toHaveBeenCalledWith('probe-lease')
    },
  )

  it('treats a non-file as missing without probing it', async () => {
    vi.mocked(stat).mockResolvedValue({ isFile: () => false } as Stats)
    const f = setup()
    await expect(f.service.getAudioUrl(1)).resolves.toBeNull()
    expect(f.tracks.markMissingByFilePaths).toHaveBeenCalledWith([path])
    expect(probeAudioDecode).not.toHaveBeenCalled()
    expect(f.files.releaseReadLease).toHaveBeenCalledWith('probe-lease')
  })

  it('does not notify when no track was marked missing', async () => {
    vi.mocked(stat).mockRejectedValue(Object.assign(new Error('Missing'), { code: 'ENOENT' }))
    const f = setup()
    f.tracks.markMissingByFilePaths.mockReturnValue([])
    await f.service.getAudioUrl(1)
    expect(f.libraryChanged).not.toHaveBeenCalled()
  })

  it('releases the lease after an access failure without marking tracks missing', async () => {
    vi.mocked(stat).mockRejectedValue(Object.assign(new Error('Denied'), { code: 'EACCES' }))
    const f = setup()
    await expect(f.service.getAudioUrl(1)).resolves.toBeNull()
    expect(f.tracks.markMissingByFilePaths).not.toHaveBeenCalled()
    expect(f.files.releaseReadLease).toHaveBeenCalledWith('probe-lease')
  })

  it('retains an unknown decode probe as a playable resource', async () => {
    vi.mocked(probeAudioDecode).mockResolvedValue(null)
    await expect(setup().service.getAudioUrl(1)).resolves.toEqual({
      url: 'auralis-audio://track/1',
      decodeProbe: null,
    })
  })

  it('propagates lease acquisition failures without releasing an unowned lease', async () => {
    const f = setup()
    f.files.acquireReadLease.mockRejectedValue(new Error('Stopping'))
    await expect(f.service.getAudioUrl(1)).rejects.toThrow('Stopping')
    expect(stat).not.toHaveBeenCalled()
    expect(f.files.releaseReadLease).not.toHaveBeenCalled()
  })

  it('resolves the native track only after resource validation', async () => {
    const f = setup()
    await expect(f.service.resolveTrack(1)).resolves.toBe(path)
    expect(f.tracks.getFilePathById).toHaveBeenCalledTimes(2)
  })

  it('rejects a track removed between probing and native path resolution', async () => {
    const f = setup()
    f.tracks.getFilePathById.mockReturnValueOnce(path).mockReturnValueOnce(null)
    await expect(f.service.resolveTrack(1)).rejects.toThrow('Audio file is unavailable')
  })
})
