import { describe, expect, it, vi } from 'vitest'
import type { PlayStatsRepository } from '../repositories/playStatsRepository'
import { PlayStatsService } from './playStatsService'

function createService() {
  const playStatsRepo = {
    trackExists: vi.fn(() => true),
    incrementPlayCount: vi.fn(),
    resetAll: vi.fn(),
    getAnnualPlayCounts: vi.fn(() => [{ date: '2026-10-08', playCount: 2, durationSeconds: 360 }]),
    getDayTopTracks: vi.fn(() => []),
    getDayTopAlbums: vi.fn(() => []),
  }
  return {
    service: new PlayStatsService(playStatsRepo as unknown as PlayStatsRepository),
    playStatsRepo,
  }
}

const payload = {
  trackId: 42,
  sessionId: 'session-42',
  playedAtIso: new Date(2026, 9, 8, 12).toISOString(),
}

describe('PlayStatsService recording and reset', () => {
  it('reads top tracks for a valid local date without recording or resetting', () => {
    const { service, playStatsRepo } = createService()
    expect(service.getDayTopTracks('2024-02-29')).toEqual([])
    expect(playStatsRepo.getDayTopTracks).toHaveBeenCalledExactlyOnceWith('2024-02-29')
    expect(playStatsRepo.incrementPlayCount).not.toHaveBeenCalled()
    expect(playStatsRepo.resetAll).not.toHaveBeenCalled()
  })
  it('reads top albums for a valid local date without recording or resetting', () => {
    const { service, playStatsRepo } = createService()
    expect(service.getDayTopAlbums('2024-02-29')).toEqual([])
    expect(playStatsRepo.getDayTopAlbums).toHaveBeenCalledExactlyOnceWith('2024-02-29')
    expect(playStatsRepo.incrementPlayCount).not.toHaveBeenCalled()
    expect(playStatsRepo.resetAll).not.toHaveBeenCalled()
  })
  it.each([
    '2026-02-29',
    '2024-02-30',
    '2026-00-01',
    '2026-04-31',
    '2026-1-1',
    '1899-12-31',
    'invalid',
  ])('rejects invalid local date %s', (date) => {
    const { service, playStatsRepo } = createService()
    expect(() => service.getDayTopTracks(date)).toThrow(RangeError)
    expect(() => service.getDayTopAlbums(date)).toThrow(RangeError)
    expect(playStatsRepo.getDayTopTracks).not.toHaveBeenCalled()
    expect(playStatsRepo.getDayTopAlbums).not.toHaveBeenCalled()
  })
  it('reads annual day counts without modifying statistics', () => {
    const { service, playStatsRepo } = createService()
    expect(service.getAnnualPlayCounts(2026)).toEqual([
      { date: '2026-10-08', playCount: 2, durationSeconds: 360 },
    ])
    expect(playStatsRepo.getAnnualPlayCounts).toHaveBeenCalledExactlyOnceWith(2026)
    expect(playStatsRepo.incrementPlayCount).not.toHaveBeenCalled()
    expect(playStatsRepo.resetAll).not.toHaveBeenCalled()
  })

  it.each([1899, 10000, 2026.5, NaN, Infinity])(
    'rejects invalid query year %s before reading',
    (year) => {
      const { service, playStatsRepo } = createService()
      expect(() => service.getAnnualPlayCounts(year)).toThrow(RangeError)
      expect(playStatsRepo.getAnnualPlayCounts).not.toHaveBeenCalled()
    },
  )
  it('records an effective play once per session with its local date', () => {
    const { service, playStatsRepo } = createService()
    expect(service.recordEffectivePlay(payload)).toEqual({ ok: true, recorded: true })
    expect(service.recordEffectivePlay(payload)).toEqual({ ok: true, recorded: false })
    expect(playStatsRepo.incrementPlayCount).toHaveBeenCalledExactlyOnceWith(
      42,
      payload.playedAtIso,
      '2026-10-08',
    )
  })

  it.each([{ trackId: 0 }, { trackId: 1.5 }, { sessionId: ' ' }, { playedAtIso: 'invalid-date' }])(
    'rejects invalid recording input %j before writing',
    (patch) => {
      const { service, playStatsRepo } = createService()
      expect(service.recordEffectivePlay({ ...payload, ...patch })).toEqual({
        ok: false,
        recorded: false,
      })
      expect(playStatsRepo.trackExists).not.toHaveBeenCalled()
      expect(playStatsRepo.incrementPlayCount).not.toHaveBeenCalled()
    },
  )

  it('rejects unknown tracks without writing or remembering their sessions', () => {
    const { service, playStatsRepo } = createService()
    playStatsRepo.trackExists.mockReturnValueOnce(false)
    expect(service.recordEffectivePlay(payload)).toEqual({ ok: false, recorded: false })
    expect(playStatsRepo.incrementPlayCount).not.toHaveBeenCalled()
    expect(service.recordEffectivePlay(payload)).toEqual({ ok: true, recorded: true })
  })

  it('allows retry after a recording write fails', () => {
    const { service, playStatsRepo } = createService()
    playStatsRepo.incrementPlayCount.mockImplementationOnce(() => {
      throw new Error('write failed')
    })
    expect(() => service.recordEffectivePlay(payload)).toThrow('write failed')
    expect(service.recordEffectivePlay(payload)).toEqual({ ok: true, recorded: true })
  })

  it('resets persisted statistics before clearing the session cache', () => {
    const { service, playStatsRepo } = createService()
    service.recordEffectivePlay(payload)
    playStatsRepo.resetAll.mockImplementationOnce(() => {
      throw new Error('reset failed')
    })
    expect(() => service.resetAll()).toThrow('reset failed')
    expect(service.recordEffectivePlay(payload)).toEqual({ ok: true, recorded: false })
    expect(service.resetAll()).toEqual({ ok: true })
    expect(service.recordEffectivePlay(payload)).toEqual({ ok: true, recorded: true })
  })
})
