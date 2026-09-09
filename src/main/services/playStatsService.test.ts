import { describe, expect, it, vi } from 'vitest'
import type { PlayStatsRepository } from '../repositories/playStatsRepository'
import { PlayStatsService } from './playStatsService'

function createService() {
  const playStatsRepo = {
    getListeningHeatmap: vi.fn(),
    getDailyListeningDetail: vi.fn(),
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
})
