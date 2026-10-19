import { join } from 'node:path'
import { readFileSync } from 'node:fs'
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
const ttml = readFileSync(new URL('../metadata/__fixtures__/duet.ttml', import.meta.url), 'utf8')
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
        fileFingerprint: { size: 100, mtimeMs: 100, ctimeMs: 1, dev: 1, ino: 1 },
        fileMtimeMs: 100,
        album: 'Album',
        albumArtist: 'Artist',
        artworkCacheKey: `v2-${'a'.repeat(64)}.webp`,
        lyricsFormat: null,
        lyricsCheckedMtimeMs: 100,
        lyricsSidecarFingerprint: '[null,null,null,null]',
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
      if (candidate === filePath) return { size: 100, mtimeMs: 100, ctimeMs: 1, dev: 1, ino: 1 }
      if (sidecar && candidate.endsWith('.lrc')) return { ...sidecar, ctimeMs: 1, dev: 1, ino: 1 }
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
        harness.input.knownFiles[0].lyricsSidecarFingerprint = '[[10,10],null,null,null]'
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
            lyricsSidecarFingerprint: '[[20,200,1,1,1],null,null,null]',
          },
        ],
      })
      expect(messages.some((m) => m.type === 'tracks')).toBe(false)
    },
  )

  it.each([null, 'Embedded plain lyrics'])(
    'removes stale sidecar lyrics and restores embedded fallback: %s',
    async (embedded) => {
      harness.input.knownFiles[0].lyricsSidecarFingerprint = '[[10,10],null,null,null]'
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
            lyricsSidecarFingerprint: '[null,null,null,null]',
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
      payload: [{ lyricsSidecarFingerprint: '[null,null,null,null]' }],
    })
  })

  it('upgrades a size/mtime-only sidecar snapshot once, then skips the unchanged file', async () => {
    unchangedAudio({ size: 20, mtimeMs: 200, text: '[00:01]Lyrics' })
    harness.input.knownFiles[0].lyricsSidecarFingerprint = '[[20,200],null,null,null]'
    const messages = await scan()
    const patch = messages.find((message) => message.type === 'trackLyrics')
    if (patch?.type !== 'trackLyrics') throw new Error('Expected upgraded sidecar snapshot')
    expect(patch.payload[0].lyricsSidecarFingerprint).toBe('[[20,200,1,1,1],null,null,null]')
    harness.input.knownFiles[0].lyricsSidecarFingerprint = patch.payload[0].lyricsSidecarFingerprint
    vi.resetModules()
    harness.parseFile.mockClear()
    expect((await scan()).some((message) => message.type === 'trackLyrics')).toBe(false)
    expect(harness.parseFile).not.toHaveBeenCalled()
  })

  it('rejects a same-size/same-mtime sidecar replacement during the read', async () => {
    unchangedAudio({ size: 20, mtimeMs: 200, text: '[00:01]Old lyrics' })
    harness.readFile.mockImplementation(async (candidate: string) => {
      if (candidate.endsWith('.lrc')) {
        harness.stat.mockImplementation(async (path: string) => {
          if (path === filePath) return { size: 100, mtimeMs: 100, ctimeMs: 1, dev: 1, ino: 1 }
          if (path.endsWith('.lrc')) return { size: 20, mtimeMs: 200, ctimeMs: 1, dev: 1, ino: 2 }
          throw Object.assign(new Error('missing'), { code: 'ENOENT' })
        })
        return '[00:01]New lyrics'
      }
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })
    const messages = await scan()
    expect(messages.filter((message) => message.type === 'failure')).toHaveLength(1)
    expect(messages.some((message) => message.type === 'trackLyrics')).toBe(false)
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

describe('scan TTML sidecar invalidation', () => {
  function unchangedAudio(text: string | null) {
    harness.stat.mockImplementation(async (candidate: string) => {
      if (candidate === filePath) return { size: 100, mtimeMs: 100, ctimeMs: 1, dev: 1, ino: 1 }
      if (text !== null && candidate.endsWith('.ttml'))
        return { size: text.length, mtimeMs: 200, ctimeMs: 1, dev: 1, ino: 1 }
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })
    harness.readFile.mockImplementation(async (candidate: string) => {
      if (text !== null && candidate.endsWith('.ttml')) return text
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })
  }

  it.each(['added', 'modified'] as const)(
    'refreshes %s TTML for unchanged audio',
    async (change) => {
      if (change === 'modified')
        harness.input.knownFiles[0].lyricsSidecarFingerprint = '[null,null,[10,10],null]'
      unchangedAudio(ttml)
      const messages = await scan()
      expect(messages.find((message) => message.type === 'trackLyrics')).toMatchObject({
        payload: [
          {
            filePath,
            lyricsText: ttml,
            lyricsFormat: 'ttml',
            lyricsCheckedMtimeMs: 100,
            lyricsSidecarFingerprint: JSON.stringify([
              null,
              null,
              [ttml.length, 200, 1, 1, 1],
              null,
            ]),
          },
        ],
      })
      expect(messages.some((message) => message.type === 'tracks')).toBe(false)
    },
  )

  it('removes stale TTML and restores embedded LRC', async () => {
    harness.input.knownFiles[0].lyricsSidecarFingerprint = '[null,null,[10,10],null]'
    unchangedAudio(null)
    harness.parseFile.mockResolvedValue({
      ...metadata,
      native: { ID3v2: [{ id: 'SYLT', value: '[00:01]Embedded' }] },
    })
    expect((await scan()).find((message) => message.type === 'trackLyrics')).toMatchObject({
      payload: [
        {
          lyricsText: '[00:01]Embedded',
          lyricsFormat: 'lrc',
          lyricsSidecarFingerprint: '[null,null,null,null]',
        },
      ],
    })
  })

  it('backfills pre-TTML two-slot fingerprints, then skips unchanged TTML snapshots', async () => {
    unchangedAudio(ttml)
    harness.input.knownFiles[0].lyricsSidecarFingerprint = '[null,null]'
    expect((await scan()).some((message) => message.type === 'trackLyrics')).toBe(true)
    harness.input.knownFiles[0].lyricsSidecarFingerprint = JSON.stringify([
      null,
      null,
      [ttml.length, 200, 1, 1, 1],
      null,
    ])
    vi.resetModules()
    harness.parseFile.mockClear()
    expect((await scan()).some((message) => message.type === 'trackLyrics')).toBe(false)
    expect(harness.parseFile).not.toHaveBeenCalled()
  })

  it('does not commit a TTML snapshot that changed during reading', async () => {
    unchangedAudio(ttml)
    harness.readFile.mockImplementation(async (candidate: string) => {
      if (candidate.endsWith('.ttml')) {
        harness.stat.mockImplementation(async (path: string) => {
          if (path === filePath) return { size: 100, mtimeMs: 100, ctimeMs: 1, dev: 1, ino: 1 }
          if (path.endsWith('.ttml')) return { size: ttml.length + 1, mtimeMs: 300 }
          throw Object.assign(new Error('missing'), { code: 'ENOENT' })
        })
        return ttml
      }
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })
    const messages = await scan()
    expect(messages.filter((message) => message.type === 'failure')).toHaveLength(1)
    expect(
      messages.some((message) => message.type === 'tracks' || message.type === 'trackLyrics'),
    ).toBe(false)
  })
})

describe('scan parser version backfill', () => {
  it('retries an outdated version after failure and stops backfilling after persistence', async () => {
    harness.stat.mockImplementation(async (candidate: string) => {
      if (candidate === filePath) return { size: 100, mtimeMs: 100, ctimeMs: 1, dev: 1, ino: 1 }
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })
    harness.input.knownFiles[0].metadataParserVersion = 'outdated'
    harness.parseFile.mockRejectedValueOnce(new Error('EBUSY'))
    const failed = await scan()
    expect(failed.filter((m) => m.type === 'failure')).toHaveLength(1)
    expect(failed.some((m) => m.type === 'tracks' || m.type === 'trackTags')).toBe(false)
    expect(harness.input.knownFiles[0].metadataParserVersion).toBe('outdated')

    vi.resetModules()
    const retried = await scan()
    expect(retried.some((m) => m.type === 'tracks')).toBe(false)
    expect(retried.find((m) => m.type === 'trackTags')).toMatchObject({
      payload: [{ metadataParserVersion: getMetadataParserVersion(filePath) }],
    })
    expect(harness.parseFile).toHaveBeenCalledWith(filePath, { duration: false, skipCovers: true })
    // A worker result alone must not make an interrupted/uncommitted scan current.
    vi.resetModules()
    expect((await scan()).some((m) => m.type === 'trackTags')).toBe(true)
    harness.input.knownFiles[0].metadataParserVersion = getMetadataParserVersion(filePath)
    vi.resetModules()
    harness.parseFile.mockClear()
    const next = await scan()
    expect(next.some((m) => m.type === 'tracks' || m.type === 'trackTags')).toBe(false)
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

describe('unchanged metadata tag backfill', () => {
  it.each([320000, undefined])(
    'rereads tags for unchanged audio and does not write bitrate %s',
    async (bitrate) => {
      harness.stat.mockImplementation(async (candidate: string) => {
        if (candidate === filePath) return { size: 100, mtimeMs: 100, ctimeMs: 1, dev: 1, ino: 1 }
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      })
      harness.input.knownFiles[0].metadataCheckedMtimeMs = null
      harness.parseFile.mockResolvedValue({ ...metadata, format: { ...metadata.format, bitrate } })
      const messages = await scan()
      const tags = messages.find((m) => m.type === 'trackTags')
      expect(tags).toMatchObject({
        payload: [{ fileMtimeMs: 100, title: 'Updated title' }],
      })
      expect(tags?.type === 'trackTags' && tags.payload[0]).not.toHaveProperty('bitrateBps')
      expect(tags?.type === 'trackTags' && tags.payload[0]).not.toHaveProperty('durationSeconds')
      expect(harness.parseFile).toHaveBeenCalledWith(filePath, {
        duration: false,
        skipCovers: true,
      })
      expect(messages.some((m) => m.type === 'tracks')).toBe(false)
      // Recording the checked mtime is what stops the next reread, not a bitrate write.
      harness.input.knownFiles[0].metadataCheckedMtimeMs = 100
      harness.parseFile.mockClear()
      vi.resetModules()
      const next = await scan()
      expect(harness.parseFile).not.toHaveBeenCalled()
      expect(next.some((m) => m.type === 'tracks' || m.type === 'trackTags')).toBe(false)
    },
  )
})
