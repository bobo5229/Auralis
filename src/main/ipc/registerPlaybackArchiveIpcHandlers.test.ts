import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { ipcChannels } from '@shared/ipc/channels'
import { IpcPayloadValidationError } from './ipcPayloadValidation'
import { createValidatedIpcRegistrar, IpcInvokeSourceError } from './validatedIpcRegistrar'
import { registerPlaybackArchiveIpcHandlers } from './registerPlaybackArchiveIpcHandlers'

type RawInvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

function createFixture(trusted = true) {
  const recordEffectivePlay = vi.fn(() => ({ ok: true, recorded: true }))
  const resetAll = vi.fn(() => ({ ok: true as const }))
  const notifyLibraryChanged = vi.fn()
  const handlers = new Map<string, RawInvokeHandler>()
  const registrar = createValidatedIpcRegistrar({
    register: (channel, listener) => handlers.set(channel, listener),
    isTrustedSender: () => trusted,
  })
  registerPlaybackArchiveIpcHandlers(registrar, {
    libraryService: {
      getRandomTrack: vi.fn(),
      getRandomAlbumTracks: vi.fn(),
      getAlbumTracks: vi.fn(),
    },
    playStatsService: { recordEffectivePlay, resetAll },
    getAudioUrl: vi.fn(async () => null),
    notifyLibraryChanged,
  })
  const invoke = (channel: string, ...args: unknown[]) => {
    const handler = handlers.get(channel)
    if (!handler) throw new Error('Handler was not registered')
    return handler({} as IpcMainInvokeEvent, ...args)
  }
  return { handlers, recordEffectivePlay, resetAll, invoke, notifyLibraryChanged }
}

const payload = { trackId: 42, sessionId: 'session-42', playedAtIso: '2026-10-08T12:00:00Z' }

describe('playback statistics IPC after archive query retirement', () => {
  it('keeps reset as the only archive capability in the channel registry and handlers', () => {
    const { handlers } = createFixture()
    expect(Object.values(ipcChannels.archive)).toEqual(['archive:reset-play-stats'])
    expect([...handlers.keys()].filter((key) => key.startsWith('archive:'))).toEqual([
      'archive:reset-play-stats',
    ])
  })

  it('records validated effective plays and notifies only newly recorded plays', () => {
    const { invoke, recordEffectivePlay, notifyLibraryChanged } = createFixture()
    expect(invoke(ipcChannels.playback.recordEffectivePlay, payload)).toEqual({
      ok: true,
      recorded: true,
    })
    expect(recordEffectivePlay).toHaveBeenCalledExactlyOnceWith(payload)
    expect(notifyLibraryChanged).toHaveBeenCalledExactlyOnceWith({
      reason: 'play-stats-updated',
      trackIds: [42],
      filePaths: [],
    })
    recordEffectivePlay.mockReturnValue({ ok: true, recorded: false })
    invoke(ipcChannels.playback.recordEffectivePlay, payload)
    expect(notifyLibraryChanged).toHaveBeenCalledOnce()
  })

  it('rejects malformed recording input before calling the service', () => {
    const { invoke, recordEffectivePlay } = createFixture()
    expect(() => invoke(ipcChannels.playback.recordEffectivePlay)).toThrow(
      IpcPayloadValidationError,
    )
    expect(() =>
      invoke(ipcChannels.playback.recordEffectivePlay, { ...payload, extra: true }),
    ).toThrow(IpcPayloadValidationError)
    expect(recordEffectivePlay).not.toHaveBeenCalled()
  })

  it('continues rejecting untrusted recording and reset requests', () => {
    const { invoke, recordEffectivePlay, resetAll } = createFixture(false)
    expect(() => invoke(ipcChannels.playback.recordEffectivePlay, payload)).toThrow(
      IpcInvokeSourceError,
    )
    expect(() => invoke(ipcChannels.archive.resetPlayStats)).toThrow(IpcInvokeSourceError)
    expect(recordEffectivePlay).not.toHaveBeenCalled()
    expect(resetAll).not.toHaveBeenCalled()
  })

  it('keeps reset validation and emits the reset event only after a successful reset', () => {
    const { invoke, resetAll, notifyLibraryChanged } = createFixture()
    expect(() => invoke(ipcChannels.archive.resetPlayStats, { unexpected: true })).toThrow(
      IpcPayloadValidationError,
    )
    expect(resetAll).not.toHaveBeenCalled()
    expect(invoke(ipcChannels.archive.resetPlayStats)).toEqual({ ok: true })
    expect(notifyLibraryChanged).toHaveBeenCalledExactlyOnceWith({
      reason: 'play-stats-reset',
      trackIds: [],
      filePaths: [],
    })
    resetAll.mockImplementationOnce(() => {
      throw new Error('reset failed')
    })
    expect(() => invoke(ipcChannels.archive.resetPlayStats)).toThrow('reset failed')
    expect(notifyLibraryChanged).toHaveBeenCalledOnce()
  })
})
