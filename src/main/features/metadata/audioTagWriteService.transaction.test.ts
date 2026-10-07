import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { prepareAudioTagWrite } from './audioTagWriteService'
import { parseAudioMetadata } from './parseAudioMetadata'

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>()
  return { ...actual, rename: vi.fn(actual.rename), copyFile: vi.fn(actual.copyFile) }
})
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
      expect((await parseAudioMetadata(transaction.stagingPath)).common.title).toBe('After')
      await transaction.commit()
      expect((await parseAudioMetadata(file)).common.composer).toEqual(['Composer'])
      await expect(transaction.commit()).rejects.toThrow('already committed')
    } finally {
      await transaction.dispose()
    }
    expect((await readdir(directory)).some((name) => name.includes('auralis-'))).toBe(false)
  })
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
      const actualRename = (
        await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      ).rename
      let calls = 0
      vi.mocked(rename).mockImplementation(async (from, to) => {
        calls++
        if (calls === 2 || (rollbackFails && calls === 3))
          throw new Error('isolated replacement failure')
        await actualRename(from, to)
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
