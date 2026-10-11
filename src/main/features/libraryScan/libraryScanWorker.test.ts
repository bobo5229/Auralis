import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IAudioMetadata } from 'music-metadata'
import type { LibraryScanWorkerInput, LibraryScanWorkerMessage } from './libraryScanTypes'
import { getMetadataParserVersion } from '../metadata/metadataParserVersion'

const harness = vi.hoisted(() => ({
  input: {} as LibraryScanWorkerInput,
  messages: [] as LibraryScanWorkerMessage[],
  parseFile: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock('node:worker_threads', () => ({
  get workerData() {
    return harness.input
  },
  parentPort: {
    postMessage: (message: LibraryScanWorkerMessage) => harness.messages.push(message),
  },
}))
vi.mock('node:fs/promises', () => ({
  readdir: async () => [{ name: 'song.flac', isDirectory: () => false, isFile: () => true }],
  stat: harness.stat,
  readFile: harness.readFile,
}))
vi.mock('music-metadata', () => ({ parseFile: harness.parseFile }))
vi.mock('../artwork/artworkCache', () => ({ writeArtworkToCache: vi.fn() }))

const filePath = join('C:\\Music', 'song.flac')
const metadata: IAudioMetadata = {
  format: { duration: 180, trackInfo: [], tagTypes: [] },
  native: {},
  quality: { warnings: [] },
  common: {
    title: 'Updated title',
    artist: 'Artist',
    album: 'Album',
    albumartist: 'Artist',
    track: { no: 1, of: null },
    disk: { no: 1, of: null },
    movementIndex: { no: null, of: null },
  },
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  harness.messages = []
  harness.input = {
    jobId: 1,
    rootPath: 'C:\\Music',
    artworkCacheDir: 'C:\\Cache',
    knownFiles: [
      {
        filePath,
        fileSize: 100,
        fileMtimeMs: 100,
        album: 'Album',
        albumArtist: 'Artist',
        artworkCacheKey: `v2-${'a'.repeat(64)}.webp`,
        lyricsFormat: null,
        lyricsCheckedMtimeMs: 100,
        lyricsSidecarFingerprint: '[null,null]',
        metadataCheckedMtimeMs: 100,
        metadataParserVersion: getMetadataParserVersion(filePath),
      },
    ],
  }
  harness.stat.mockImplementation(async (candidate: string) => {
    if (candidate === filePath) return { size: 200, mtimeMs: 200 }
    throw Object.assign(new Error('missing'), { code: 'ENOENT' })
  })
  harness.readFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
  harness.parseFile.mockResolvedValue(metadata)
})

async function scan(): Promise<LibraryScanWorkerMessage[]> {
  harness.messages = []
  await import('./libraryScanWorker')
  await vi.waitFor(() => expect(harness.messages.some((m) => m.type === 'complete')).toBe(true))
  return harness.messages
}

describe('scan metadata failure recovery', () => {
  it('leaves a new file unimported after a failed read and imports real tags on retry', async () => {
    harness.input.knownFiles = []
    harness.parseFile.mockRejectedValueOnce(new Error('EBUSY'))
    const failed = await scan()
    expect(failed.filter((m) => m.type === 'failure')).toHaveLength(1)
    expect(failed.some((m) => m.type === 'tracks' || m.type === 'trackLyrics')).toBe(false)
    vi.resetModules()
    const retried = await scan()
    expect(retried.find((m) => m.type === 'tracks')).toMatchObject({
      payload: [{ filePath, title: 'Updated title', artist: 'Artist', fileMtimeMs: 200 }],
    })
  })

  it('does not overwrite an existing changed file after a temporary parse failure, then retries', async () => {
    harness.parseFile.mockRejectedValueOnce(new Error('EBUSY'))
    const failed = await scan()
    expect(failed.filter((m) => m.type === 'failure')).toHaveLength(1)
    expect(failed.filter((m) => m.type === 'tracks' || m.type === 'trackLyrics')).toEqual([])
    expect(failed.at(-1)).toEqual({
      type: 'complete',
      payload: { foundFilePaths: [filePath], unreadableDirectoryPaths: [] },
    })

    // No replacement/fingerprint was emitted; the next scan receives the same old fingerprint.
    vi.resetModules()
    const retried = await scan()
    expect(harness.parseFile).toHaveBeenCalledTimes(2)
    expect(retried.find((m) => m.type === 'tracks')).toMatchObject({
      payload: [{ filePath, title: 'Updated title', fileSize: 200, fileMtimeMs: 200 }],
    })
  })
})

describe('scan sidecar invalidation', () => {
  function unchangedAudio(sidecar: { size: number; mtimeMs: number; text: string } | null) {
    harness.stat.mockImplementation(async (candidate: string) => {
      if (candidate === filePath) return { size: 100, mtimeMs: 100 }
      if (sidecar && candidate.endsWith('.lrc')) return sidecar
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })
    harness.readFile.mockImplementation(async (candidate: string) => {
      if (sidecar && candidate.endsWith('.lrc')) return sidecar.text
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })
  }

  it.each(['added', 'modified'] as const)(
    'refreshes %s sidecar lyrics without changing the audio fingerprint',
    async (change) => {
      if (change === 'modified')
        harness.input.knownFiles[0].lyricsSidecarFingerprint = '[[10,10],null]'
      unchangedAudio({ size: 20, mtimeMs: 200, text: '[00:01]New lyrics' })
      const messages = await scan()
      expect(harness.parseFile).toHaveBeenCalledWith(filePath, {
        duration: false,
        skipCovers: true,
      })
      expect(messages.find((m) => m.type === 'trackLyrics')).toMatchObject({
        payload: [
          {
            filePath,
            lyricsText: '[00:01]New lyrics',
            lyricsFormat: 'lrc',
            lyricsCheckedMtimeMs: 100,
            lyricsSidecarFingerprint: '[[20,200],null]',
          },
        ],
      })
      expect(messages.some((m) => m.type === 'tracks')).toBe(false)
    },
  )

  it.each([null, 'Embedded plain lyrics'])(
    'removes stale sidecar lyrics and restores embedded fallback: %s',
    async (embedded) => {
      harness.input.knownFiles[0].lyricsSidecarFingerprint = '[[10,10],null]'
      unchangedAudio(null)
      harness.parseFile.mockResolvedValue({
        ...metadata,
        native: embedded ? { ID3v2: [{ id: 'USLT', value: embedded }] } : {},
      })
      const messages = await scan()
      expect(messages.find((m) => m.type === 'trackLyrics')).toMatchObject({
        payload: [
          {
            lyricsText: embedded,
            lyricsFormat: embedded ? 'plain' : null,
            lyricsSidecarFingerprint: '[null,null]',
          },
        ],
      })
    },
  )

  it('keeps embedded timed lyrics ahead of a changed sidecar', async () => {
    unchangedAudio({ size: 20, mtimeMs: 200, text: '[00:01]Sidecar' })
    harness.parseFile.mockResolvedValue({
      ...metadata,
      native: { ID3v2: [{ id: 'SYLT', value: '[00:01]Embedded' }] },
    })
    const messages = await scan()
    expect(messages.find((m) => m.type === 'trackLyrics')).toMatchObject({
      payload: [{ lyricsText: '[00:01]Embedded' }],
    })
  })

  it('still skips audio parsing when both fingerprints are unchanged', async () => {
    unchangedAudio(null)
    const messages = await scan()
    expect(harness.parseFile).not.toHaveBeenCalled()
    expect(messages.some((m) => m.type === 'tracks' || m.type === 'trackLyrics')).toBe(false)
  })

  it('backfills old rows with no sidecar fingerprint once', async () => {
    unchangedAudio(null)
    harness.input.knownFiles[0].lyricsSidecarFingerprint = null
    const messages = await scan()
    expect(messages.find((m) => m.type === 'trackLyrics')).toMatchObject({
      payload: [{ lyricsSidecarFingerprint: '[null,null]' }],
    })
  })

  it('keeps the previous lyrics and fingerprint if a sidecar changes during the read', async () => {
    unchangedAudio({ size: 20, mtimeMs: 200, text: '[00:01]New lyrics' })
    harness.readFile.mockImplementation(async (candidate: string) => {
      if (candidate.endsWith('.lrc')) {
        harness.stat.mockResolvedValue({ size: 30, mtimeMs: 300 })
        return '[00:01]Changing lyrics'
      }
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })
    const messages = await scan()
    expect(messages.filter((m) => m.type === 'failure')).toHaveLength(1)
    expect(messages.some((m) => m.type === 'tracks' || m.type === 'trackLyrics')).toBe(false)
  })
})

describe('scan parser version backfill', () => {
  it('retries an outdated version after failure and stops backfilling after persistence', async () => {
    harness.stat.mockImplementation(async (candidate: string) => {
      if (candidate === filePath) return { size: 100, mtimeMs: 100 }
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })
    harness.input.knownFiles[0].metadataParserVersion = 'outdated'
    harness.parseFile.mockRejectedValueOnce(new Error('EBUSY'))
    const failed = await scan()
    expect(failed.filter((m) => m.type === 'failure')).toHaveLength(1)
    expect(failed.some((m) => m.type === 'tracks')).toBe(false)
    expect(harness.input.knownFiles[0].metadataParserVersion).toBe('outdated')

    vi.resetModules()
    const retried = await scan()
    expect(retried.find((m) => m.type === 'tracks')).toMatchObject({
      payload: [{ metadataParserVersion: getMetadataParserVersion(filePath) }],
    })
    // A worker result alone must not make an interrupted/uncommitted scan current.
    vi.resetModules()
    expect((await scan()).some((m) => m.type === 'tracks')).toBe(true)
    harness.input.knownFiles[0].metadataParserVersion = getMetadataParserVersion(filePath)
    vi.resetModules()
    harness.parseFile.mockClear()
    const next = await scan()
    expect(next.some((m) => m.type === 'tracks')).toBe(false)
    expect(harness.parseFile).not.toHaveBeenCalled()
  })

  it('does not mark a version checked when the audio changes during parsing', async () => {
    harness.parseFile.mockImplementationOnce(async () => {
      harness.stat.mockImplementation(async (candidate: string) => {
        if (candidate === filePath) return { size: 300, mtimeMs: 300 }
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      })
      return metadata
    })
    const failed = await scan()
    expect(failed.filter((m) => m.type === 'failure')).toHaveLength(1)
    expect(failed.some((m) => m.type === 'tracks')).toBe(false)
  })
})

describe('scan bitrate backfill', () => {
  it.each([320000, undefined])(
    'backfills unchanged audio with bitrate %s once',
    async (bitrate) => {
      harness.stat.mockImplementation(async (candidate: string) => {
        if (candidate === filePath) return { size: 100, mtimeMs: 100 }
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      })
      harness.input.knownFiles[0].metadataCheckedMtimeMs = null
      harness.parseFile.mockResolvedValue({ ...metadata, format: { ...metadata.format, bitrate } })
      const messages = await scan()
      expect(messages.find((m) => m.type === 'tracks')).toMatchObject({
        payload: [{ bitrateBps: bitrate ?? null, fileMtimeMs: 100 }],
      })
      // Successful persistence records the checked fingerprint even when bitrate is absent.
      harness.input.knownFiles[0].metadataCheckedMtimeMs = 100
      harness.parseFile.mockClear()
      vi.resetModules()
      const next = await scan()
      expect(harness.parseFile).not.toHaveBeenCalled()
      expect(next.some((m) => m.type === 'tracks')).toBe(false)
    },
  )
})
