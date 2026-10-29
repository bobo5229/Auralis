import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type Database from 'better-sqlite3'
import { expect, it, vi } from 'vitest'
import { migrateDatabase } from '../../database/schema'
import { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import { MetadataRefreshService } from './metadataRefreshService'
import { parseAudioMetadata } from './parseAudioMetadata'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
it('prepares 5000 actual files without evicting an interactive session, pins renamed targets, and safely cancels after real writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'auralis-editor-scale-'))
  const db = new DatabaseCtor(':memory:')
  let service: MetadataRefreshService | undefined
  let peakRss = process.memoryUsage().rss,
    lastTick = performance.now(),
    maximumLoopGap = 0
  const timer = setInterval(() => {
    const now = performance.now()
    maximumLoopGap = Math.max(maximumLoopGap, now - lastTick)
    lastTick = now
    peakRss = Math.max(peakRss, process.memoryUsage().rss)
  }, 25)
  try {
    migrateDatabase(db)
    const template = join(root, 'template.flac')
    execFileSync(
      resolve('resources/audio/ffmpeg.exe'),
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=duration=0.02',
        '-c:a',
        'flac',
        '-metadata',
        'title=Title',
        '-metadata',
        'album=Album',
        '-metadata',
        'artist=Artist',
        '-metadata',
        'album_artist=Artist',
        template,
      ],
      { windowsHide: true },
    )
    const paths = Array.from({ length: 5000 }, (_, index) => join(root, `track-${index + 1}.flac`))
    for (let offset = 0; offset < paths.length; offset += 16)
      await Promise.all(paths.slice(offset, offset + 16).map((path) => copyFile(template, path)))
    const insert = db.prepare(
      `INSERT INTO tracks(id,file_path,title,artist,album,album_artist,effective_album_title,effective_album_artist) VALUES(?,?,'Title','Artist',?,?,?,?)`,
    )
    db.transaction(() => {
      paths.forEach((path, index) =>
        insert.run(index + 1, path, 'Album', 'Artist', 'Album', 'Artist'),
      )
      insert.run(5001, template, 'Other', 'Artist', 'Other', 'Artist')
    })()
    const repository = new MetadataRefreshRepository(db)
    service = new MetadataRefreshService(
      repository,
      root,
      {
        libraryChanged: vi.fn(),
        refreshProgress: vi.fn(),
        albumEditProgress: (event) => {
          if (event.state === 'running' && event.processed === 3)
            service!.albumEdits.cancel(event.taskId)
        },
      },
      resolve('resources/audio/ffmpeg.exe'),
    )
    const interactive = (await service.getTrackEditSnapshot(5001))!
    const start = performance.now()
    expect(
      service.albumEdits.prepare({ album: { title: 'Album', artist: 'Artist' } }),
    ).toMatchObject({ ok: true })
    const task = () => {
      const result = service!.albumEdits.get()
      if (!result.ok || !result.task) throw new Error('Missing task')
      return result.task
    }
    await vi.waitFor(() => expect(task().state).toBe('ready'), { timeout: 120000, interval: 100 })
    const preparationMs = performance.now() - start,
      prepared = task()
    expect(prepared.items.map((item) => item.trackId)).toEqual(
      Array.from({ length: 5000 }, (_, index) => index + 1),
    )
    expect(
      await service.saveTrackMetadata({
        trackId: 5001,
        editToken: interactive.editToken,
        changes: { genreDisplay: 'Solo' },
      }),
    ).toMatchObject({ ok: true })
    expect(
      service.albumEdits.preview(
        prepared.taskId,
        {
          albumTitle: { mode: 'replace', value: 'Renamed' },
          genreDisplay: { mode: 'add', value: 'Live' },
        },
        false,
      ),
    ).toMatchObject({ ok: true })
    const executionStart = performance.now()
    service.albumEdits.start(prepared.taskId)
    await vi.waitFor(() => expect(task().state).toBe('cancelled'), {
      timeout: 120000,
      interval: 50,
    })
    const final = task(),
      executionMs = performance.now() - executionStart
    expect(final.items.filter((item) => item.status === 'succeeded')).toHaveLength(3)
    expect(final.items.filter((item) => item.status === 'unexecuted')).toHaveLength(4997)
    expect(final.total).toBe(5000)
    for (const path of paths.slice(0, 3))
      expect((await parseAudioMetadata(path)).common).toMatchObject({
        album: 'Renamed',
        genre: ['Live'],
      })
    for (const path of [paths[3]!, paths[4999]!])
      expect((await parseAudioMetadata(path)).common.album).toBe('Album')
    expect(await readFile(paths[3]!)).toEqual(await readFile(paths[4999]!))
    await mkdir('output/metadata-editor', { recursive: true })
    await writeFile(
      'output/metadata-editor/scale-5000.json',
      JSON.stringify(
        {
          runtime: process.versions,
          files: 5000,
          preparationMs,
          executionMs,
          peakRssMiB: peakRss / 1024 / 1024,
          maximumEventLoopGapMs: maximumLoopGap,
          written: 3,
          unexecuted: 4997,
          interactiveSessionRetained: true,
        },
        null,
        2,
      ),
    )
  } finally {
    clearInterval(timer)
    await service?.shutdown()
    db.close()
    if (!root.startsWith(join(tmpdir(), 'auralis-editor-scale-')))
      throw new Error('Unsafe scale fixture path')
    await rm(root, { recursive: true, force: true })
  }
}, 180000)
