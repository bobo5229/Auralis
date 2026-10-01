import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { DailyAlbumStats } from '@shared/types/archive'
import { ipcChannels } from '@shared/ipc/channels'
import { IpcPayloadValidationError } from './ipcPayloadValidation'
import { createValidatedIpcRegistrar, IpcInvokeSourceError } from './validatedIpcRegistrar'
import {
  registerPlaybackArchiveIpcHandlers,
  type PlaybackArchiveIpcDependencies,
} from './registerPlaybackArchiveIpcHandlers'

type RawInvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

function createFixture(trusted = true) {
  const response: DailyAlbumStats = { date: '2026-02-28', items: [] }
  const getDailyAlbumStats = vi.fn((): DailyAlbumStats => response)
  const playStatsService = {
    recordEffectivePlay: vi.fn(),
    getListeningHeatmap: vi.fn(),
    getDailyListeningDetail: vi.fn(),
    getDailyAlbumStats,
    getAnnualListeningInsights: vi.fn(),
    getListeningRanking: vi.fn(),
    getListeningGenreSpectrum: vi.fn(),
    resetAll: vi.fn(),
  } as unknown as PlaybackArchiveIpcDependencies['playStatsService']
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
    playStatsService,
    getAudioUrl: vi.fn(async () => null),
    notifyLibraryChanged,
  })

  const invoke = (...args: unknown[]) => {
    const handler = handlers.get(ipcChannels.archive.getDailyAlbumStats)
    if (!handler) throw new Error('Daily album stats handler was not registered')
    return handler({} as IpcMainInvokeEvent, ...args)
  }

  return { getDailyAlbumStats, invoke, notifyLibraryChanged }
}

describe('registerPlaybackArchiveIpcHandlers daily album stats', () => {
  it('routes a trusted validated date to the service without emitting a library change', () => {
    const { getDailyAlbumStats, invoke, notifyLibraryChanged } = createFixture()

    expect(invoke({ date: '2026-02-28' })).toEqual({ date: '2026-02-28', items: [] })
    expect(getDailyAlbumStats).toHaveBeenCalledWith('2026-02-28')
    expect(getDailyAlbumStats).toHaveBeenCalledOnce()
    expect(notifyLibraryChanged).not.toHaveBeenCalled()
  })

  it('rejects invalid payloads before calling the service', () => {
    const { getDailyAlbumStats, invoke } = createFixture()

    expect(() => invoke()).toThrow(IpcPayloadValidationError)
    expect(() => invoke({ date: '2026/02/28' })).toThrow(IpcPayloadValidationError)
    expect(() => invoke({ date: '2026-02-28', extra: true })).toThrow(IpcPayloadValidationError)
    expect(getDailyAlbumStats).not.toHaveBeenCalled()
  })

  it('rejects an untrusted sender before payload validation or the service', () => {
    const { getDailyAlbumStats, invoke } = createFixture(false)

    expect(() => invoke()).toThrow(IpcInvokeSourceError)
    expect(getDailyAlbumStats).not.toHaveBeenCalled()
  })

  it('propagates service failures to the invoke caller', () => {
    const { getDailyAlbumStats, invoke } = createFixture()
    getDailyAlbumStats.mockImplementation(() => {
      throw new Error('daily album query failed')
    })

    expect(() => invoke({ date: '2026-02-28' })).toThrow('daily album query failed')
  })
})
