import { describe, expect, it, vi } from 'vitest'
import type { PlayStatsRepository } from '../repositories/playStatsRepository'
import { PlayStatsService } from './playStatsService'

function createService() {
  const playStatsRepo = {
    getListeningHeatmap: vi.fn(),
    getDailyListeningDetail: vi.fn(),
    getDailyAlbumStats: vi.fn(),
    getAnnualListeningInsights: vi.fn(),
    getListeningGenreSpectrumWithTopTracks: vi.fn(),
    getListeningRanking: vi.fn(),
    resetAll: vi.fn(),
    trackExists: vi.fn(),
    incrementPlayCount: vi.fn(),
  }
  return {
    service: new PlayStatsService(playStatsRepo as unknown as PlayStatsRepository),
    playStatsRepo,
  }
}

describe('PlayStatsService year and date rules', () => {
  it('rejects years outside 1970 through the current year', () => {
    const { service, playStatsRepo } = createService()
    const currentYear = new Date().getFullYear()

    expect(() => service.getListeningHeatmap(1969)).toThrow(/Year must be between 1970/)
    expect(() => service.getListeningHeatmap(currentYear + 1)).toThrow(/Year must be between 1970/)
    expect(() => service.getAnnualListeningInsights(1969)).toThrow(/Year must be between 1970/)
    expect(() => service.getListeningGenreSpectrum(1969)).toThrow(/Year must be between 1970/)
    expect(() =>
      service.getListeningRanking({ range: 'year', target: 'track', year: 1969 }),
    ).toThrow(/Year must be between 1970/)

    expect(playStatsRepo.getListeningHeatmap).not.toHaveBeenCalled()
    expect(playStatsRepo.getAnnualListeningInsights).not.toHaveBeenCalled()
    expect(playStatsRepo.getListeningGenreSpectrumWithTopTracks).not.toHaveBeenCalled()
    expect(playStatsRepo.getListeningRanking).not.toHaveBeenCalled()
  })

  it('rejects calendar-invalid YYYY-MM-DD dates', () => {
    const { service, playStatsRepo } = createService()

    expect(() => service.getDailyListeningDetail('2026-02-30')).toThrow(/YYYY-MM-DD/)
    expect(() =>
      service.getListeningRanking({ range: 'day', target: 'track', date: '2026-02-30' }),
    ).toThrow(/YYYY-MM-DD/)

    expect(playStatsRepo.getDailyListeningDetail).not.toHaveBeenCalled()
    expect(playStatsRepo.getListeningRanking).not.toHaveBeenCalled()
  })

  it('returns daily album stats for the requested date, including an empty date', () => {
    const { service, playStatsRepo } = createService()
    playStatsRepo.getDailyAlbumStats.mockReturnValue([])

    expect(service.getDailyAlbumStats('2026-06-15')).toEqual({ date: '2026-06-15', items: [] })
    expect(playStatsRepo.getDailyAlbumStats).toHaveBeenCalledOnce()
    expect(playStatsRepo.getDailyAlbumStats).toHaveBeenCalledWith('2026-06-15')
  })

  it('rejects malformed and calendar-invalid daily album stats dates before querying', () => {
    const { service, playStatsRepo } = createService()

    for (const date of ['2026/02/28', '2026-02-30', '2025-02-29']) {
      expect(() => service.getDailyAlbumStats(date)).toThrow(/YYYY-MM-DD/)
    }

    expect(playStatsRepo.getDailyAlbumStats).not.toHaveBeenCalled()
  })

  it('enforces the lower bound and local today for daily album stats', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 1, 28, 12))

    try {
      const { service, playStatsRepo } = createService()
      playStatsRepo.getDailyAlbumStats.mockReturnValue([])

      for (const date of ['1970-01-01', '2024-02-29', '2026-02-28']) {
        expect(service.getDailyAlbumStats(date)).toEqual({ date, items: [] })
      }

      expect(() => service.getDailyAlbumStats('1969-12-31')).toThrow(
        'Date must be on or after 1970-01-01',
      )
      expect(() => service.getDailyAlbumStats('2026-03-01')).toThrow(
        'Date must not be in the future',
      )
      expect(playStatsRepo.getDailyAlbumStats).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })
})
