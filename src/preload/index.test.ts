import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invoke, exposeInMainWorld, on, removeListener } = vi.hoisted(() => ({
  invoke: vi.fn(async (): Promise<unknown> => ({ ok: true })),
  exposeInMainWorld: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeListener },
}))

import { auralisApi } from './index'

it('forwards typed playlist changes without exposing the Electron event and unsubscribes', () => {
  const changed = vi.fn()
  const unsubscribe = auralisApi.playlists.onChanged(changed)
  expect(on).toHaveBeenLastCalledWith('playlists:changed', expect.any(Function))
  const listener = on.mock.calls.at(-1)![1]
  const payload = { kind: 'smart', playlistId: 7, reason: 'created' }
  listener({ sender: 'private Electron event' }, payload)
  expect(changed).toHaveBeenCalledExactlyOnceWith(payload)
  unsubscribe()
  expect(removeListener).toHaveBeenLastCalledWith('playlists:changed', listener)
})

describe('archive preload capabilities', () => {
  beforeEach(() => invoke.mockClear())

  it('exposes only the typed close preference query and update', async () => {
    await auralisApi.window.getCloseBehavior()
    expect(invoke).toHaveBeenLastCalledWith('window:get-close-behavior')
    await auralisApi.window.setCloseBehavior('tray')
    expect(invoke).toHaveBeenLastCalledWith('window:set-close-behavior', { behavior: 'tray' })
  })

  it('claims a startup album through an explicit capability with presentation history', async () => {
    const request = { recentAlbums: [{ albumArtist: 'Artist', album: 'Album' }] }
    invoke.mockResolvedValueOnce({ album: null })
    await expect(auralisApi.app.claimStartupAlbum(request)).resolves.toEqual({ album: null })
    expect(invoke).toHaveBeenCalledExactlyOnceWith('app:claim-startup-album', request)
  })

  it('draws fresh albums repeatedly through a separate explicit capability', async () => {
    const request = { recentAlbums: [{ albumArtist: 'Artist', album: 'Album' }] }
    invoke.mockResolvedValueOnce({ album: null }).mockResolvedValueOnce({ album: null })
    await expect(auralisApi.app.drawStartupAlbum(request)).resolves.toEqual({ album: null })
    await expect(auralisApi.app.drawStartupAlbum(request)).resolves.toEqual({ album: null })
    expect(invoke.mock.calls).toEqual([
      ['app:draw-startup-album', request],
      ['app:draw-startup-album', request],
    ])
  })

  it('exposes annual counts and reset without reviving retired queries', () => {
    expect(exposeInMainWorld).toHaveBeenCalledExactlyOnceWith('auralis', auralisApi)
    expect(Object.keys(auralisApi.archive)).toEqual([
      'getBadgeAchievements',
      'onBadgeAchievementsChanged',
      'getAnnualPlayCounts',
      'getAnnualSummary',
      'getDayTopTracks',
      'getDayTopAlbums',
      'resetPlayStats',
    ])
  })

  it('exposes the lightweight listening epoch and forwards badge changes without Electron events', async () => {
    invoke.mockResolvedValueOnce(9)
    await expect(auralisApi.playback.getListeningEpoch()).resolves.toBe(9)
    expect(invoke).toHaveBeenCalledExactlyOnceWith('playback:get-listening-epoch')
    const changed = vi.fn()
    const unsubscribe = auralisApi.archive.onBadgeAchievementsChanged(changed)
    const listener = on.mock.calls.at(-1)![1]
    expect(on).toHaveBeenLastCalledWith('archive:badge-achievements-changed', listener)
    listener({ sender: 'private Electron event' }, undefined)
    expect(changed).toHaveBeenCalledOnce()
    unsubscribe()
    expect(removeListener).toHaveBeenLastCalledWith('archive:badge-achievements-changed', listener)
  })

  it('routes the requested year and returns counts through the explicit query channel', async () => {
    const counts = [{ date: '2026-01-01', playCount: 5, durationSeconds: 900 }]
    invoke.mockResolvedValueOnce(counts)
    await expect(auralisApi.archive.getAnnualPlayCounts(2026)).resolves.toEqual(counts)
    expect(invoke).toHaveBeenCalledExactlyOnceWith('archive:get-annual-play-counts', { year: 2026 })
  })

  it('continues routing reset through its explicit IPC channel', async () => {
    await expect(auralisApi.archive.resetPlayStats()).resolves.toEqual({ ok: true })
    expect(invoke).toHaveBeenCalledExactlyOnceWith('archive:reset-play-stats')
  })

  it('routes annual summaries through an explicit year-only capability', async () => {
    await auralisApi.archive.getAnnualSummary(2026)
    expect(invoke).toHaveBeenCalledExactlyOnceWith('archive:get-annual-summary', { year: 2026 })
  })

  it('routes only the selected local date through the explicit daily top tracks channel', async () => {
    invoke.mockResolvedValueOnce([])
    await expect(auralisApi.archive.getDayTopTracks('2026-10-09')).resolves.toEqual([])
    expect(invoke).toHaveBeenCalledExactlyOnceWith('archive:get-day-top-tracks', {
      date: '2026-10-09',
    })
  })

  it('routes only the selected local date through the explicit daily top albums channel', async () => {
    invoke.mockResolvedValueOnce([])
    await expect(auralisApi.archive.getDayTopAlbums('2026-10-09')).resolves.toEqual([])
    expect(invoke).toHaveBeenCalledExactlyOnceWith('archive:get-day-top-albums', {
      date: '2026-10-09',
    })
  })
})
