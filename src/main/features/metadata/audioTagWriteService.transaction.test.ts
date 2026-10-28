import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, utimesSync, writeFileSync } from 'node:fs'
import {
  copyFile,
  link,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { prepareAudioTagWrite, writeAudioTags } from './audioTagWriteService'
import * as metadataParser from './parseAudioMetadata'
import { MetadataTagWriteCoordinator } from './metadataTagWriteCoordinator'
import type { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import { resolveLyrics } from './metadataNormalizer'

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>()
  return {
    ...actual,
    rename: vi.fn(actual.rename),
    link: vi.fn(actual.link),
    copyFile: vi.fn(actual.copyFile),
    rm: vi.fn(actual.rm),
  }
})
vi.mock('@main/logging/logger', () => ({ logger: { warn: vi.fn() } }))
const ffmpeg = resolve('resources/audio/ffmpeg.exe')
const edit = {
  trackId: 1,
  title: 'After',
  artistDisplay: null,
  albumTitle: null,
  albumArtistDisplay: null,
  genreDisplay: null,
  year: null,
  releaseDate: null,
}

function u32(value: number): Buffer {
  const bytes = Buffer.alloc(4)
  bytes.writeUInt32LE(value)
  return bytes
}

/** Add distinct native values, which FFmpeg's remux otherwise collapses. */
async function addComposerValues(path: string, values: string[]): Promise<void> {
  const bytes = await readFile(path)
  for (let offset = 4; offset < bytes.length; ) {
    const size = bytes.readUIntBE(offset + 1, 3)
    if ((bytes[offset]! & 127) === 4) {
      const body = bytes.subarray(offset + 4, offset + 4 + size)
      const vendorSize = body.readUInt32LE(0)
      const vendor = body.subarray(4, 4 + vendorSize)
      let cursor = 4 + vendorSize
      const count = body.readUInt32LE(cursor)
      cursor += 4
      const comments: Buffer[] = []
      for (let index = 0; index < count; index++) {
        const length = body.readUInt32LE(cursor)
        cursor += 4
        const comment = body.subarray(cursor, cursor + length)
        if (!comment.toString().startsWith('composer=')) comments.push(comment)
        cursor += length
      }
      comments.push(...values.map((value) => Buffer.from(`COMPOSER=${value}`)))
      const rebuilt = Buffer.concat([
        u32(vendor.length),
        vendor,
        u32(comments.length),
        ...comments.flatMap((comment) => [u32(comment.length), comment]),
      ])
      const header = Buffer.alloc(4)
      header[0] = bytes[offset]!
      header.writeUIntBE(rebuilt.length, 1, 3)
      await writeFile(
        path,
        Buffer.concat([
          bytes.subarray(0, offset),
          header,
          rebuilt,
          bytes.subarray(offset + 4 + size),
        ]),
      )
      return
    }
    offset += 4 + size
  }
  throw new Error('No Vorbis comment block in isolated fixture')
}

describe.skipIf(!existsSync(ffmpeg))('prepared tag file transactions on isolated music', () => {
  let directory: string, template: string, file: string
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'auralis-tag-transaction-'))
    template = join(directory, 'template.flac')
    execFileSync(
      ffmpeg,
      [
        '-nostdin',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=duration=1',
        '-metadata',
        'title=Before',
        '-metadata',
        'composer=Composer',
        template,
      ],
      { windowsHide: true },
    )
  })
  beforeEach(async () => {
    vi.mocked(rename)
      .mockReset()
      .mockImplementation(
        (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).rename,
      )
    vi.mocked(copyFile)
      .mockReset()
      .mockImplementation(
        (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).copyFile,
      )
    file = join(directory, `${Date.now()}-${Math.random()}.flac`)
    await copyFile(template, file)
    vi.mocked(copyFile).mockClear()
    vi.mocked(link)
      .mockReset()
      .mockImplementation(
        (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).link,
      )
    vi.mocked(rm).mockClear()
  })
  afterAll(async () => {
    if (
      !resolve(directory).startsWith(resolve(tmpdir()) + sep) ||
      !basename(directory).startsWith('auralis-tag-transaction-')
    )
      throw new Error('Unsafe test directory')
    await rm(directory, { recursive: true, force: true })
  })
  it('prepares a same-directory staging file without modifying the source, then commits once', async () => {
    const before = await readFile(file)
    const transaction = await prepareAudioTagWrite(file, edit, ffmpeg)
    try {
      expect((await readFile(file)).equals(before)).toBe(true)
      expect(transaction.stagingPath.startsWith(file + '.auralis-replacement-')).toBe(true)
      expect((await metadataParser.parseAudioMetadata(transaction.stagingPath)).common.title).toBe(
        'After',
      )
      await transaction.commit()
      expect((await metadataParser.parseAudioMetadata(file)).common.composer).toEqual(['Composer'])
      await expect(transaction.commit()).rejects.toThrow('already committed')
    } finally {
      await transaction.dispose()
    }
    expect((await readdir(directory)).some((name) => name.includes('auralis-'))).toBe(false)
  })
  it.each([
    ['flac', 'flac'],
    ['mp3', 'libmp3lame'],
    ['m4a', 'aac'],
    ['ogg', 'libvorbis'],
    ['opus', 'libopus'],
  ])('round-trips year, day and clear dates in %s', async (extension, codec) => {
    const target = join(directory, `dates-${extension}.${extension}`)
    execFileSync(ffmpeg, ['-nostdin', '-v', 'error', '-y', '-i', file, '-c:a', codec, target], {
      windowsHide: true,
    })
    for (const date of ['2024', '2024-02', '2024-02-29', null]) {
      if (extension === 'mp3' && date === '2024-02') {
        const before = await readFile(target)
        await expect(
          writeAudioTags(target, { ...edit, releaseDate: date, year: 1999 }, ffmpeg),
        ).rejects.toMatchObject({ reason: 'unsupported-date-precision' })
        expect(await readFile(target)).toEqual(before)
        continue
      }
      await writeAudioTags(target, { ...edit, releaseDate: date, year: 1999 }, ffmpeg)
      const result = await metadataParser.parseAudioMetadata(target)
      expect((await import('./metadataNormalizer')).resolveFileDate(result)).toBe(date)
    }
  })
  it.each([
    ['flac', 'flac'],
    ['mp3', 'libmp3lame'],
    ['m4a', 'aac'],
    ['ogg', 'libvorbis'],
    ['opus', 'libopus'],
  ])(
    'refuses to overwrite embedded TTML in %s before creating a staging file',
    async (extension, codec) => {
      const target = join(directory, `embedded-ttml.${extension}`)
      const ttml = '<tt xmlns="http://www.w3.org/ns/ttml"><body><p>Protected</p></body></tt>'
      execFileSync(
        ffmpeg,
        [
          '-nostdin',
          '-v',
          'error',
          '-y',
          '-i',
          file,
          '-c:a',
          codec,
          '-metadata',
          `lyrics=${ttml}`,
          target,
        ],
        { windowsHide: true },
      )
      const before = await readFile(target)
      await expect(
        prepareAudioTagWrite(target, { ...edit, lyricsText: '[00:01]New' }, ffmpeg),
      ).rejects.toMatchObject({ reason: 'tag-write-failed' })
      expect(await readFile(target)).toEqual(before)
      expect(
        (await readdir(directory)).some((name) =>
          name.startsWith(`embedded-ttml.${extension}.auralis-replacement-`),
        ),
      ).toBe(false)
    },
  )

  it('protects real ID3v2.2 ULT TTML when common lyrics are absent', async () => {
    const target = join(directory, 'legacy-ult.mp3')
    execFileSync(
      ffmpeg,
      [
        '-nostdin',
        '-v',
        'error',
        '-y',
        '-i',
        file,
        '-map_metadata',
        '-1',
        '-id3v2_version',
        '0',
        '-write_id3v1',
        '0',
        '-c:a',
        'libmp3lame',
        target,
      ],
      { windowsHide: true },
    )
    const ttml = '<tt xmlns="http://www.w3.org/ns/ttml"><body>Protected</body></tt>'
    const body = Buffer.concat([
      Buffer.from([0]),
      Buffer.from('eng'),
      Buffer.from([0]),
      Buffer.from(ttml, 'latin1'),
    ])
    const frame = Buffer.alloc(6)
    frame.write('ULT', 0, 'ascii')
    frame.writeUIntBE(body.length, 3, 3)
    const size = frame.length + body.length
    const header = Buffer.from([
      0x49,
      0x44,
      0x33,
      2,
      0,
      0,
      (size >> 21) & 0x7f,
      (size >> 14) & 0x7f,
      (size >> 7) & 0x7f,
      size & 0x7f,
    ])
    await writeFile(target, Buffer.concat([header, frame, body, await readFile(target)]))
    const before = await readFile(target)
    const parsed = await metadataParser.parseAudioMetadata(target)
    expect(parsed.native['ID3v2.2']).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'ULT' })]),
    )
    expect(parsed.common.lyrics).toBeUndefined()
    await expect(
      prepareAudioTagWrite(target, { ...edit, lyricsText: '[00:01]New' }, ffmpeg),
    ).rejects.toMatchObject({ reason: 'tag-write-failed' })
    expect(await readFile(target)).toEqual(before)
  })

  it('writes raw timed lyrics to FLAC without changing unrelated metadata or the original before commit', async () => {
    const before = await readFile(file)
    const lyrics = '\n [ar:Artist]\n[00:01.20]Line one\nUntimed line  \n\n'
    const transaction = await prepareAudioTagWrite(file, { ...edit, lyricsText: lyrics }, ffmpeg)
    try {
      expect(await readFile(file)).toEqual(before)
      const staged = await metadataParser.parseAudioMetadata(transaction.stagingPath)
      expect(staged.common.title).toBe('Before')
      expect(staged.common.composer).toEqual(['Composer'])
      expect(JSON.stringify(staged.common.lyrics)).toContain('Line one')
      expect(resolveLyrics(staged, true)?.text).toBe(lyrics)
      await transaction.commit()
      const saved = await metadataParser.parseAudioMetadata(file)
      expect(saved.common.title).toBe('Before')
      expect(resolveLyrics(saved, true)?.text).toBe(lyrics)
    } finally {
      await transaction.dispose()
    }
  })
  it.each([
    ['flac', 'flac'],
    ['mp3', 'libmp3lame'],
    ['m4a', 'aac'],
    ['ogg', 'libvorbis'],
    ['opus', 'libopus'],
  ])('retains raw lyric whitespace and supports clearing %s tags', async (extension, codec) => {
    const target = join(directory, `lyrics.${extension}`)
    execFileSync(ffmpeg, ['-nostdin', '-v', 'error', '-y', '-i', file, '-c:a', codec, target], {
      windowsHide: true,
    })
    for (const lyricsText of ['\n[00:01.20]你好  \r\nUntimed line\n\n', 'Plain text  \n', '']) {
      const before = await readFile(target)
      const transaction = await prepareAudioTagWrite(target, { ...edit, lyricsText }, ffmpeg)
      try {
        expect(await readFile(target)).toEqual(before)
        const staged = await metadataParser.parseAudioMetadata(transaction.stagingPath)
        expect(resolveLyrics(staged, true)?.text ?? '').toBe(lyricsText)
        expect(staged.common.title).toBe('Before')
        expect(staged.common.composer).toEqual(['Composer'])
        await transaction.commit()
        expect(
          resolveLyrics(await metadataParser.parseAudioMetadata(target), true)?.text ?? '',
        ).toBe(lyricsText)
      } finally {
        await transaction.dispose()
      }
    }
  })
  const expectFailedPreparationCleaned = async (before: Buffer) => {
    expect((await readFile(file)).equals(before)).toBe(true)
    expect(rename).not.toHaveBeenCalled()
    expect((await readdir(directory)).some((name) => name.includes('auralis-'))).toBe(false)
    const deleted = vi.mocked(rm).mock.calls.map(([path]) => String(path))
    expect(deleted.some((path) => basename(path).startsWith('auralis-tag-edit-'))).toBe(true)
    expect(deleted.some((path) => path.startsWith(file + '.auralis-replacement-'))).toBe(true)
    for (const path of deleted) expect(existsSync(path)).toBe(false)
  }
  it('rejects collapsed unedited composer values before replacing the original or committing the database', async () => {
    await addComposerValues(file, ['Composer One', 'Composer Two'])
    expect((await metadataParser.parseAudioMetadata(file)).common.composer).toEqual([
      'Composer One',
      'Composer Two',
    ])
    const before = await readFile(file)
    const repository = {
      getTrackFilePath: () => file,
      getEditableTrackMetadata: () => null,
      commitVerifiedUserEdit: vi.fn(),
    }
    const coordinator = {
      tryAcquireWriteLease: () => ({ ok: true as const, leaseId: 'write' }),
      releaseWriteLease: vi.fn(),
    }
    const writer = new MetadataTagWriteCoordinator(
      repository as unknown as MetadataRefreshRepository,
      join(directory, 'artwork'),
      ffmpeg,
      {
        isStopping: () => false,
        hasActiveJob: () => false,
        refreshTracksFromFileChanges: () => ({ jobId: 1 }),
      },
      coordinator,
    )
    await expect(writer.updateTrackMetadata(edit)).rejects.toThrow('did not preserve composer')
    expect(repository.commitVerifiedUserEdit).not.toHaveBeenCalled()
    expect(coordinator.releaseWriteLease).toHaveBeenCalledWith('write')
    await expectFailedPreparationCleaned(before)
  })
  it('rejects staging whose requested tags are incorrect before any original rename', async () => {
    const before = await readFile(file)
    const actualCopy = (
      await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    ).copyFile
    vi.mocked(copyFile).mockImplementationOnce(async (from, to) => {
      await actualCopy(from, to)
      await writeFile(to, before)
    })
    await expect(writeAudioTags(file, edit, ffmpeg)).rejects.toThrow(
      'do not match the requested edit',
    )
    await expectFailedPreparationCleaned(before)
  })
  it('reconciles a published edit even when removing its backup fails', async () => {
    const before = await readFile(file)
    const actualRm = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises'))
      .rm
    const repository = {
      getTrackFilePath: () => file,
      getEditableTrackMetadata: () => null,
      commitVerifiedUserEdit: vi.fn(),
    }
    const refreshTracksFromFileChanges = vi.fn(() => ({ jobId: 1 }))
    const onDiskCommit = vi.fn()
    const writer = new MetadataTagWriteCoordinator(
      repository as unknown as MetadataRefreshRepository,
      join(directory, 'artwork'),
      ffmpeg,
      {
        isStopping: () => false,
        hasActiveJob: () => false,
        refreshTracksFromFileChanges,
      },
    )
    vi.mocked(rm).mockImplementation(async (path, options) => {
      if (String(path).startsWith(file + '.auralis-backup-'))
        throw Object.assign(new Error('isolated backup cleanup failure'), { code: 'EACCES' })
      await actualRm(path, options)
    })
    try {
      await expect(writer.updateTrackMetadata(edit, undefined, onDiskCommit)).resolves.toEqual({
        ok: true,
      })
      expect(onDiskCommit).toHaveBeenCalledOnce()
      expect(repository.commitVerifiedUserEdit).toHaveBeenCalledWith(
        edit,
        expect.objectContaining({ title: 'After' }),
      )
      expect(refreshTracksFromFileChanges).not.toHaveBeenCalled()
      expect((await metadataParser.parseAudioMetadata(file)).common.title).toBe('After')
      const backup = (await readdir(directory)).find((name) =>
        name.startsWith(basename(file) + '.auralis-backup-'),
      )
      expect(backup).toBeDefined()
      expect(await readFile(join(directory, backup!))).toEqual(before)
      await actualRm(join(directory, backup!))
    } finally {
      vi.mocked(rm).mockImplementation(actualRm)
    }
  })

  it.each([
    ['mp3', 'libmp3lame'],
    ['m4a', 'aac'],
    ['flac', 'flac'],
    ['ogg', 'libvorbis'],
    ['opus', 'libopus'],
  ])(
    'saves ordinary %s tags while retaining unedited composer and track numbers',
    async (extension, codec) => {
      file = join(directory, `ordinary.${extension}`)
      execFileSync(
        ffmpeg,
        [
          '-nostdin',
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'sine=duration=0.1',
          '-c:a',
          codec,
          '-metadata',
          'title=Before',
          '-metadata',
          'composer=Composer',
          '-metadata',
          'track=2/9',
          file,
        ],
        { windowsHide: true },
      )
      const before = await metadataParser.parseAudioMetadata(file)
      await writeAudioTags(file, edit, ffmpeg)
      const after = await metadataParser.parseAudioMetadata(file)
      expect(after.common.title).toBe('After')
      expect(after.common.composer).toEqual(before.common.composer)
      expect(after.common.track).toEqual(before.common.track)
      expect((await readdir(directory)).some((name) => name.includes('auralis-'))).toBe(false)
    },
  )
  it('rejects an external mutation before the first rename', async () => {
    const transaction = await prepareAudioTagWrite(file, edit, ffmpeg)
    const changed = Buffer.concat([await readFile(file), Buffer.from('external change')])
    await writeFile(file, changed)
    try {
      await expect(transaction.commit()).rejects.toThrow('changed')
    } finally {
      await transaction.dispose()
    }
    expect(rename).not.toHaveBeenCalled()
    expect((await readFile(file)).equals(changed)).toBe(true)
  })
  it.each([
    ['flac', 'flac'],
    ['m4a', 'aac'],
  ])(
    'rejects a same-size external %s edit even when its modification time is preserved',
    async (extension, codec) => {
      file = join(directory, `external-same-mtime.${extension}`)
      execFileSync(ffmpeg, ['-nostdin', '-v', 'error', '-i', template, '-c:a', codec, file], {
        windowsHide: true,
      })
      const time = 1_600_000_000
      await utimes(file, time, time)
      const expected = await stat(file, { bigint: true })
      const transaction = await prepareAudioTagWrite(file, edit, ffmpeg)
      try {
        const bytes = await readFile(file)
        const offset = bytes.indexOf(Buffer.from('Composer'))
        expect(offset).toBeGreaterThan(-1)
        const handle = await open(file, 'r+')
        try {
          await handle.write(Buffer.from('Changed!'), 0, 8, offset)
          await handle.sync()
        } finally {
          await handle.close()
        }
        await utimes(file, time, time)
        const changed = await stat(file, { bigint: true })
        expect([changed.size, changed.mtimeNs, changed.ino, changed.dev]).toEqual([
          expected.size,
          expected.mtimeNs,
          expected.ino,
          expected.dev,
        ])
        expect(changed.ctimeNs).not.toBe(expected.ctimeNs)
        await expect(transaction.commit()).rejects.toMatchObject({ reason: 'file-changed' })
        expect((await metadataParser.parseAudioMetadata(file)).common.composer).toEqual([
          'Changed!',
        ])
      } finally {
        await transaction.dispose()
      }
    },
  )
  it('rejects an M4A edit made after the JavaScript guard at the native publication boundary', async () => {
    file = join(directory, 'native-ctime-guard.m4a')
    execFileSync(ffmpeg, ['-nostdin', '-v', 'error', '-i', template, '-c:a', 'aac', file], {
      windowsHide: true,
    })
    const time = 1_600_000_000
    await utimes(file, time, time)
    const expected = await stat(file, { bigint: true })
    const transaction = await prepareAudioTagWrite(file, edit, ffmpeg)
    const external = await readFile(file)
    const offset = external.indexOf(Buffer.from('Composer'))
    expect(offset).toBeGreaterThan(-1)
    Buffer.from('Changed!').copy(external, offset)
    try {
      await expect(
        transaction.commit(() => {
          writeFileSync(file, external)
          utimesSync(file, time, time)
        }),
      ).rejects.toMatchObject({ reason: 'file-changed' })
      const changed = await stat(file, { bigint: true })
      expect([changed.size, changed.mtimeNs, changed.ino, changed.dev]).toEqual([
        expected.size,
        expected.mtimeNs,
        expected.ino,
        expected.dev,
      ])
      expect(changed.ctimeNs).not.toBe(expected.ctimeNs)
      expect(await readFile(file)).toEqual(external)
    } finally {
      await transaction.dispose()
    }
  })
  it('preserves a same-size/mtime edit in the final source rename window', async () => {
    const time = 1_600_000_000
    await utimes(file, time, time)
    const transaction = await prepareAudioTagWrite(file, edit, ffmpeg)
    const external = await readFile(file)
    const offset = external.indexOf(Buffer.from('Composer'))
    expect(offset).toBeGreaterThan(-1)
    Buffer.from('Changed!').copy(external, offset)
    try {
      await expect(
        transaction.commit(() => {
          writeFileSync(file, external)
          utimesSync(file, time, time)
        }),
      ).rejects.toMatchObject({ reason: 'file-changed' })
      expect(await readFile(file)).toEqual(external)
      expect(
        (await readdir(directory)).some((name) =>
          name.startsWith(basename(file) + '.auralis-backup-'),
        ),
      ).toBe(false)
    } finally {
      await transaction.dispose()
    }
  })
  it('refuses a retained external write handle and allows a new save after it closes', async () => {
    const before = await readFile(file)
    const retained = await open(file, 'r+')
    const transaction = await prepareAudioTagWrite(file, edit, ffmpeg)
    try {
      await expect(transaction.commit()).rejects.toMatchObject({ reason: 'file-in-use' })
      expect(rename).not.toHaveBeenCalled()
      expect(await readFile(file)).toEqual(before)
    } finally {
      await retained.close()
      await transaction.dispose()
    }
    await writeAudioTags(file, edit, ffmpeg)
    expect((await metadataParser.parseAudioMetadata(file)).common.title).toBe('After')
  })
  it('blocks writers through an old hard-link alias until publication and cleanup finish', async () => {
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    const alias = file + '.external-alias'
    await actual.link(file, alias)
    const transaction = await prepareAudioTagWrite(file, edit, ffmpeg)
    let checked = false
    vi.mocked(link).mockImplementation(async (from, to) => {
      if (from === transaction.stagingPath && to === file) {
        const reader = await open(alias, 'r')
        await reader.close()
        await expect(open(alias, 'r+')).rejects.toThrow()
        checked = true
      }
      await actual.link(from, to)
    })
    try {
      await transaction.commit()
      expect(checked).toBe(true)
      const writer = await open(alias, 'r+')
      await writer.close()
      expect((await metadataParser.parseAudioMetadata(file)).common.title).toBe('After')
    } finally {
      await transaction.dispose()
      await rm(alias)
    }
  })
  it.each(['publish', 'rollback'] as const)(
    'preserves a file recreated at the original path during %s and retains the recovery copy',
    async (mode) => {
      const before = await readFile(file)
      const external = Buffer.from(before)
      const offset = external.indexOf(Buffer.from('Composer'))
      expect(offset).toBeGreaterThan(-1)
      Buffer.from('Changed!').copy(external, offset)
      const transaction = await prepareAudioTagWrite(file, edit, ffmpeg)
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      let backupPath: string | undefined
      vi.mocked(rename).mockImplementation(async (from, to) => {
        await actual.rename(from, to)
        if (from === file) {
          backupPath = String(to)
          await writeFile(file, external, { flag: 'wx' })
        }
      })
      if (mode === 'rollback')
        vi.mocked(link).mockImplementation(async (from, to) => {
          if (from === transaction.stagingPath && to === file)
            throw new Error('isolated publication failure')
          await actual.link(from, to)
        })
      try {
        if (mode === 'publish')
          await expect(transaction.commit()).rejects.toMatchObject({ reason: 'file-changed' })
        else await expect(transaction.commit()).rejects.toThrow('isolated publication failure')
        expect(await readFile(file)).toEqual(external)
        expect(backupPath).toBeDefined()
        expect(await readFile(backupPath!)).toEqual(before)
        expect((await metadataParser.parseAudioMetadata(file)).common.composer).toEqual([
          'Changed!',
        ])
        await rm(backupPath!)
      } finally {
        await transaction.dispose()
      }
    },
  )
  it('leaves the original intact when the filesystem cannot publish without overwriting', async () => {
    const before = await readFile(file)
    const transaction = await prepareAudioTagWrite(file, edit, ffmpeg)
    vi.mocked(link).mockRejectedValueOnce(
      Object.assign(new Error('links unsupported'), { code: 'EOPNOTSUPP' }),
    )
    try {
      await expect(transaction.commit()).rejects.toThrow('links unsupported')
    } finally {
      await transaction.dispose()
    }
    expect(rename).not.toHaveBeenCalled()
    expect(await readFile(file)).toEqual(before)
    expect(
      (await readdir(directory)).some((name) => name.startsWith(basename(file) + '.auralis-')),
    ).toBe(false)
  })
  it.each(['valid', 'invalid'] as const)(
    'rejects an external %s source replacement during tag verification',
    async (format) => {
      const before = await readFile(file)
      const changed =
        format === 'valid'
          ? Buffer.concat([before, Buffer.from('external change')])
          : Buffer.from('external replacement')
      const parse = metadataParser.parseAudioMetadata
      const spy = vi
        .spyOn(metadataParser, 'parseAudioMetadata')
        .mockImplementation(async (path) => {
          if (path === file) await writeFile(file, changed)
          return parse(path)
        })
      try {
        await expect(writeAudioTags(file, edit, ffmpeg)).rejects.toThrow(
          'Audio file changed during tag writing; original was not replaced',
        )
      } finally {
        spy.mockRestore()
      }
      await expectFailedPreparationCleaned(changed)
    },
  )
  it('can cancel immediately before the first rename', async () => {
    const before = await readFile(file)
    const transaction = await prepareAudioTagWrite(file, edit, ffmpeg)
    try {
      await expect(
        transaction.commit(() => {
          throw new Error('cancelled')
        }),
      ).rejects.toThrow('cancelled')
    } finally {
      await transaction.dispose()
    }
    expect(rename).not.toHaveBeenCalled()
    expect((await readFile(file)).equals(before)).toBe(true)
  })
  it.each([false, true])(
    'keeps the original bytes when replacement fails (rollback failure: %s)',
    async (rollbackFails) => {
      const before = await readFile(file)
      const transaction = await prepareAudioTagWrite(file, edit, ffmpeg)
      const actualLink = (
        await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      ).link
      vi.mocked(link).mockImplementation(async (from, to) => {
        if (to === file && (from === transaction.stagingPath || rollbackFails))
          throw new Error('isolated replacement failure')
        await actualLink(from, to)
      })
      try {
        await expect(transaction.commit()).rejects.toThrow('isolated replacement failure')
      } finally {
        await transaction.dispose()
      }
      const backup = (await readdir(directory)).find((name) =>
        name.startsWith(basename(file) + '.auralis-backup-'),
      )
      if (rollbackFails) {
        expect(backup).toBeDefined()
        expect((await readFile(join(directory, backup!))).equals(before)).toBe(true)
        await rm(join(directory, backup!))
      } else {
        expect(backup).toBeUndefined()
        expect((await readFile(file)).equals(before)).toBe(true)
      }
    },
  )
  it('leaves the original intact when staging runs out of disk space', async () => {
    const before = await readFile(file)
    vi.mocked(copyFile).mockRejectedValueOnce(
      Object.assign(new Error('No space'), { code: 'ENOSPC' }),
    )
    await expect(prepareAudioTagWrite(file, edit, ffmpeg)).rejects.toThrow('No space')
    expect((await readFile(file)).equals(before)).toBe(true)
    expect(rename).not.toHaveBeenCalled()
    expect((await readdir(directory)).some((name) => name.includes('auralis-replacement-'))).toBe(
      false,
    )
  })
})
