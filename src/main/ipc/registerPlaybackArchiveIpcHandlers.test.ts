import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { ipcChannels } from '@shared/ipc/channels'
import { IpcPayloadValidationError } from './ipcPayloadValidation'
import { createValidatedIpcRegistrar, IpcInvokeSourceError } from './validatedIpcRegistrar'
import { registerPlaybackArchiveIpcHandlers } from './registerPlaybackArchiveIpcHandlers'
import { buildAnnualSummary } from '../services/annualSummary'

type RawInvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

function createFixture(trusted = true) {
  const getPlaybackTrack = vi.fn(() => ({
    id: 42,
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    durationSeconds: 180,
    artworkCacheKey: 'new-cover',
  }))
  const recordEffectivePlay = vi.fn(() => ({ ok: true, recorded: true }))
  const resetAll = vi.fn(() => ({ ok: true as const }))
  const getAnnualPlayCounts = vi.fn(() => [
    { date: '2026-10-08', playCount: 12, durationSeconds: 1800 },
  ])
  const getDayTopTracks = vi.fn(() => [])
  const getAnnualSummary = vi.fn(() => buildAnnualSummary(2026, [], []))
  const getDayTopAlbums = vi.fn(() => [])
  const notifyLibraryChanged = vi.fn()
  const handlers = new Map<string, RawInvokeHandler>()
  const registrar = createValidatedIpcRegistrar({
    register: (channel, listener) => handlers.set(channel, listener),
    isTrustedSender: () => trusted,
  })
  registerPlaybackArchiveIpcHandlers(registrar, {
    libraryService: {
      getPlaybackTrack,
      getRandomTrack: vi.fn(),
      getRandomAlbumTracks: vi.fn(),
      getAlbumTracks: vi.fn(),
    },
    playStatsService: {
      recordEffectivePlay,
      getAnnualPlayCounts,
      getAnnualSummary,
      getDayTopTracks,
      getDayTopAlbums,
      resetAll,
    },
    getAudioUrl: vi.fn(async () => null),
    notifyLibraryChanged,
  })
  const invoke = (channel: string, ...args: unknown[]) => {
    const handler = handlers.get(channel)
    if (!handler) throw new Error('Handler was not registered')
    return handler({} as IpcMainInvokeEvent, ...args)
  }
  return {
    getPlaybackTrack,
    handlers,
    recordEffectivePlay,
    getAnnualPlayCounts,
    getAnnualSummary,
    getDayTopTracks,
    getDayTopAlbums,
    resetAll,
    invoke,
    notifyLibraryChanged,
  }
}

const payload = { trackId: 42, sessionId: 'session-42', playedAtIso: '2026-10-08T12:00:00Z' }

describe('playback statistics and annual archive IPC', () => {
  it('reads the playback snapshot and validates its ID and sender without publishing changes', () => {
    const f = createFixture()
    expect(f.invoke(ipcChannels.playback.getTrack, { trackId: 42 })).toMatchObject({
      id: 42,
      artworkCacheKey: 'new-cover',
    })
    expect(f.getPlaybackTrack).toHaveBeenCalledExactlyOnceWith(42)
    for (const payload of [
      undefined,
      {},
      { trackId: 0 },
      { trackId: -1 },
      { trackId: '42' },
      { trackId: 1.5 },
      { trackId: 42, filePath: 'unexpected' },
    ]) {
      expect(() => f.invoke(ipcChannels.playback.getTrack, payload)).toThrow(
        IpcPayloadValidationError,
      )
    }
    expect(f.getPlaybackTrack).toHaveBeenCalledTimes(1)
    expect(f.notifyLibraryChanged).not.toHaveBeenCalled()
    const untrusted = createFixture(false)
    expect(() => untrusted.invoke(ipcChannels.playback.getTrack, { trackId: 42 })).toThrow(
      IpcInvokeSourceError,
    )
    expect(untrusted.getPlaybackTrack).not.toHaveBeenCalled()
  })
  it('keeps archive statistics registration separate from badge evidence', () => {
    const { handlers } = createFixture()
    expect(Object.values(ipcChannels.archive)).toEqual([
      'archive:get-badge-achievements',
      'archive:badge-achievements-changed',
      'archive:get-annual-play-counts',
      'archive:get-annual-summary',
      'archive:get-day-top-tracks',
      'archive:get-day-top-albums',
      'archive:reset-play-stats',
    ])
    expect([...handlers.keys()].filter((key) => key.startsWith('archive:'))).toEqual([
      'archive:get-annual-play-counts',
      'archive:get-annual-summary',
      'archive:get-day-top-tracks',
      'archive:get-day-top-albums',
      'archive:reset-play-stats',
    ])
  })

  it('queries validated annual counts without emitting a library change', () => {
    const { invoke, getAnnualPlayCounts, notifyLibraryChanged } = createFixture()
    expect(invoke(ipcChannels.archive.getAnnualPlayCounts, { year: 2026 })).toEqual([
      { date: '2026-10-08', playCount: 12, durationSeconds: 1800 },
    ])
    expect(getAnnualPlayCounts).toHaveBeenCalledExactlyOnceWith(2026)
    expect(notifyLibraryChanged).not.toHaveBeenCalled()
  })

  it('queries a read-only summary and rejects malformed years and untrusted senders', () => {
    const f = createFixture()
    expect(f.invoke(ipcChannels.archive.getAnnualSummary, { year: 2026 })).toMatchObject({
      year: 2026,
      playCount: 0,
    })
    expect(f.getAnnualSummary).toHaveBeenCalledExactlyOnceWith(2026)
    for (const payload of [
      undefined,
      {},
      { year: '2026' },
      { year: 2026.5 },
      { year: 1899 },
      { year: 10000 },
      { year: 2026, extra: true },
    ]) {
      expect(() => f.invoke(ipcChannels.archive.getAnnualSummary, payload)).toThrow(
        IpcPayloadValidationError,
      )
    }
    expect(f.getAnnualSummary).toHaveBeenCalledOnce()
    expect(f.notifyLibraryChanged).not.toHaveBeenCalled()
    const untrusted = createFixture(false)
    expect(() => untrusted.invoke(ipcChannels.archive.getAnnualSummary, { year: 2026 })).toThrow(
      IpcInvokeSourceError,
    )
    expect(untrusted.getAnnualSummary).not.toHaveBeenCalled()
  })

  it.each([
    undefined,
    {},
    { year: '2026' },
    { year: 2026.5 },
    { year: NaN },
    { year: Infinity },
    { year: 1899 },
    { year: 10000 },
    { year: 2026, extra: true },
  ])('rejects malformed annual query %j before accessing the service', (payload) => {
    const { invoke, getAnnualPlayCounts } = createFixture()
    expect(() => invoke(ipcChannels.archive.getAnnualPlayCounts, payload)).toThrow(
      IpcPayloadValidationError,
    )
    expect(getAnnualPlayCounts).not.toHaveBeenCalled()
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
    const {
      invoke,
      recordEffectivePlay,
      getAnnualPlayCounts,
      getDayTopTracks,
      getDayTopAlbums,
      resetAll,
    } = createFixture(false)
    expect(() => invoke(ipcChannels.playback.recordEffectivePlay, payload)).toThrow(
      IpcInvokeSourceError,
    )
    expect(() => invoke(ipcChannels.archive.resetPlayStats)).toThrow(IpcInvokeSourceError)
    expect(() => invoke(ipcChannels.archive.getAnnualPlayCounts, { year: 2026 })).toThrow(
      IpcInvokeSourceError,
    )
    expect(recordEffectivePlay).not.toHaveBeenCalled()
    expect(getAnnualPlayCounts).not.toHaveBeenCalled()
    expect(() => invoke(ipcChannels.archive.getDayTopTracks, { date: '2026-10-09' })).toThrow(
      IpcInvokeSourceError,
    )
    expect(getDayTopTracks).not.toHaveBeenCalled()
    expect(() => invoke(ipcChannels.archive.getDayTopAlbums, { date: '2026-10-09' })).toThrow(
      IpcInvokeSourceError,
    )
    expect(getDayTopAlbums).not.toHaveBeenCalled()
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

  it('queries a selected day without writing or notifying', () => {
    const { invoke, getDayTopTracks, notifyLibraryChanged } = createFixture()
    expect(invoke(ipcChannels.archive.getDayTopTracks, { date: '2024-02-29' })).toEqual([])
    expect(getDayTopTracks).toHaveBeenCalledExactlyOnceWith('2024-02-29')
    expect(notifyLibraryChanged).not.toHaveBeenCalled()
  })

  it('queries the selected day albums without writing or notifying', () => {
    const { invoke, getDayTopAlbums, notifyLibraryChanged } = createFixture()
    expect(invoke(ipcChannels.archive.getDayTopAlbums, { date: '2024-02-29' })).toEqual([])
    expect(getDayTopAlbums).toHaveBeenCalledExactlyOnceWith('2024-02-29')
    expect(notifyLibraryChanged).not.toHaveBeenCalled()
  })

  it.each([
    undefined,
    {},
    { date: null },
    { date: '2026-02-29' },
    { date: '2026-13-01' },
    { date: '2026-04-31' },
    { date: '1899-01-01' },
    { date: '2026-1-1' },
    { date: '2026-01-01', extra: true },
  ])('rejects malformed daily album query %j', (payload) => {
    const { invoke, getDayTopAlbums } = createFixture()
    expect(() => invoke(ipcChannels.archive.getDayTopAlbums, payload)).toThrow(
      IpcPayloadValidationError,
    )
    expect(getDayTopAlbums).not.toHaveBeenCalled()
  })

  it.each([
    undefined,
    {},
    { date: null },
    { date: '2026-02-29' },
    { date: '2026-13-01' },
    { date: '2026-04-31' },
    { date: '1899-01-01' },
    { date: '2026-1-1' },
    { date: '2026-01-01', extra: true },
  ])('rejects malformed daily track query %j', (payload) => {
    const { invoke, getDayTopTracks } = createFixture()
    expect(() => invoke(ipcChannels.archive.getDayTopTracks, payload)).toThrow(
      IpcPayloadValidationError,
    )
    expect(getDayTopTracks).not.toHaveBeenCalled()
  })
})
