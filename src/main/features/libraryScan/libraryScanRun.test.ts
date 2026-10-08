import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IAudioMetadata } from 'music-metadata'
import { runLibraryScan } from './libraryScanRun'
import { LibraryScanArtwork, getScanAlbumKey } from './libraryScanArtwork'
import { LibraryScanTrackReader } from './libraryScanTrackReader'
import type { LibraryScanWorkerInput, LibraryScanWorkerMessage } from './libraryScanTypes'

const harness = vi.hoisted(() => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
  parseFile: vi.fn(),
  writeArtwork: vi.fn(),
  input: {} as LibraryScanWorkerInput,
  messages: [] as LibraryScanWorkerMessage[],
}))

vi.mock('node:fs/promises', () => ({
  readdir: harness.readdir,
  stat: harness.stat,
  readFile: harness.readFile,
}))
vi.mock('node:os', () => ({ cpus: () => Array.from({ length: 4 }, () => ({})) }))
vi.mock('music-metadata', () => ({ parseFile: harness.parseFile }))
vi.mock('../artwork/artworkCache', () => ({ writeArtworkToCache: harness.writeArtwork }))
vi.mock('node:worker_threads', () => ({
  get workerData() {
    return harness.input
  },
  parentPort: {
    postMessage: (message: LibraryScanWorkerMessage) => harness.messages.push(message),
  },
}))

const rootPath = 'C:\\IsolatedScan'
const currentKey = `v2-${'a'.repeat(64)}.webp`
const metadata: IAudioMetadata = {
  format: { duration: 180, trackInfo: [], tagTypes: [] },
  native: {},
  quality: { warnings: [] },
  common: {
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    albumartist: 'Artist',
    track: { no: 1, of: null },
    disk: { no: 1, of: null },
    movementIndex: { no: null, of: null },
  },
}

function entry(name: string, kind: 'file' | 'directory' | 'link' = 'file') {
  return {
    name,
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'directory',
  }
}

function knownFile(filePath: string): LibraryScanWorkerInput['knownFiles'][number] {
  return {
    filePath,
    fileSize: 100,
    fileMtimeMs: 100,
    album: 'Album',
    albumArtist: 'Artist',
    artworkCacheKey: null,
    lyricsFormat: null,
    lyricsCheckedMtimeMs: 100,
    lyricsSidecarFingerprint: '[null,null]',
    metadataCheckedMtimeMs: 100,
  }
}

function missing(): Error {
  return Object.assign(new Error('missing'), { code: 'ENOENT' })
}

async function scan(input = harness.input): Promise<LibraryScanWorkerMessage[]> {
  const messages: LibraryScanWorkerMessage[] = []
  await runLibraryScan(input, (message) => messages.push(message))
  return messages
}

beforeEach(() => {
  vi.resetAllMocks()
  harness.messages = []
  harness.input = { jobId: 7, rootPath, knownFiles: [], artworkCacheDir: 'C:\\IsolatedCache' }
  harness.readdir.mockResolvedValue([entry('song.flac')])
  harness.stat.mockImplementation(async (filePath: string) => {
    if (filePath.endsWith('.flac')) return { size: 100, mtimeMs: 100 }
    throw missing()
  })
  harness.readFile.mockRejectedValue(missing())
  harness.parseFile.mockResolvedValue(metadata)
  harness.writeArtwork.mockResolvedValue(currentKey)
})

describe('scan orchestration boundaries', () => {
  it('completes an empty inventory with forced progress and no empty batches', async () => {
    harness.readdir.mockResolvedValue([])
    const messages = await scan()
    expect(messages.map((message) => message.type)).toEqual([
      'progress',
      'progress',
      'progress',
      'complete',
    ])
    expect(messages.slice(0, 3).map((message) => message.payload)).toEqual([
      expect.objectContaining({
        totalFiles: 0,
        scannedFiles: 0,
        failedFiles: 0,
        message: 'Collecting audio files',
      }),
      expect.objectContaining({
        totalFiles: 0,
        scannedFiles: 0,
        failedFiles: 0,
        message: 'Scanning audio files',
      }),
      expect.objectContaining({
        totalFiles: 0,
        scannedFiles: 0,
        failedFiles: 0,
        message: 'Scan complete',
      }),
    ])
    expect(messages.at(-1)).toEqual({
      type: 'complete',
      payload: { foundFilePaths: [], unreadableDirectoryPaths: [] },
    })
  })

  it('reports an unreadable root as fatal through the thread entry, without completion', async () => {
    harness.readdir.mockRejectedValue(new Error('root denied'))
    await import('./libraryScanWorker')
    await vi.waitFor(() => expect(harness.messages.at(-1)?.type).toBe('fatal'))
    expect(harness.messages.at(-1)).toEqual({
      type: 'fatal',
      payload: { jobId: 7, reason: 'root denied' },
    })
    expect(harness.messages.some((message) => message.type === 'complete')).toBe(false)
  })

  it('preserves failed file inventory and unreadable subtree exclusions', async () => {
    const denied = join(rootPath, 'denied')
    const nested = join(rootPath, 'nested')
    const vanished = join(nested, 'vanished.flac')
    const broken = join(nested, 'broken.flac')
    const good = join(rootPath, 'song.flac')
    harness.readdir.mockImplementation(async (directory: string) => {
      if (directory === denied) throw new Error('denied')
      if (directory === nested) return [entry('vanished.flac'), entry('broken.flac')]
      return [
        entry('denied', 'directory'),
        entry('nested', 'directory'),
        entry('song.flac'),
        entry('notes.txt'),
        entry('alias.flac', 'link'),
      ]
    })
    harness.stat.mockImplementation(async (filePath: string) => {
      if (filePath === vanished) throw new Error('vanished')
      if (filePath.endsWith('.flac')) return { size: 100, mtimeMs: 100 }
      throw missing()
    })
    harness.parseFile.mockImplementation(async (filePath: string) => {
      if (filePath === broken) throw new Error('broken metadata')
      return metadata
    })
    const messages = await scan()
    expect(
      messages.filter((message) => message.type === 'failure').map((message) => message.payload),
    ).toEqual([
      { jobId: 7, filePath: denied, reason: 'Unable to read directory' },
      { jobId: 7, filePath: vanished, reason: 'vanished' },
      { jobId: 7, filePath: broken, reason: 'broken metadata' },
    ])
    expect(messages.at(-2)).toMatchObject({
      type: 'progress',
      payload: { totalFiles: 3, scannedFiles: 3, failedFiles: 3 },
    })
    expect(messages.at(-1)).toMatchObject({
      type: 'complete',
      payload: {
        foundFilePaths: expect.arrayContaining([vanished, broken, good]),
        unreadableDirectoryPaths: [denied],
      },
    })
    const tracks = messages
      .filter((message) => message.type === 'tracks')
      .flatMap((message) => message.payload)
    expect(tracks.map((track) => track.filePath)).toEqual([good])
  })

  it('bounds concurrent reads, refills a freed slot and awaits all reads before completion', async () => {
    harness.readdir.mockResolvedValue(
      Array.from({ length: 9 }, (_, index) => entry(`${index}.flac`)),
    )
    const pending = new Map<string, () => void>()
    let active = 0
    let maximum = 0
    let drain = false
    harness.parseFile.mockImplementation(async (filePath: string) => {
      active += 1
      maximum = Math.max(maximum, active)
      if (!drain) await new Promise<void>((resolve) => pending.set(filePath, resolve))
      active -= 1
      return metadata
    })
    const messages: LibraryScanWorkerMessage[] = []
    const running = runLibraryScan(harness.input, (message) => messages.push(message))
    try {
      await vi.waitFor(() => expect(harness.parseFile).toHaveBeenCalledTimes(4))
      expect(messages.some((message) => message.type === 'complete')).toBe(false)
      const firstFinished = join(rootPath, '2.flac')
      pending.get(firstFinished)!()
      pending.delete(firstFinished)
      await vi.waitFor(() => expect(harness.parseFile).toHaveBeenCalledTimes(5))
      expect(messages.some((message) => message.type === 'complete')).toBe(false)
      drain = true
      for (const resolve of pending.values()) resolve()
      await running
      expect(maximum).toBe(4)
      expect(active).toBe(0)
      expect(messages.at(-1)).toMatchObject({
        type: 'complete',
        payload: {
          foundFilePaths: [firstFinished, ...Array.from({ length: 8 }, () => expect.any(String))],
        },
      })
      const tracks = messages
        .filter((message) => message.type === 'tracks')
        .flatMap((message) => message.payload)
      expect(new Set(tracks.map((track) => track.filePath)).size).toBe(9)
    } finally {
      drain = true
      for (const resolve of pending.values()) resolve()
      await running
    }
  })

  it('emits detached batches at 300 tracks and flushes the final remainder before completion', async () => {
    const paths = Array.from({ length: 601 }, (_, index) => join(rootPath, `${index}.flac`))
    harness.readdir.mockResolvedValue(paths.map((_, index) => entry(`${index}.flac`)))
    const messages = await scan()
    const batches = messages.filter((message) => message.type === 'tracks')
    expect(batches.map((message) => message.payload.length)).toEqual([300, 300, 1])
    const emittedPaths = batches.flatMap((message) =>
      message.payload.map((track) => track.filePath),
    )
    expect(new Set(emittedPaths)).toEqual(new Set(paths))
    expect(messages.slice(-3).map((message) => message.type)).toEqual([
      'tracks',
      'progress',
      'complete',
    ])
    expect(messages.at(-2)).toMatchObject({
      payload: { totalFiles: 601, scannedFiles: 601, failedFiles: 0 },
    })
  })

  it('batches both lightweight patches and flushes artwork before lyrics at completion', async () => {
    const paths = Array.from({ length: 301 }, (_, index) => join(rootPath, `${index}.flac`))
    harness.readdir.mockResolvedValue(paths.map((_, index) => entry(`${index}.flac`)))
    harness.input.knownFiles = paths.map((filePath) => ({
      ...knownFile(filePath),
      lyricsCheckedMtimeMs: null,
    }))
    harness.readFile.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('cover.jpg')) return Buffer.from('directory cover')
      throw missing()
    })
    const messages = await scan()
    expect(
      messages
        .filter((message) => message.type === 'albumArtwork')
        .map((message) => message.payload.length),
    ).toEqual([300, 1])
    const lyricsBatches = messages.filter((message) => message.type === 'trackLyrics')
    expect(lyricsBatches.map((message) => message.payload.length)).toEqual([300, 1])
    expect(
      new Set(lyricsBatches.flatMap((message) => message.payload.map((patch) => patch.filePath))),
    ).toEqual(new Set(paths))
    expect(messages.slice(-4).map((message) => message.type)).toEqual([
      'albumArtwork',
      'trackLyrics',
      'progress',
      'complete',
    ])
    expect(messages.some((message) => message.type === 'tracks')).toBe(false)
    expect(
      harness.parseFile.mock.calls.every(
        ([, options]) => options.duration === false && options.skipCovers === true,
      ),
    ).toBe(true)
  })

  it('isolates artwork caches and counters across repeated runs of the same module', async () => {
    harness.readFile.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('cover.jpg')) return Buffer.from('directory cover')
      throw missing()
    })
    const first = await scan()
    harness.readFile.mockRejectedValue(missing())
    const second = await scan({ ...harness.input, jobId: 8 })
    expect(first.find((message) => message.type === 'tracks')).toMatchObject({
      payload: [{ artworkCacheKey: currentKey }],
    })
    expect(second.find((message) => message.type === 'tracks')).toMatchObject({
      payload: [{ artworkCacheKey: null }],
    })
    expect(second.at(-2)).toMatchObject({
      payload: { jobId: 8, totalFiles: 1, scannedFiles: 1, failedFiles: 0 },
    })
    expect(harness.parseFile.mock.calls.map(([, options]) => options)).toEqual([
      { duration: true, skipCovers: true },
      { duration: true },
    ])
  })

  it('fully backfills unchecked metadata even when audio, lyrics and artwork are unchanged', async () => {
    const filePath = join(rootPath, 'song.flac')
    harness.input.knownFiles = [
      { ...knownFile(filePath), artworkCacheKey: currentKey, metadataCheckedMtimeMs: null },
    ]
    const messages = await scan()
    expect(harness.parseFile).toHaveBeenCalledWith(filePath, { duration: true })
    expect(messages.find((message) => message.type === 'tracks')).toMatchObject({
      payload: [{ filePath, title: 'Song', fileMtimeMs: 100 }],
    })
    expect(messages.some((message) => message.type === 'trackLyrics')).toBe(false)
  })
})

describe('album cache backfill decisions', () => {
  it.each([
    { cached: currentKey, expectedKind: 'artwork', parses: false },
    { cached: null, expectedKind: 'skip', parses: false },
    { cached: 'legacy.jpg', expectedKind: 'patches', parses: true },
  ])('preserves the $cached cached artwork decision', async ({ cached, expectedKind, parses }) => {
    const filePath = join(rootPath, 'song.flac')
    const artwork = new LibraryScanArtwork(harness.input.artworkCacheDir)
    artwork.setAlbumArtwork(getScanAlbumKey('Album', 'Artist')!, cached)
    if (parses) {
      harness.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.endsWith('cover.jpg')) return Buffer.from('directory cover')
        throw missing()
      })
    }
    const failure = vi.fn()
    const reader = new LibraryScanTrackReader([knownFile(filePath)], artwork, failure)
    const result = await reader.read(filePath)
    expect(result.kind).toBe(expectedKind)
    expect(failure).not.toHaveBeenCalled()
    if (parses) {
      expect(harness.parseFile).toHaveBeenCalledWith(filePath, {
        duration: false,
        skipCovers: true,
      })
      expect(result).toMatchObject({
        artworkPatch: { artworkCacheKey: currentKey },
        lyricsPatch: null,
      })
    } else {
      expect(harness.parseFile).not.toHaveBeenCalled()
    }
  })
})
