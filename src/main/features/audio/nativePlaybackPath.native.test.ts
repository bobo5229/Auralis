import { createRequire } from 'node:module'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativePlaybackEvent } from '@shared/ipc/contracts'
import { migrateDatabase } from '../../database/schema'
import { TrackRepository } from '../../repositories/trackRepository'
import { LibraryScanTrackReader } from '../libraryScan/libraryScanTrackReader'
import { LibraryScanArtwork } from '../libraryScan/libraryScanArtwork'
import { collectAudioFiles } from '../libraryScan/libraryScanInventory'
import { parseAudioMetadata } from '../metadata/parseAudioMetadata'
import { NativePlaybackService } from './nativePlaybackService'
import { PlaybackFileCoordinator } from './playbackFileCoordinator'
import { normalizeAudioFilePath } from '@main/shared/normalizeAudioFilePath'
import { openMpvClient, type MpvClient } from './mpvClient'
import { createAudioProtocolHandler } from './audioProtocol'
import { isPathUnderRoot } from './audioPathGuard'
import { probeAudioDecode } from './audioDecodeProbe'

vi.mock('./mpvClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./mpvClient')>()
  return { ...actual, openMpvClient: vi.fn(actual.openMpvClient) }
})

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const ffmpegPath = resolve('resources/audio/ffmpeg.exe')
const mpvPath = resolve('resources/audio/mpv.exe')
const available = process.platform === 'win32' && existsSync(mpvPath) && existsSync(ffmpegPath)
const fixtures: { dir: string; db: Database.Database; service?: NativePlaybackService }[] = []

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function audio(path: string, title: string) {
  await promisify(execFile)(
    ffmpegPath,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      title === 'Original' ? 'sine=frequency=440:duration=8' : 'sine=frequency=880:duration=3',
      '-c:a',
      'flac',
      '-metadata',
      `title=${title}`,
      '-metadata',
      'artist=Artist',
      '-metadata',
      'album=Album',
      path,
    ],
    { windowsHide: true },
  )
}

async function fixture(rootAlias = false) {
  const dir = mkdtempSync(join(tmpdir(), 'auralis-playback-path-'))
  const db = new DatabaseCtor(':memory:')
  const owned = { dir, db, service: undefined as NativePlaybackService | undefined }
  fixtures.push(owned)
  const root = join(dir, 'library')
  const physical = join(dir, 'physical')
  if (rootAlias) {
    mkdirSync(physical)
    symlinkSync(physical, root, 'junction')
  } else mkdirSync(root)
  const oldPath = join(root, 'original.flac')
  const movedRoot = join(dir, 'moved-library')
  const newPath = rootAlias ? join(movedRoot, 'original.flac') : join(root, 'moved.flac')
  await audio(oldPath, 'Original')
  migrateDatabase(db)
  const tracks = new TrackRepository(db)
  const reader = new LibraryScanTrackReader(
    [],
    new LibraryScanArtwork(join(dir, 'artwork')),
    (_path, reason) => {
      throw new Error(reason)
    },
  )
  const importFile = async (path: string) => {
    const parsed = await reader.read(path)
    if (parsed.kind !== 'track') throw new Error('Expected FLAC')
    tracks.upsertMany([parsed.track])
    return tracks.getTrackIdsByFilePaths([path])[0]!
  }
  const id = await importFile(oldPath)
  const coordinator = new PlaybackFileCoordinator({
    getTrackFilePath: (id) => tracks.getFilePathById(id),
    getTrackIdsByFilePath: (path) => tracks.getTrackIdsByPlaybackPath(path),
    sendToRenderer: () => {},
  })
  // Retain the production probe/lease sequence; only transport timing is controlled.
  const resolveTrack = async (id: number) => {
    const path = tracks.getFilePathById(id)
    if (!path || !(isPathUnderRoot(path, root) || (rootAlias && isPathUnderRoot(path, movedRoot))))
      throw new Error('Unavailable')
    const probe = await coordinator.acquireReadLease(path, 'audio-probe')
    try {
      if (!statSync(path).isFile()) throw new Error('Unavailable')
      await probeAudioDecode(path)
    } finally {
      coordinator.releaseReadLease(probe.leaseId)
    }
    const current = tracks.getFilePathById(id)
    if (!current) throw new Error('Unavailable')
    return current
  }
  const events: NativePlaybackEvent[] = []
  const service = new NativePlaybackService({
    mpvPath,
    ffmpegPath,
    mpvArgs: ['--ao=null', '--pause=yes'],
    coordinator,
    resolveTrack,
    emit: (event) => events.push(event),
    warn: () => {},
  })
  owned.service = service
  const moveAndReuse = async () => {
    if (rootAlias) {
      renameSync(root, movedRoot)
      mkdirSync(root)
    } else renameSync(oldPath, newPath)
    const moved = await reader.read(newPath)
    if (moved.kind !== 'track') throw new Error('Expected moved FLAC')
    expect(tracks.relocateTrack(id, moved.track, oldPath)).toBe(true)
    await audio(oldPath, 'Different recording')
    const replacementId = await importFile(oldPath)
    expect(replacementId).not.toBe(id)
    expect((await parseAudioMetadata(oldPath)).common.title).toBe('Different recording')
    expect(tracks.getFilePathById(id)).toBe(newPath)
  }
  const start = (trackId = id, session = 1) =>
    service.command({
      action: 'start',
      session,
      trackId,
      volume: 0,
      muted: true,
    })
  return {
    dir,
    root,
    oldPath,
    newPath,
    tracks,
    id,
    importFile,
    coordinator,
    service,
    events,
    moveAndReuse,
    start,
  }
}

beforeEach(async () => {
  const actual = await vi.importActual<typeof import('./mpvClient')>('./mpvClient')
  vi.mocked(openMpvClient).mockReset().mockImplementation(actual.openMpvClient)
})

afterEach(async () => {
  try {
    for (const f of fixtures.splice(0)) {
      try {
        await f.service?.dispose()
      } finally {
        f.db.close()
        if (
          !resolve(f.dir).startsWith(resolve(tmpdir()) + sep) ||
          !f.dir.includes('auralis-playback-path-')
        )
          throw new Error('Unsafe test cleanup path')
        rmSync(f.dir, { recursive: true, force: true })
      }
    }
  } finally {
    vi.restoreAllMocks()
  }
})

describe.skipIf(!available)('native playback catalog paths (isolated FLAC and SQLite)', () => {
  it.each([
    ['ordinary path', false],
    ['root junction', true],
  ] as const)(
    'rejects a moved track before opening the reused path after real mpv startup (%s)',
    async (_label, rootAlias) => {
      const f = await fixture(rootAlias)
      expect(
        await collectAudioFiles(f.root, () => {
          throw new Error('Unexpected read failure')
        }),
      ).toContain(f.oldPath)
      const opening = deferred(),
        resume = deferred()
      const actual = await vi.importActual<typeof import('./mpvClient')>('./mpvClient')
      vi.mocked(openMpvClient).mockImplementationOnce(async (...args) => {
        opening.resolve()
        await resume.promise
        return actual.openMpvClient(...args)
      })
      const result = f.start().catch((error: Error) => error)
      try {
        await opening.promise
        await f.moveAndReuse()
      } finally {
        resume.resolve()
      }
      expect(await result).toEqual(new Error('Playback track path changed before loading'))
      expect(f.events.some((event) => event.kind === 'error')).toBe(true)
      const replacement = f.tracks.getTrackIdsByFilePaths([f.oldPath])[0]!
      await vi.waitFor(() => {
        expect(f.coordinator.getTrackState(f.id).status).toBe('editable')
        expect(f.coordinator.getTrackState(replacement).status).toBe('editable')
      })
      // A later explicit start resolves the new path and still loads the original recording.
      let client: MpvClient | undefined
      vi.mocked(openMpvClient).mockImplementationOnce(async (...args) => {
        client = await actual.openMpvClient(...args)
        return client
      })
      expect(await f.start(f.id, 2)).toEqual({ accepted: true })
      expect(
        normalizeAudioFilePath((await client!.command('get_property', 'path')) as string),
      ).toBe(normalizeAudioFilePath(f.newPath))
    },
  )

  it('rejects a moved binding after waiting for a real writer lease', async () => {
    const f = await fixture()
    const waiting = deferred()
    const acquire = f.coordinator.acquireReadLease.bind(f.coordinator)
    let writerId: string | undefined
    vi.spyOn(f.coordinator, 'acquireReadLease').mockImplementation((path, source, signal) => {
      if (source === 'mpv-current') {
        const writer = f.coordinator.tryAcquireWriteLease(path)
        if (!writer.ok) throw new Error('Expected writer lease')
        writerId = writer.leaseId
        const pending = acquire(path, source, signal)
        waiting.resolve()
        return pending
      }
      return acquire(path, source, signal)
    })
    const result = f.start().catch((error: Error) => error)
    try {
      await waiting.promise
      await f.moveAndReuse()
    } finally {
      if (writerId) f.coordinator.releaseWriteLease(writerId)
    }
    expect(await result).toEqual(new Error('Playback track path changed before loading'))
    await f.service.dispose()
    const write = f.coordinator.tryAcquireWriteLease(f.oldPath)
    expect(write.ok).toBe(true)
    if (write.ok) f.coordinator.releaseWriteLease(write.leaseId)
  })

  it.each(['start', 'next'] as const)(
    'checks the binding after the final queued %s command',
    async (action) => {
      const f = await fixture()
      const actual = await vi.importActual<typeof import('./mpvClient')>('./mpvClient')
      let client!: MpvClient
      vi.mocked(openMpvClient).mockImplementationOnce(async (...args) => {
        client = await actual.openMpvClient(...args)
        return client
      })
      const stablePath = join(f.root, 'current.flac')
      copyFileSync(f.oldPath, stablePath)
      const stableId = await f.importFile(stablePath)
      expect(await f.start(stableId)).toEqual({ accepted: true })
      const waiting = deferred(),
        resume = deferred()
      const command = client.command.bind(client)
      const calls: unknown[][] = []
      vi.spyOn(client, 'command').mockImplementation(async (...args) => {
        calls.push(args)
        const result = await command(...args)
        if (
          (action === 'start' && args[0] === 'set_property' && args[1] === 'mute') ||
          (action === 'next' && args[0] === 'playlist-clear')
        ) {
          waiting.resolve()
          await resume.promise
        }
        return result
      })
      const pending = (
        action === 'start'
          ? f.start(f.id, 2)
          : f.service.command({
              action: 'next',
              session: 1,
              trackId: f.id,
              trimDigitalSilence: false,
            })
      ).catch((error: Error) => error)
      try {
        await waiting.promise
        await f.moveAndReuse()
      } finally {
        resume.resolve()
      }
      if (action === 'start') {
        expect(await pending).toEqual(new Error('Playback track path changed before loading'))
        await f.service.dispose()
      } else {
        expect(await pending).toEqual({ accepted: false })
        expect(await command('get_property', 'path')).toBe(stablePath)
        expect(await command('get_property', 'playlist-count')).toBe(1)
        expect(f.events.filter((event) => event.kind === 'error')).toEqual([])
        const write = f.coordinator.tryAcquireWriteLease(f.oldPath)
        expect(write.ok).toBe(true)
        if (write.ok) f.coordinator.releaseWriteLease(write.leaseId)
      }
      expect(calls.filter(([name]) => name === 'loadfile')).toEqual([])
    },
  )

  it('starts real mpv normally when the catalog path remains current', async () => {
    const f = await fixture()
    const actual = await vi.importActual<typeof import('./mpvClient')>('./mpvClient')
    let client!: MpvClient
    vi.mocked(openMpvClient).mockImplementationOnce(async (...args) => {
      client = await actual.openMpvClient(...args)
      return client
    })
    expect(await f.start()).toEqual({ accepted: true })
    expect(await client.command('get_property', 'path')).toBe(f.oldPath)
  })

  it.each(['...And Justice.flac', '..Bonus/record.flac'])(
    'serves a scanned, imported dot-prefixed file: %s',
    async (name) => {
      const f = await fixture()
      const path = join(f.root, ...name.split('/'))
      if (name.includes('/')) mkdirSync(join(f.root, '..Bonus'))
      copyFileSync(f.oldPath, path)
      expect(
        await collectAudioFiles(f.root, () => {
          throw new Error('Unexpected read failure')
        }),
      ).toContain(path)
      const id = await f.importFile(path)
      const handler = createAudioProtocolHandler({
        getFilePathByTrackId: (id) => f.tracks.getFilePathById(id),
        getLibraryRootPaths: () => [f.root],
      })
      const response = await handler(new Request(`auralis-audio://track/${id}`))
      expect(response.status).toBe(200)
      expect((await response.arrayBuffer()).byteLength).toBe(statSync(path).size)
      expect(await f.start(id)).toEqual({ accepted: true })
    },
  )

  it('keeps ordinary protocol access and out-of-root rejection working', async () => {
    const f = await fixture()
    let path = f.oldPath
    const handler = createAudioProtocolHandler({
      getFilePathByTrackId: () => path,
      getLibraryRootPaths: () => [f.root],
    })
    const response = await handler(new Request(`auralis-audio://track/${f.id}`))
    expect(response.status).toBe(200)
    await response.arrayBuffer()
    path = join(f.dir, 'outside.flac')
    copyFileSync(f.oldPath, path)
    expect((await handler(new Request(`auralis-audio://track/${f.id}`))).status).toBe(403)
  })
})
