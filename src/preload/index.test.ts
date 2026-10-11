import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invoke, exposeInMainWorld } = vi.hoisted(() => ({
  invoke: vi.fn(async (): Promise<unknown> => ({ ok: true })),
  exposeInMainWorld: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke },
}))

import { auralisApi } from './index'

describe('archive preload capabilities', () => {
  beforeEach(() => invoke.mockClear())

  it('exposes only the typed close preference query and update', async () => {
    await auralisApi.window.getCloseBehavior()
    expect(invoke).toHaveBeenLastCalledWith('window:get-close-behavior')
    await auralisApi.window.setCloseBehavior('minimize')
    expect(invoke).toHaveBeenLastCalledWith('window:set-close-behavior', { behavior: 'minimize' })
  })

  it('claims a startup album through an explicit capability with presentation history', async () => {
    const request = { recentAlbums: [{ albumArtist: 'Artist', album: 'Album' }] }
    invoke.mockResolvedValueOnce({ album: null })
    await expect(auralisApi.app.claimStartupAlbum(request)).resolves.toEqual({ album: null })
    expect(invoke).toHaveBeenCalledExactlyOnceWith('app:claim-startup-album', request)
  })

  it('exposes annual counts and reset without reviving retired queries', () => {
    expect(exposeInMainWorld).toHaveBeenCalledExactlyOnceWith('auralis', auralisApi)
    expect(Object.keys(auralisApi.archive)).toEqual([
      'getAnnualPlayCounts',
      'getDayTopTracks',
      'resetPlayStats',
    ])
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

  it('routes only the selected local date through the explicit daily top tracks channel', async () => {
    invoke.mockResolvedValueOnce([])
    await expect(auralisApi.archive.getDayTopTracks('2026-10-09')).resolves.toEqual([])
    expect(invoke).toHaveBeenCalledExactlyOnceWith('archive:get-day-top-tracks', {
      date: '2026-10-09',
    })
  })
})
