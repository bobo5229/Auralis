import type { Stats } from 'node:fs'
import { stat } from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateTrackMetadataResult } from '@shared/ipc/contracts'
import { parseAudioMetadata } from '@main/features/metadata/parseAudioMetadata'
import {
  getLyricsSidecarFingerprint,
  resolveLyricsForFile,
} from '@main/features/metadata/resolveLyricsForFile'
import type { MetadataRefreshService } from '@main/features/metadata/metadataRefreshService'
import { logger } from '@main/logging/logger'
import { LrcEditorMetadataService } from './lrcEditorMetadataService'

vi.mock('node:fs/promises', () => ({ stat: vi.fn() }))
vi.mock('@main/features/metadata/parseAudioMetadata', () => ({ parseAudioMetadata: vi.fn() }))
vi.mock('@main/features/metadata/resolveLyricsForFile', () => ({
  getLyricsSidecarFingerprint: vi.fn(),
  resolveLyricsForFile: vi.fn(),
}))
vi.mock('@main/logging/logger', () => ({ logger: { warn: vi.fn() } }))

const path = 'isolated-song.flac'
const file = { size: 100, mtimeMs: 200 } as Stats

function setup() {
  const dependencies = {
    tracks: {
      getFilePathById: vi.fn<() => string | null>(() => path),
      patchLyrics: vi.fn(),
    },
    metadata: {
      updateTrackLyrics: vi.fn<MetadataRefreshService['updateTrackLyrics']>(async () => ({
        ok: true,
      })),
      refreshTracksFromFileChanges: vi.fn(() => ({ jobId: 2 })),
    },
    files: {
      acquireReadLease: vi.fn(async () => ({ leaseId: 'lyrics-lease', version: 1 })),
      releaseReadLease: vi.fn(),
    },
    libraryChanged: vi.fn(),
  }
  return { service: new LrcEditorMetadataService(dependencies), ...dependencies }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(stat).mockResolvedValue(file)
  vi.mocked(parseAudioMetadata).mockResolvedValue({
    format: { trackInfo: [], tagTypes: [] },
    native: {},
    quality: { warnings: [] },
    common: {
      track: { no: null, of: null },
      disk: { no: null, of: null },
      movementIndex: { no: null, of: null },
    },
  })
  vi.mocked(getLyricsSidecarFingerprint).mockResolvedValue('sidecar-baseline')
  vi.mocked(resolveLyricsForFile).mockResolvedValue({ text: '[00:01.00]New line\n', format: 'lrc' })
})

describe('LRC metadata reads and tag writes', () => {
  it('preserves source text and releases its read lease', async () => {
    const f = setup()
    await expect(f.service.readSource(path)).resolves.toEqual({
      lyricsText: '[00:01.00]New line\n',
      lyricsFormat: 'lrc',
    })
    expect(parseAudioMetadata).toHaveBeenCalledWith(path, { skipCovers: true, duration: false })
    expect(resolveLyricsForFile).toHaveBeenCalledWith(path, expect.anything(), true)
    expect(f.files.acquireReadLease).toHaveBeenCalledWith(path, 'lrc-editor')
    expect(f.files.releaseReadLease).toHaveBeenCalledWith('lyrics-lease')
  })

  it('flags embedded TTML while exposing a separately resolved LRC', async () => {
    const metadata = await vi.mocked(parseAudioMetadata)('test')
    metadata.native = {
      'ID3v2.3': [
        {
          id: 'USLT:description',
          value: { text: '<tt xmlns="http://www.w3.org/ns/ttml"><body/></tt>' },
        },
      ],
    }
    vi.mocked(parseAudioMetadata).mockResolvedValue(metadata)
    await expect(setup().service.readSource(path)).resolves.toMatchObject({
      lyricsText: '[00:01.00]New line\n',
      lyricsFormat: 'lrc',
      hasEmbeddedTtml: true,
    })
  })

  it('flags embedded TTML even when no playable source exists', async () => {
    const metadata = await vi.mocked(parseAudioMetadata)('test')
    metadata.common.lyrics = [
      '<tt xmlns="http://www.w3.org/ns/ttml"><body/></tt>',
    ] as unknown as typeof metadata.common.lyrics
    vi.mocked(parseAudioMetadata).mockResolvedValue(metadata)
    vi.mocked(resolveLyricsForFile).mockResolvedValue(null)
    await expect(setup().service.readSource(path)).resolves.toEqual({
      lyricsText: '',
      lyricsFormat: 'plain',
      hasEmbeddedTtml: true,
    })
  })

  it('returns null when there is no source lyric', async () => {
    vi.mocked(resolveLyricsForFile).mockResolvedValue(null)
    await expect(setup().service.readSource(path)).resolves.toBeNull()
  })

  it('releases the read lease when parsing fails', async () => {
    vi.mocked(parseAudioMetadata).mockRejectedValue(new Error('Unreadable'))
    const f = setup()
    await expect(f.service.readSource(path)).rejects.toThrow('Unreadable')
    expect(f.files.releaseReadLease).toHaveBeenCalledWith('lyrics-lease')
  })

  it('forwards the original pre-commit check to the metadata writer', async () => {
    const f = setup()
    const beforeCommit = vi.fn(async () => {})
    f.metadata.updateTrackLyrics.mockImplementation(async (_id, _text, check, committed) => {
      await check()
      committed()
      return { ok: true }
    })
    await expect(f.service.writeTag(1, 'New line', beforeCommit)).resolves.toEqual({
      warning: false,
    })
    expect(f.metadata.updateTrackLyrics).toHaveBeenCalledWith(
      1,
      'New line',
      beforeCommit,
      expect.any(Function),
    )
    expect(beforeCommit).toHaveBeenCalledOnce()
  })

  it.each([
    ['file-changed', 'file-changed'],
    ['file-not-found', 'file-changed'],
    ['write-in-progress', 'busy'],
    ['permission-denied', 'save-failed'],
  ] as const)('retains the %s to %s save error mapping', async (reason, expected) => {
    const f = setup()
    f.metadata.updateTrackLyrics.mockResolvedValue({ ok: false, reason })
    await expect(f.service.writeTag(1, 'New line', async () => {})).rejects.toMatchObject({
      code: expected,
    })
  })

  it.each(['throw', 'result'] as const)(
    'returns a warning for a committed write followed by %s failure',
    async (kind) => {
      const f = setup()
      f.metadata.updateTrackLyrics.mockImplementation(async (_id, _text, _check, committed) => {
        committed()
        if (kind === 'throw') throw new Error('Database unavailable after publication')
        return { ok: false, reason: 'save-failed' } satisfies UpdateTrackMetadataResult
      })
      await expect(f.service.writeTag(1, 'New line', async () => {})).resolves.toEqual({
        warning: true,
      })
    },
  )

  it('propagates failures before disk publication', async () => {
    const f = setup()
    const error = new Error('Not committed')
    f.metadata.updateTrackLyrics.mockRejectedValue(error)
    await expect(f.service.writeTag(1, 'New line', async () => {})).rejects.toBe(error)
  })
})

describe('LRC library reconciliation', () => {
  it('commits only a stable lyric snapshot and releases the lease before notification', async () => {
    const f = setup()
    await expect(f.service.reconcile(1, path, '  [00:01.00]New line ')).resolves.toEqual({
      cacheUpdated: true,
      active: true,
    })
    expect(f.files.acquireReadLease).toHaveBeenCalledWith(path, 'lrc-editor-reconcile')
    expect(f.tracks.patchLyrics).toHaveBeenCalledExactlyOnceWith([
      {
        filePath: path,
        lyricsText: '[00:01.00]New line\n',
        lyricsFormat: 'lrc',
        lyricsCheckedMtimeMs: 200,
        lyricsSidecarFingerprint: 'sidecar-baseline',
      },
    ])
    expect(f.libraryChanged).toHaveBeenCalledExactlyOnceWith({
      reason: 'file-change',
      trackIds: [1],
      filePaths: [path],
    })
    expect(f.files.releaseReadLease.mock.invocationCallOrder[0]).toBeLessThan(
      f.libraryChanged.mock.invocationCallOrder[0],
    )
    expect(f.metadata.refreshTracksFromFileChanges).not.toHaveBeenCalled()
  })

  it('reports saved text overridden by a higher priority lyric as inactive', async () => {
    await expect(setup().service.reconcile(1, path, 'Different text')).resolves.toEqual({
      cacheUpdated: true,
      active: false,
    })
  })

  it('clears cached lyrics when no source remains', async () => {
    vi.mocked(resolveLyricsForFile).mockResolvedValue(null)
    const f = setup()
    await expect(f.service.reconcile(1, path, 'Saved text')).resolves.toEqual({
      cacheUpdated: true,
      active: false,
    })
    expect(f.tracks.patchLyrics).toHaveBeenCalledWith([
      expect.objectContaining({ lyricsText: null, lyricsFormat: null }),
    ])
  })

  it.each(['size', 'mtime', 'sidecar', 'identity'] as const)(
    'does not commit a stale %s snapshot and requests fallback after notification',
    async (change) => {
      const f = setup()
      if (change === 'identity') f.tracks.getFilePathById.mockReturnValue('relocated.flac')
      else if (change === 'sidecar')
        vi.mocked(getLyricsSidecarFingerprint)
          .mockResolvedValueOnce('sidecar-baseline')
          .mockResolvedValueOnce('new-sidecar')
      else
        vi.mocked(stat)
          .mockResolvedValueOnce(file)
          .mockResolvedValueOnce({
            ...file,
            ...(change === 'size' ? { size: 101 } : { mtimeMs: 201 }),
          } as Stats)
      await expect(f.service.reconcile(1, path, 'New line')).resolves.toEqual({
        cacheUpdated: false,
        active: false,
      })
      expect(f.tracks.patchLyrics).not.toHaveBeenCalled()
      expect(f.files.releaseReadLease).toHaveBeenCalledWith('lyrics-lease')
      expect(f.metadata.refreshTracksFromFileChanges).toHaveBeenCalledExactlyOnceWith([1])
      expect(f.files.releaseReadLease.mock.invocationCallOrder[0]).toBeLessThan(
        f.libraryChanged.mock.invocationCallOrder[0],
      )
      expect(f.libraryChanged.mock.invocationCallOrder[0]).toBeLessThan(
        f.metadata.refreshTracksFromFileChanges.mock.invocationCallOrder[0],
      )
      if (change === 'identity') expect(parseAudioMetadata).not.toHaveBeenCalled()
    },
  )

  it.each(['read', 'database'] as const)(
    'keeps cleanup and fallback after a %s failure',
    async (phase) => {
      const f = setup()
      if (phase === 'read') vi.mocked(stat).mockRejectedValue(new Error('Unavailable'))
      else
        f.tracks.patchLyrics.mockImplementation(() => {
          throw new Error('Unavailable')
        })
      await expect(f.service.reconcile(1, path, 'New line')).rejects.toThrow('Unavailable')
      expect(f.files.releaseReadLease).toHaveBeenCalledWith('lyrics-lease')
      expect(f.libraryChanged).toHaveBeenCalledOnce()
      expect(f.metadata.refreshTracksFromFileChanges).toHaveBeenCalledWith([1])
    },
  )

  it('logs an unavailable fallback without replacing the reconciliation result', async () => {
    const f = setup()
    f.tracks.getFilePathById.mockReturnValue(null)
    f.metadata.refreshTracksFromFileChanges.mockImplementation(() => {
      throw new Error('Busy')
    })
    await expect(f.service.reconcile(1, path, 'New line')).resolves.toEqual({
      cacheUpdated: false,
      active: false,
    })
    expect(logger.warn).toHaveBeenCalledWith(
      { error: expect.any(Error), trackId: 1 },
      'LRC save requires cache reconciliation',
    )
  })

  it('does not reconcile or notify without a read lease', async () => {
    const f = setup()
    f.files.acquireReadLease.mockRejectedValue(new Error('Stopping'))
    await expect(f.service.reconcile(1, path, 'New line')).rejects.toThrow('Stopping')
    expect(f.files.releaseReadLease).not.toHaveBeenCalled()
    expect(f.libraryChanged).not.toHaveBeenCalled()
    expect(f.metadata.refreshTracksFromFileChanges).not.toHaveBeenCalled()
  })
})
