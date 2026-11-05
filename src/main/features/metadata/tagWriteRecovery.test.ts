import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const PENDING_LYRICS_BACKUP_MARKER = '.auralis-write-pending'
import { recoverTagWriteArtifacts, runTagWriteRecovery } from './tagWriteRecovery'

function makeWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'auralis-tag-recovery-'))
}

describe('tag write recovery', () => {
  it('restores a missing audio file from its retained backup and removes the backup', async () => {
    const root = makeWorkspace()
    try {
      const audio = join(root, 'song.mp3')
      const backup = `${audio}.auralis-backup-${randomUUID()}`
      writeFileSync(backup, 'original-bytes')
      const report = await recoverTagWriteArtifacts([root])
      expect(report.restored).toEqual([audio])
      expect(readFileSync(audio, 'utf8')).toBe('original-bytes')
      expect(() => statSync(backup)).toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps the backup when the public path exists again', async () => {
    const root = makeWorkspace()
    try {
      const audio = join(root, 'song.flac')
      writeFileSync(audio, 'published-content')
      const backup = `${audio}.auralis-backup-${randomUUID()}`
      writeFileSync(backup, 'previous-content')
      const report = await recoverTagWriteArtifacts([root])
      expect(report.restored).toEqual([])
      expect(report.retained).toEqual([{ path: backup, reason: 'original-exists' }])
      expect(readFileSync(audio, 'utf8')).toBe('published-content')
      expect(readFileSync(backup, 'utf8')).toBe('previous-content')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('restores a lyrics file from its backup directory and removes the directory', async () => {
    const root = makeWorkspace()
    try {
      const lyrics = join(root, 'song.lrc')
      const backupDirectory = mkdtempSync(join(root, 'song.lrc.auralis-backup-'))
      writeFileSync(join(backupDirectory, 'song.lrc'), 'old-lyrics')
      writeFileSync(join(backupDirectory, PENDING_LYRICS_BACKUP_MARKER), '')
      const report = await recoverTagWriteArtifacts([root])
      expect(report.restored).toEqual([lyrics])
      expect(readFileSync(lyrics, 'utf8')).toBe('old-lyrics')
      expect(() => statSync(backupDirectory)).toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('retains a backup directory whose content does not match the expected layout', async () => {
    const root = makeWorkspace()
    try {
      const unexpected = mkdtempSync(join(root, 'song.lrc.auralis-backup-'))
      writeFileSync(join(unexpected, 'other-name.lrc'), 'mystery')
      writeFileSync(join(unexpected, PENDING_LYRICS_BACKUP_MARKER), '')
      const report = await recoverTagWriteArtifacts([root])
      expect(report.restored).toEqual([])
      expect(report.retained).toEqual([{ path: unexpected, reason: 'unexpected-backup-content' }])
      expect(statSync(unexpected).isDirectory()).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('leaves historical lyrics backups alone when the current file is absent', async () => {
    const root = makeWorkspace()
    try {
      const backup = mkdtempSync(join(root, 'song.lrc.auralis-backup-'))
      const history = join(backup, 'song.lrc')
      writeFileSync(history, 'saved history')
      expect((await recoverTagWriteArtifacts([root])).restored).toEqual([])
      expect(() => statSync(join(root, 'song.lrc'))).toThrow()
      expect(readFileSync(history, 'utf8')).toBe('saved history')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('only visits tracked directories within active roots', async () => {
    const root = makeWorkspace()
    try {
      const active = join(root, 'active')
      const removed = join(root, 'active-old')
      mkdirSync(active)
      mkdirSync(removed)
      const current = join(active, 'song.mp3')
      const old = join(removed, 'song.mp3')
      writeFileSync(`${current}.auralis-backup-${randomUUID()}`, 'current')
      const oldBackup = `${old}.auralis-backup-${randomUUID()}`
      writeFileSync(oldBackup, 'old')
      const pending: string[] = []
      expect(
        await runTagWriteRecovery(
          [active],
          () => [current, old],
          (path) => {
            expect(() => statSync(path)).toThrow()
            pending.push(path)
          },
        ),
      ).toEqual([current])
      expect(pending).toEqual([current])
      expect(readFileSync(oldBackup, 'utf8')).toBe('old')
      expect(() => statSync(old)).toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('removes staging leftovers without touching unrelated files', async () => {
    const root = makeWorkspace()
    try {
      const audio = join(root, 'song.mp3')
      writeFileSync(audio, 'audio')
      const tagStaging = `${audio}.auralis-replacement-${randomUUID()}`
      const tagProbe = `${tagStaging}.probe`
      const lyricsStaging = `${audio}.auralis-lyrics-staging-${randomUUID()}`
      const lyricsProbe = `${lyricsStaging}.probe`
      const keep = join(root, 'cover.jpg')
      writeFileSync(tagStaging, 'staged')
      writeFileSync(tagProbe, 'staged-hard-link')
      writeFileSync(lyricsStaging, 'staged-lyrics')
      writeFileSync(lyricsProbe, 'probe')
      writeFileSync(keep, 'image')
      const report = await recoverTagWriteArtifacts([root])
      expect(report.removedStaging.sort()).toEqual(
        [lyricsProbe, lyricsStaging, tagProbe, tagStaging].sort(),
      )
      expect(readFileSync(audio, 'utf8')).toBe('audio')
      expect(readFileSync(keep, 'utf8')).toBe('image')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('skips links and only recovers explicitly given directories', async () => {
    const root = makeWorkspace()
    const nested = join(root, 'nested')
    mkdirSync(nested)
    try {
      const target = join(root, 'target-dir')
      mkdirSync(target)
      let linkCreated = false
      const link = join(root, `song.mp3.auralis-backup-${randomUUID()}`)
      try {
        symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
        linkCreated = true
      } catch {
        // Creating links requires privileges on some systems; the guard is then
        // exercised only by the lstat(null) branch.
      }
      const nestedBackup = `${join(nested, 'track.mp3')}.auralis-backup-${randomUUID()}`
      writeFileSync(nestedBackup, 'nested-original')
      const report = await recoverTagWriteArtifacts([root])
      expect(report.restored).toEqual([])
      if (linkCreated) expect(statSync(link).isDirectory()).toBe(true)
      // The nested directory is only recovered once it is passed explicitly.
      const nestedReport = await recoverTagWriteArtifacts([nested])
      expect(nestedReport.restored).toEqual([join(nested, 'track.mp3')])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
