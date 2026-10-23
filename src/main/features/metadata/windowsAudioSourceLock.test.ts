import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { link, mkdtemp, open, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { lockWindowsAudioSource } from './windowsAudioSourceLock'
import { m4aPublicationHelper } from './windowsM4aPublication'

vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>()
  return { ...actual, execFile: vi.fn(actual.execFile) }
})

const ffmpeg = resolve('resources/audio/ffmpeg.exe')
describe.skipIf(process.platform !== 'win32' || !existsSync(m4aPublicationHelper(ffmpeg)))(
  'real Windows source lock lifetime',
  () => {
    let directory: string
    beforeAll(async () => {
      directory = await mkdtemp(join(tmpdir(), 'auralis-source-lock-'))
    })
    afterAll(async () => {
      if (
        resolve(dirname(directory)) !== resolve(tmpdir()) ||
        !basename(directory).startsWith('auralis-source-lock-')
      )
        throw new Error('Unsafe lock fixture cleanup')
      await rm(directory, { recursive: true, force: true })
    })
    async function fixture(name: string) {
      const file = join(directory, `${name}.flac`)
      const staging = file + '.auralis-replacement-test'
      await writeFile(file, 'isolated source bytes')
      await writeFile(staging, 'isolated staged bytes')
      return { file, staging, identity: await stat(file, { bigint: true }) }
    }
    it('allows readers, excludes writers by path and alias, and releases idempotently', async () => {
      const { file, staging } = await fixture('normal')
      const alias = file + '.alias'
      await link(file, alias)
      const lock = await lockWindowsAudioSource(
        file,
        staging,
        await stat(file, { bigint: true }),
        ffmpeg,
      )
      try {
        expect(lock.isHeld()).toBe(true)
        lock.assertHeld()
        expect(await readFile(file, 'utf8')).toBe('isolated source bytes')
        await expect(open(file, 'r+')).rejects.toThrow()
        await expect(open(alias, 'r+')).rejects.toThrow()
      } finally {
        await lock.release()
      }
      await lock.release()
      expect(lock.isHeld()).toBe(false)
      expect(() => lock.assertHeld()).toThrow('source lock was lost')
      const writer = await open(alias, 'r+')
      await writer.close()
    })
    it('refuses existing writers before reporting the lock ready', async () => {
      const { file, staging, identity } = await fixture('retained-writer')
      const retained = await open(file, 'r+')
      try {
        await expect(lockWindowsAudioSource(file, staging, identity, ffmpeg)).rejects.toMatchObject(
          { reason: 'file-in-use' },
        )
      } finally {
        await retained.close()
      }
      const lock = await lockWindowsAudioSource(file, staging, identity, ffmpeg)
      await lock.release()
    })
    it('detects a native ctime change with original size, inode and mtime', async () => {
      const { file, staging } = await fixture('same-mtime')
      const time = 1_600_000_000
      await utimes(file, time, time)
      const identity = await stat(file, { bigint: true })
      // Separate writes across the Windows filesystem clock tick in this tiny fixture.
      await delay(30)
      await writeFile(file, 'external source bytes')
      await utimes(file, time, time)
      const changed = await stat(file, { bigint: true })
      expect([changed.size, changed.ino, changed.mtimeNs]).toEqual([
        identity.size,
        identity.ino,
        identity.mtimeNs,
      ])
      expect(changed.ctimeNs).not.toBe(identity.ctimeNs)
      await expect(lockWindowsAudioSource(file, staging, identity, ffmpeg)).rejects.toMatchObject({
        reason: 'file-changed',
      })
      expect(await readFile(file, 'utf8')).toBe('external source bytes')
    })
    it('detects pipe closure and lets callers recover without leaving a helper behind', async () => {
      const { file, staging, identity } = await fixture('pipe-closed')
      const lock = await lockWindowsAudioSource(file, staging, identity, ffmpeg)
      const child = vi.mocked(execFile).mock.results.at(-1)!.value
      const closed = new Promise<void>((done) => child.once('close', () => done()))
      child.stdin!.end()
      await closed
      expect(lock.isHeld()).toBe(false)
      expect(() => lock.assertHeld()).toThrow('source lock was lost')
      await lock.release()
      const writer = await open(file, 'r+')
      await writer.close()
    })
    it('fails without a bundled runtime and leaves both files unchanged', async () => {
      const { file, staging, identity } = await fixture('missing-helper')
      await expect(
        lockWindowsAudioSource(file, staging, identity, join(directory, 'ffmpeg.exe')),
      ).rejects.toMatchObject({ reason: 'save-failed' })
      expect(await readFile(file, 'utf8')).toBe('isolated source bytes')
      expect(await readFile(staging, 'utf8')).toBe('isolated staged bytes')
    })
  },
)
