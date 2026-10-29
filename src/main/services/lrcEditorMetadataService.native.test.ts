import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { migrateDatabase } from '@main/database/schema'
import { TrackRepository } from '@main/repositories/trackRepository'
import { MetadataRefreshRepository } from '@main/repositories/metadataRefreshRepository'
import { PlaybackFileCoordinator } from '@main/features/audio/playbackFileCoordinator'
import { LrcEditorService } from '@main/features/lyrics/lrcEditorService'
import { MetadataRefreshService } from '@main/features/metadata/metadataRefreshService'
import { parseAudioMetadata } from '@main/features/metadata/parseAudioMetadata'
import { resolveLyricsForFile } from '@main/features/metadata/resolveLyricsForFile'
import { createMetadataRefreshEvents } from '@main/ipc/metadataRefreshEvents'
import { LrcEditorMetadataService } from './lrcEditorMetadataService'
import { PlaybackResourceService } from './playbackResourceService'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const ffmpeg = resolve('resources/audio/ffmpeg.exe')
const original = '[00:00.00]Original\n'
const updated = '[00:00.10]Updated\n'
let directory: string
let source: string
let db: Database.Database | undefined
let metadata: MetadataRefreshService | undefined
let editor: LrcEditorService
let tracks: TrackRepository
let resources: PlaybackResourceService
const send = vi.fn()

beforeEach(async () => {
  send.mockClear()
  directory = await mkdtemp(join(tmpdir(), 'auralis-ipc-service-extraction-'))
  source = join(directory, 'source.flac')
  await promisify(execFile)(
    ffmpeg,
    [
      '-nostdin',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=0.3',
      '-c:a',
      'flac',
      '-metadata',
      'title=Isolated',
      '-metadata',
      `lyrics=${original}`,
      source,
    ],
    { windowsHide: true },
  )
  expect(process.versions.electron).toBeTruthy()
  db = new DatabaseCtor(':memory:')
  expect(db.prepare('SELECT 1 AS value').get()).toEqual({ value: 1 })
  migrateDatabase(db)
  db.prepare(
    'INSERT INTO tracks (id, file_path, title, lyrics_text, lyrics_format) VALUES (1, ?, ?, ?, ?)',
  ).run(source, 'Isolated', original, 'lrc')
  tracks = new TrackRepository(db)
  const files = new PlaybackFileCoordinator({
    getTrackFilePath: (id) => tracks.getFilePathById(id),
    getTrackIdsByFilePath: (path) => tracks.getTrackIdsByPlaybackPath(path),
    trackEditStateChanged: (event) => send('metadata:track-edit-state-changed', event),
  })
  const events = createMetadataRefreshEvents(send)
  metadata = new MetadataRefreshService(
    new MetadataRefreshRepository(db),
    join(directory, 'artwork'),
    events,
    ffmpeg,
    files,
    () => tracks.getChangeToken(),
  )
  const lyrics = new LrcEditorMetadataService({
    tracks,
    metadata,
    files,
    libraryChanged: events.libraryChanged,
  })
  editor = new LrcEditorService({
    getFilePath: (id) => tracks.getFilePathById(id),
    getRoots: () => [directory],
    readSource: (path) => lyrics.readSource(path),
    writeTag: (id, text, check) => lyrics.writeTag(id, text, check),
    reconcile: (id, path, text) => lyrics.reconcile(id, path, text),
  })
  resources = new PlaybackResourceService({
    tracks,
    getRootPaths: () => [directory],
    files,
    libraryChanged: events.libraryChanged,
  })
})

afterEach(async () => {
  editor?.dispose()
  await metadata?.shutdown()
  metadata = undefined
  db?.close()
  db = undefined
  if (
    resolve(dirname(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('auralis-ipc-service-extraction-')
  )
    throw new Error('Unsafe isolated fixture cleanup')
  await rm(directory, { recursive: true, force: true })
})

it.each(['tag', 'file'] as const)(
  'preserves %s saves through the editor, extracted services, real metadata and Electron SQLite',
  async (target) => {
    const sidecar = join(directory, 'source.lrc')
    if (target === 'file') await writeFile(sidecar, original)
    const state = await editor.open(10, 1)
    expect(state.text).toBe(original)
    const saved = await editor.save(10, {
      sessionId: state.sessionId,
      expectedRevision: state.revision,
      text: updated,
      target,
    })
    expect(saved).toMatchObject({
      trackId: 1,
      cacheUpdated: true,
      active: target === 'tag',
      writeWarning: false,
    })
    // Embedded LRC retains priority over a saved LRC sidecar.
    const effectiveText = target === 'tag' ? updated : original
    expect(tracks.getLyricsByTrackId(1)?.lyricsText?.trim()).toBe(effectiveText.trim())
    const parsed = await parseAudioMetadata(source)
    expect((await resolveLyricsForFile(source, parsed))?.text.trim()).toBe(effectiveText.trim())
    if (target === 'file') {
      expect(await readFile(sidecar, 'utf8')).toBe(updated)
      expect(saved.backupPath).toBeTruthy()
      expect(await readFile(saved.backupPath!, 'utf8')).toBe(original)
    }
    expect(send).toHaveBeenCalledWith('library:changed', {
      reason: 'file-change',
      trackIds: [1],
      filePaths: [source],
    })
    await expect(resources.getAudioUrl(1)).resolves.toMatchObject({
      url: 'auralis-audio://track/1',
    })
    await expect(resources.resolveTrack(1)).resolves.toBe(source)
  },
  30_000,
)

it('protects embedded TTML while allowing an LRC sidecar on a real audio file', async () => {
  const ttml = '<tt xmlns="http://www.w3.org/ns/ttml"><body><p>Protected</p></body></tt>'
  const replacement = join(directory, 'with-ttml.flac')
  await promisify(execFile)(
    ffmpeg,
    [
      '-nostdin',
      '-v',
      'error',
      '-y',
      '-i',
      source,
      '-c:a',
      'copy',
      '-metadata',
      `lyrics=${ttml}`,
      replacement,
    ],
    { windowsHide: true },
  )
  await rename(replacement, source)
  const before = await readFile(source)
  const state = await editor.open(10, 1)
  expect(state).toMatchObject({ canSaveTag: false, tagWriteProtected: true, text: '' })
  const save = {
    sessionId: state.sessionId,
    expectedRevision: state.revision,
    text: updated,
    target: 'tag' as const,
  }
  await expect(editor.save(10, save)).rejects.toMatchObject({ code: 'unsupported-format' })
  expect(await readFile(source)).toEqual(before)
  await expect(editor.save(10, { ...save, target: 'file' })).resolves.toMatchObject({
    cacheUpdated: true,
  })
  expect(await readFile(join(directory, 'source.lrc'), 'utf8')).toBe(updated)
  expect(await readFile(source)).toEqual(before)
  expect(JSON.stringify((await parseAudioMetadata(source)).common.lyrics)).toContain('Protected')
}, 30_000)

const enhanced =
  '[ar:原始作者]\n[offset:25]\n[00:00.000]<00:00.000>我  <00:00.123>hear é 👩‍🎤<00:00.250>\n'

it.each([
  ['flac', 'flac'],
  ['mp3', 'libmp3lame'],
  ['m4a', 'aac'],
  ['ogg', 'libvorbis'],
  ['opus', 'libopus'],
])(
  'round-trips enhanced LRC in %s tags without changing decoded media or other tags',
  async (extension, codec) => {
    const target = join(directory, `enhanced.${extension}`)
    await promisify(execFile)(
      ffmpeg,
      [
        '-nostdin',
        '-v',
        'error',
        '-i',
        source,
        '-c:a',
        codec,
        '-metadata',
        'composer=Original Composer',
        '-metadata',
        'track=3/12',
        target,
      ],
      { windowsHide: true },
    )
    db!.prepare('UPDATE tracks SET file_path = ? WHERE id = 1').run(target)
    const decodeHash = async () => {
      const { stdout } = await promisify(execFile)(
        ffmpeg,
        ['-nostdin', '-v', 'error', '-i', target, '-f', 's16le', '-acodec', 'pcm_s16le', '-'],
        { windowsHide: true, encoding: 'buffer' },
      )
      return createHash('sha256').update(stdout).digest('hex')
    }
    const hashBefore = await decodeHash()
    const tagsBefore = (await parseAudioMetadata(target)).common
    const state = await editor.open(10, 1)
    await expect(
      editor.save(10, {
        sessionId: state.sessionId,
        expectedRevision: state.revision,
        text: enhanced,
        target: 'tag',
      }),
    ).resolves.toMatchObject({ cacheUpdated: true, active: true, writeWarning: false })
    const reopened = await editor.open(10, 1)
    expect(reopened.text).toBe(enhanced)
    const tagsAfter = (await parseAudioMetadata(target)).common
    expect(tagsAfter.title).toBe(tagsBefore.title)
    expect(tagsAfter.composer).toEqual(tagsBefore.composer)
    expect(tagsAfter.track).toEqual(tagsBefore.track)
    expect(await decodeHash()).toBe(hashBefore)
  },
  30_000,
)

it('keeps enhanced source text and the previous external LRC backup intact', async () => {
  const sidecar = join(directory, 'source.lrc')
  await writeFile(sidecar, original)
  const state = await editor.open(10, 1)
  const saved = await editor.save(10, {
    sessionId: state.sessionId,
    expectedRevision: state.revision,
    text: enhanced,
    target: 'file',
  })
  expect(saved).toMatchObject({ cacheUpdated: true, active: false })
  expect(await readFile(sidecar, 'utf8')).toBe(enhanced)
  expect(await readFile(saved.backupPath!, 'utf8')).toBe(original)
})

// The unified renderer preserves each draft and refreshes only the peer's credentials.
it.each(['metadata-first', 'lyrics-first'] as const)(
  'supports %s with fresh credentials through real tag writes',
  async (order) => {
    const initialMetadata = await metadata!.getTrackEditSnapshot(1)
    expect(initialMetadata).toBeTruthy()
    const initialLyrics = await editor.open(10, 1)
    const saveMetadata = async (token: string) =>
      metadata!.saveTrackMetadata({ trackId: 1, editToken: token, changes: { title: 'Renamed' } })
    const saveLyrics = async (state: typeof initialLyrics) =>
      editor.save(10, {
        sessionId: state.sessionId,
        expectedRevision: state.revision,
        text: updated,
        target: 'tag',
      })
    if (order === 'metadata-first') {
      await expect(saveMetadata(initialMetadata!.editToken)).resolves.toMatchObject({ ok: true })
      await expect(saveLyrics(initialLyrics)).rejects.toMatchObject({ code: 'file-changed' })
      const fresh = await editor.open(10, 1)
      expect(fresh.text).toBe(original)
      await expect(saveLyrics(fresh)).resolves.toMatchObject({ cacheUpdated: true })
    } else {
      await expect(saveLyrics(initialLyrics)).resolves.toMatchObject({ cacheUpdated: true })
      const fresh = await metadata!.getTrackEditSnapshot(1)
      expect(fresh?.title).toBe(initialMetadata!.title)
      await expect(saveMetadata(fresh!.editToken)).resolves.toMatchObject({ ok: true })
    }
    const parsed = await parseAudioMetadata(source)
    expect(parsed.common.title).toBe('Renamed')
    expect((await resolveLyricsForFile(source, parsed))?.text.trim()).toBe(updated.trim())
  },
  30_000,
)

it('refreshes credentials after sidecar saving without changing the resolved embedded lyrics', async () => {
  const first = await editor.open(10, 1)
  await editor.save(10, {
    sessionId: first.sessionId,
    expectedRevision: first.revision,
    text: updated,
    target: 'file',
  })
  const snapshot = await metadata!.getTrackEditSnapshot(1)
  await expect(
    metadata!.saveTrackMetadata({
      trackId: 1,
      editToken: snapshot!.editToken,
      changes: { title: 'Renamed' },
    }),
  ).resolves.toMatchObject({ ok: true })
  const refreshed = await editor.open(10, 1)
  expect(refreshed.text).toBe(original)
  expect(await readFile(join(directory, 'source.lrc'), 'utf8')).toBe(updated)
  await editor.save(10, {
    sessionId: refreshed.sessionId,
    expectedRevision: refreshed.revision,
    text: updated + '[00:00.20]Draft\n',
    target: 'file',
  })
  expect(await readFile(join(directory, 'source.lrc'), 'utf8')).toContain('Draft')
}, 30_000)
