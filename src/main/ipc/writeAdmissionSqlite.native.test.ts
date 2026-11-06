import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type Database from 'better-sqlite3'
import type { IpcMainInvokeEvent } from 'electron'
import { expect, it, vi } from 'vitest'
import { migrateDatabase } from '@main/database/schema'
import { DatabaseWriteAdmission } from '@main/database/databaseWriteAdmission'
import { BadgeAchievementRepository } from '@main/repositories/badgeAchievementRepository'
import { PlaylistRepository } from '@main/repositories/playlistRepository'
import { SmartPlaylistRepository } from '@main/repositories/smartPlaylistRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { PlayStatsRepository } from '@main/repositories/playStatsRepository'
import { PlaylistService } from '@main/services/playlistService'
import { SmartPlaylistService } from '@main/services/smartPlaylistService'
import { PlayStatsService } from '@main/services/playStatsService'
import { resetListeningHistory } from '@main/services/resetListeningHistory'
import { ipcChannels } from '@shared/ipc/channels'
import { createValidatedIpcRegistrar } from './validatedIpcRegistrar'
import { createWriteAdmissionRegistrar } from './writeAdmissionRegistrar'
import { registerBadgeAchievementIpcHandlers } from './registerBadgeAchievementIpcHandlers'
import { registerPlaylistIpcHandlers } from './registerPlaylistIpcHandlers'
import { registerPlaybackArchiveIpcHandlers } from './registerPlaybackArchiveIpcHandlers'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database

it('queues a real badge IPC write behind a real SQLite writer without blocking reads', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'auralis-admission-lock-'))
  const path = join(directory, 'isolated.sqlite')
  const db = new DatabaseCtor(path, { timeout: 10 })
  let other: Database.Database | undefined
  try {
    db.pragma('journal_mode = WAL')
    migrateDatabase(db)
    db.prepare(
      "INSERT INTO tracks(id,file_path,title,duration_seconds) VALUES(1,'isolated.flac','Track',60)",
    ).run()
    other = new DatabaseCtor(path, { timeout: 10 })
    const admission = new DatabaseWriteAdmission()
    const lease = await admission.acquireExclusive()
    other.exec('BEGIN IMMEDIATE')
    const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>()
    const registrar = createValidatedIpcRegistrar({
      register: (channel, handler) => handlers.set(channel, handler),
      isTrustedSender: () => true,
    })
    const changed = vi.fn()
    const writeRegistrar = createWriteAdmissionRegistrar(registrar, admission)
    const badges = new BadgeAchievementRepository(db)
    registerBadgeAchievementIpcHandlers(writeRegistrar, badges, changed)
    const playlistChanges = vi.fn()
    const playlists = new PlaylistRepository(db)
    const smartPlaylists = new SmartPlaylistRepository(db)
    registerPlaylistIpcHandlers(writeRegistrar, {
      playlistService: new PlaylistService(playlists, smartPlaylists, playlistChanges),
      smartPlaylistService: new SmartPlaylistService(
        smartPlaylists,
        new TrackRepository(db),
        playlistChanges,
      ),
      getSmartTrackCounts: () => new Map(),
    })
    const stats = new PlayStatsRepository(db)
    const playChanges = vi.fn()
    registerPlaybackArchiveIpcHandlers(writeRegistrar, {
      libraryService: {} as never,
      playStatsService: new PlayStatsService(stats, () => resetListeningHistory(db, stats, badges)),
      getAudioUrl: async () => null as never,
      notifyLibraryChanged: playChanges,
    })
    const event = {} as IpcMainInvokeEvent
    const pending = handlers.get(ipcChannels.playback.recordListeningProgress)!(event, {
      epoch: 0,
      sessionId: 'test',
      sequence: 1,
      trackId: 1,
      samples: [
        {
          startedAtIso: '2026-10-28T12:00:00.000Z',
          startSeconds: 0,
          endSeconds: 1,
          playedSeconds: 1,
        },
      ],
    })
    const playlist = handlers.get(ipcChannels.playlists.create)!(event)
    const smart = handlers.get(ipcChannels.smartPlaylists.create)!(event, {
      name: 'Queued smart',
      rule: { conditions: [{ field: 'genre', value: 'Rock' }] },
    })
    const play = handlers.get(ipcChannels.playback.recordEffectivePlay)!(event, {
      trackId: 1,
      sessionId: 'play',
      playedAtIso: '2026-10-28T12:00:00.000Z',
    })
    expect(handlers.get(ipcChannels.playback.getListeningEpoch)!(event)).toBe(0)
    expect(changed).not.toHaveBeenCalled()
    expect(playlistChanges).not.toHaveBeenCalled()
    expect(playChanges).not.toHaveBeenCalled()
    expect(() =>
      db.prepare('UPDATE badge_listening_epoch SET epoch=epoch WHERE id=1').run(),
    ).toThrow()
    other.exec('ROLLBACK')
    lease.release()
    await expect(pending).resolves.toEqual({ ok: true, epoch: 0 })
    await expect(playlist).resolves.toMatchObject({ id: expect.any(Number) })
    await expect(smart).resolves.toMatchObject({ created: true })
    await expect(play).resolves.toEqual({ ok: true, recorded: true })
    expect(changed).toHaveBeenCalledOnce()
    await registrar.shutdown()
  } finally {
    if (other?.inTransaction) other.exec('ROLLBACK')
    other?.close()
    db.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
