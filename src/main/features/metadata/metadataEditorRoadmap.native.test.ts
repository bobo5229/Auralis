import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../../database/schema'
import { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import { MetadataRefreshService } from './metadataRefreshService'
import { readStableMetadata } from './readStableMetadata'
import { createMetadataRefreshEvents } from '../../ipc/metadataRefreshEvents'
import { parseAudioMetadata } from './parseAudioMetadata'
import { normalizeMetadata } from './metadataNormalizer'
import sharp from 'sharp'
import { ArtworkCacheGarbageCollector } from '../artwork/artworkCacheGarbageCollector'
const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const ffmpeg = resolve('resources/audio/ffmpeg.exe')
const fixtures: Array<{ root: string; db: Database.Database; service: MetadataRefreshService }> = []
async function fixture(extension: string, codec: string) {
  const root = await mkdtemp(join(tmpdir(), 'auralis-editor-roadmap-'))
  const path = join(root, `song.${extension}`)
  execFileSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=duration=0.1',
      '-c:a',
      codec,
      '-metadata',
      'title=Title',
      '-metadata',
      'track=2/12',
      '-metadata',
      'disc=1/2',
      path,
    ],
    { windowsHide: true },
  )
  const db = new DatabaseCtor(':memory:')
  migrateDatabase(db)
  db.prepare('INSERT INTO tracks(id,file_path) VALUES(1,?)').run(path)
  const repository = new MetadataRefreshRepository(db)
  repository.updateTrackMetadata(await readStableMetadata(1, path, root))
  const service = new MetadataRefreshService(
    repository,
    root,
    createMetadataRefreshEvents(vi.fn()),
    ffmpeg,
  )
  fixtures.push({ root, db, service })
  return { root, path, db, repository, service }
}
afterEach(async () => {
  for (const { root, db, service } of fixtures.splice(0)) {
    await service.shutdown()
    db.close()
    if (!root.startsWith(join(tmpdir(), 'auralis-editor-roadmap-')))
      throw new Error('Unsafe fixture path')
    await rm(root, { recursive: true, force: true })
  }
})
describe('editor numbering and additional tags through the production save service', () => {
  it.each([
    ['flac', 'flac'],
    ['mp3', 'libmp3lame'],
    ['m4a', 'aac'],
    ['m4a', 'alac'],
    ['ogg', 'libvorbis'],
    ['opus', 'libopus'],
  ])(
    'round-trips pairs and extra tags in %s/%s',
    async (extension, codec) => {
      const f = await fixture(extension, codec)
      const snapshot = (await f.service.getTrackEditSnapshot(1))!
      expect(snapshot).toMatchObject({
        trackNo: 2,
        trackTotal: 12,
        discNo: 1,
        discTotal: 2,
        fileSummary: { format: extension.toUpperCase() },
      })
      const media = () =>
        execFileSync(
          ffmpeg,
          [
            '-v',
            'error',
            '-i',
            f.path,
            '-map',
            '0:a:0',
            '-c',
            'copy',
            '-f',
            'hash',
            '-hash',
            'sha256',
            '-',
          ],
          { windowsHide: true },
        ).toString()
      const before = media()
      for (const changes of [
        { trackNo: 3 },
        { trackNo: null },
        { trackNo: 4, trackTotal: null },
        { discTotal: 3 },
        { composer: 'First; Second', copyright: '© 2026 Example', isrc: 'USAAA2600001' },
        { composer: null, copyright: null, isrc: null },
      ]) {
        expect(
          await f.service.saveTrackMetadata({ trackId: 1, editToken: snapshot.editToken, changes }),
        ).toMatchObject({ ok: true })
        const actual = normalizeMetadata(await parseAudioMetadata(f.path)).fileTags
        for (const [key, value] of Object.entries(changes))
          expect(actual[key as keyof typeof actual]).toEqual(value)
      }
      const actual = (await f.service.getTrackEditSnapshot(1))!
      expect(actual).toMatchObject({
        trackNo: 4,
        trackTotal: null,
        discNo: 1,
        discTotal: 3,
        composer: null,
        copyright: null,
        isrc: null,
      })
      expect(f.db.prepare('SELECT track_total,disc_total FROM tracks WHERE id=1').get()).toEqual({
        track_total: null,
        disc_total: 3,
      })
      expect(media()).toBe(before)
    },
    20000,
  )
  it('rejects invalid pairs and unsupported MP3 date precision without changing the file', async () => {
    const f = await fixture('mp3', 'libmp3lame')
    const snapshot = (await f.service.getTrackEditSnapshot(1))!
    const before = await readFile(f.path)
    await expect(
      f.service.saveTrackMetadata({
        trackId: 1,
        editToken: snapshot.editToken,
        changes: { trackNo: 13 },
      }),
    ).rejects.toThrow('Number exceeds total')
    await expect(
      f.service.saveTrackMetadata({
        trackId: 1,
        editToken: snapshot.editToken,
        changes: { releaseDate: '2026-10' },
      }),
    ).rejects.toMatchObject({ reason: 'unsupported-date-precision' })
    expect(await readFile(f.path)).toEqual(before)
  })
  it('merges historical choices including null only after a verified write, and adopts file-only choices without a file write', async () => {
    const f = await fixture('flac', 'flac')
    f.db.exec(
      "UPDATE track_metadata SET title='Legacy',genre_display='Rock',source='legacy_user_edit',override_mask=127 WHERE track_id=1",
    )
    const snapshot = (await f.service.getTrackEditSnapshot(1))!
    expect(
      await f.service.saveTrackMetadata({
        trackId: 1,
        editToken: snapshot.editToken,
        legacyAction: 'apply-merged',
        changes: { title: null, genreDisplay: 'Rock' },
      }),
    ).toMatchObject({ ok: true })
    expect(normalizeMetadata(await parseAudioMetadata(f.path)).fileTags).toMatchObject({
      title: null,
      genreDisplay: 'Rock',
      trackNo: 2,
      trackTotal: 12,
    })
    expect(f.repository.getLegacyMetadata(1)).toBeNull()
    f.db.exec(
      "UPDATE track_metadata SET title='Other',source='legacy_user_edit',override_mask=127 WHERE track_id=1",
    )
    const second = (await f.service.getTrackEditSnapshot(1))!
    const before = await readFile(f.path)
    expect(
      await f.service.saveTrackMetadata({
        trackId: 1,
        editToken: second.editToken,
        legacyAction: 'apply-merged',
        changes: {},
      }),
    ).toMatchObject({ ok: true })
    expect(await readFile(f.path)).toEqual(before)
    expect(f.repository.getLegacyMetadata(1)).toBeNull()
  })
})

describe('selected embedded artwork through session-bound imports', () => {
  it.each(['adopt-file', 'apply-merged'] as const)(
    'releases artwork imports after database-only %s',
    async (action) => {
      const f = await fixture('flac', 'flac')
      f.db.exec(
        "UPDATE track_metadata SET title='Legacy',source='legacy_user_edit',override_mask=127 WHERE track_id=1",
      )
      const snapshot = (await f.service.getTrackEditSnapshot(1))!
      const image = join(f.root, 'adopt.png')
      await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } })
        .png()
        .toFile(image)
      const imported = await f.service.importMetadataArtwork(
        1,
        snapshot.editToken,
        async () => image,
      )
      expect(imported.ok).toBe(true)
      expect(f.service.hasActiveArtworkWrites()).toBe(true)
      const before = await readFile(f.path)
      expect(
        await f.service.saveTrackMetadata({
          trackId: 1,
          editToken: snapshot.editToken,
          legacyAction: action,
          changes: {},
        }),
      ).toMatchObject({ ok: true })
      expect(await readFile(f.path)).toEqual(before)
      expect(f.service.hasActiveArtworkWrites()).toBe(false)
      expect(f.repository.getLegacyMetadata(1)).toBeNull()
    },
  )

  it.each([
    ['flac', 'flac'],
    ['mp3', 'libmp3lame'],
    ['m4a', 'aac'],
    ['m4a', 'alac'],
  ])(
    'preserves unselected pictures and audio while adding, replacing and removing in %s/%s',
    async (extension, codec) => {
      const f = await fixture(extension, codec)
      const jpeg = join(f.root, 'new.jpg'),
        png = join(f.root, 'new.png'),
        replacement = join(f.root, 'replacement.png')
      await sharp({ create: { width: 12, height: 8, channels: 3, background: 'red' } })
        .jpeg()
        .toFile(jpeg)
      await sharp({ create: { width: 8, height: 12, channels: 3, background: 'blue' } })
        .png()
        .toFile(png)
      await sharp({ create: { width: 10, height: 10, channels: 3, background: 'green' } })
        .png()
        .toFile(replacement)
      const media = () =>
        execFileSync(
          ffmpeg,
          [
            '-v',
            'error',
            '-i',
            f.path,
            '-map',
            '0:a:0',
            '-c',
            'copy',
            '-f',
            'hash',
            '-hash',
            'sha256',
            '-',
          ],
          { windowsHide: true },
        ).toString()
      const originalMedia = media()
      async function load() {
        const snapshot = (await f.service.getTrackEditSnapshot(1))!
        const result = await f.service.getMetadataArtwork(1, snapshot.editToken)
        expect(result.ok).toBe(true)
        return snapshot
      }
      async function imported(token: string, path: string) {
        const result = await f.service.importMetadataArtwork(1, token, async () => path)
        if (!result.ok || !result.value) throw new Error('Import failed')
        return result.value.imageToken
      }
      let snapshot = await load()
      const first = await imported(snapshot.editToken, jpeg),
        second = await imported(snapshot.editToken, png)
      expect(
        await f.service.saveTrackMetadata({
          trackId: 1,
          editToken: snapshot.editToken,
          changes: { title: 'With pictures' },
          artworkChanges: [
            { kind: 'add', imageToken: first },
            { kind: 'add', imageToken: second },
          ],
        }),
      ).toMatchObject({ ok: true })
      let pictures = (await parseAudioMetadata(f.path)).common.picture!
      expect(pictures).toHaveLength(2)
      expect(Buffer.from(pictures[1]!.data)).toEqual(await readFile(png))
      const retained = pictures[1]
      snapshot = await load()
      const third = await imported(snapshot.editToken, replacement)
      expect(
        await f.service.saveTrackMetadata({
          trackId: 1,
          editToken: snapshot.editToken,
          changes: { genreDisplay: 'Live' },
          artworkChanges: [{ kind: 'replace', index: 0, imageToken: third }],
        }),
      ).toMatchObject({ ok: true })
      pictures = (await parseAudioMetadata(f.path)).common.picture!
      expect(pictures[1]).toEqual(retained)
      expect(Buffer.from(pictures[0]!.data)).toEqual(await readFile(replacement))
      snapshot = await load()
      expect(
        await f.service.saveTrackMetadata({
          trackId: 1,
          editToken: snapshot.editToken,
          changes: {},
          artworkChanges: [{ kind: 'remove', index: 0 }],
        }),
      ).toMatchObject({ ok: true })
      expect((await parseAudioMetadata(f.path)).common.picture).toEqual([retained])
      await sharp({ create: { width: 6, height: 6, channels: 3, background: 'yellow' } })
        .jpeg()
        .toFile(join(f.root, 'cover.jpg'))
      snapshot = await load()
      const hint = await f.service.getMetadataArtwork(1, snapshot.editToken)
      expect(hint).toMatchObject({ ok: true, value: { fallbackSource: 'directory' } })
      expect(
        await f.service.saveTrackMetadata({
          trackId: 1,
          editToken: snapshot.editToken,
          changes: {},
          artworkChanges: [{ kind: 'remove', index: 0 }],
        }),
      ).toMatchObject({ ok: true })
      expect((await parseAudioMetadata(f.path)).common.picture ?? []).toEqual([])
      expect(
        f.db
          .prepare(
            'SELECT embedded_artwork_cache_key,directory_artwork_cache_key FROM tracks WHERE id=1',
          )
          .get(),
      ).toMatchObject({
        embedded_artwork_cache_key: null,
        directory_artwork_cache_key: expect.any(String),
      })
      expect(media()).toBe(originalMedia)
    },
    20000,
  )
  it('rejects invalid images and tokens from another session without touching the audio', async () => {
    const f = await fixture('flac', 'flac'),
      image = join(f.root, 'test.png')
    await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } })
      .png()
      .toFile(image)
    const first = (await f.service.getTrackEditSnapshot(1))!
    const imported = await f.service.importMetadataArtwork(1, first.editToken, async () => image)
    if (!imported.ok || !imported.value) throw new Error('Import failed')
    expect(f.service.hasActiveArtworkWrites()).toBe(true)
    const gc = new ArtworkCacheGarbageCollector(f.db, f.root)
    await gc.collectGarbage(() => !f.service.hasActiveArtworkWrites())
    expect((await stat(join(f.root, imported.value.cacheKey))).isFile()).toBe(true)
    const second = (await f.service.getTrackEditSnapshot(1))!,
      before = await readFile(f.path)
    await expect(
      f.service.saveTrackMetadata({
        trackId: 1,
        editToken: second.editToken,
        changes: {},
        artworkChanges: [{ kind: 'add', imageToken: imported.value.imageToken }],
      }),
    ).rejects.toThrow('Artwork import expired')
    expect(await readFile(f.path)).toEqual(before)
    expect(await f.service.importMetadataArtwork(1, first.editToken, async () => f.path)).toEqual({
      ok: false,
      reason: 'invalid-image',
    })
    const oversized = join(f.root, 'too-large.png')
    await writeFile(oversized, Buffer.alloc(20 * 1024 * 1024 + 1))
    expect(
      await f.service.importMetadataArtwork(1, first.editToken, async () => oversized),
    ).toEqual({ ok: false, reason: 'image-too-large' })
    const pixels = join(f.root, 'too-many-pixels.png')
    await sharp({ create: { width: 8000, height: 5001, channels: 3, background: 'red' } })
      .png()
      .toFile(pixels)
    expect(await f.service.importMetadataArtwork(1, first.editToken, async () => pixels)).toEqual({
      ok: false,
      reason: 'image-too-large',
    })
    await f.service.releaseMetadataEdit(first.editToken)
    expect(await f.service.getMetadataArtwork(1, first.editToken)).toEqual({
      ok: false,
      reason: 'metadata-conflict',
    })
    expect(f.service.hasActiveArtworkWrites()).toBe(false)
    await gc.collectGarbage()
    await expect(stat(join(f.root, imported.value.cacheKey))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})
