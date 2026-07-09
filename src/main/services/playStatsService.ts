import type { PlayStatsRepository } from '../repositories/playStatsRepository'
import type {
  AnnualListeningInsights,
  DailyListeningDetail,
  ListeningHeatmap,
  ListeningRanking,
  ListeningRankingParams,
} from '@shared/types/archive'

const MAX_SESSION_CACHE = 1000

function formatDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function isValidDateKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00`)
  if (Number.isNaN(d.getTime())) return false
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}` === s
}

export class PlayStatsService {
  private readonly recordedSessions = new Set<string>()

  constructor(private readonly playStatsRepo: PlayStatsRepository) {}

  recordEffectivePlay(payload: { trackId: number; sessionId: string; playedAtIso: string }): {
    ok: boolean
  } {
    const { trackId, sessionId, playedAtIso } = payload

    if (!Number.isInteger(trackId) || trackId <= 0) {
      return { ok: false }
    }

    if (!sessionId?.trim()) {
      return { ok: false }
    }

    if (!playedAtIso || Number.isNaN(Date.parse(playedAtIso))) {
      return { ok: false }
    }

    if (this.recordedSessions.has(sessionId)) {
      return { ok: true }
    }

    if (this.recordedSessions.size >= MAX_SESSION_CACHE) {
      const first = this.recordedSessions.values().next().value
      if (first !== undefined) {
        this.recordedSessions.delete(first)
      }
    }

    const playedAt = new Date(playedAtIso)
    const localPlayDate = [
      playedAt.getFullYear(),
      String(playedAt.getMonth() + 1).padStart(2, '0'),
      String(playedAt.getDate()).padStart(2, '0'),
    ].join('-')

    this.playStatsRepo.incrementPlayCount(trackId, playedAtIso, localPlayDate)
    this.recordedSessions.add(sessionId)

    return { ok: true }
  }

  getListeningHeatmap(year: number): ListeningHeatmap {
    const currentYear = new Date().getFullYear()
    if (!Number.isInteger(year) || year < 1970 || year > currentYear) {
      throw new Error(`Year must be between 1970 and ${currentYear}`)
    }

    const result = this.playStatsRepo.getListeningHeatmap(year)
    return { year, ...result }
  }

  getDailyListeningDetail(date: string): DailyListeningDetail {
    if (!isValidDateKey(date)) {
      throw new Error('Date must use the YYYY-MM-DD format')
    }

    return this.playStatsRepo.getDailyListeningDetail(date)
  }

  getAnnualListeningInsights(year: number): AnnualListeningInsights {
    const currentYear = new Date().getFullYear()
    if (!Number.isInteger(year) || year < 1970 || year > currentYear) {
      throw new Error(`Year must be between 1970 and ${currentYear}`)
    }

    return this.playStatsRepo.getAnnualListeningInsights(year)
  }

  getListeningRanking(params: ListeningRankingParams): ListeningRanking {
    const now = new Date()
    const currentYear = now.getFullYear()
    let startDate: string
    let endDate: string

    if (params.target !== 'track' && params.target !== 'album') {
      throw new Error('Ranking target must be track or album')
    }

    if (params.range === 'day') {
      if (params.date) {
        if (!isValidDateKey(params.date)) {
          throw new Error('date must be in YYYY-MM-DD format')
        }
        startDate = params.date
      } else {
        startDate = formatDateKey(now)
      }
      endDate = startDate
    } else if (params.range === 'week') {
      if (params.weekStartDate) {
        if (!isValidDateKey(params.weekStartDate)) {
          throw new Error('weekStartDate must be in YYYY-MM-DD format')
        }
        const rawDate = new Date(`${params.weekStartDate}T00:00:00`)
        const rawDay = rawDate.getDay()
        const mondayOffset = rawDay === 0 ? -6 : 1 - rawDay
        if (mondayOffset !== 0) {
          rawDate.setDate(rawDate.getDate() + mondayOffset)
        }
        startDate = formatDateKey(rawDate)
        const ed = new Date(rawDate)
        ed.setDate(rawDate.getDate() + 6)
        endDate = formatDateKey(ed)
      } else {
        const day = now.getDay()
        const mondayOffset = day === 0 ? -6 : 1 - day
        const monday = new Date(now)
        monday.setDate(now.getDate() + mondayOffset)
        const sunday = new Date(monday)
        sunday.setDate(monday.getDate() + 6)
        startDate = formatDateKey(monday)
        endDate = formatDateKey(sunday)
      }
    } else if (params.range === 'month') {
      const year = params.year ?? currentYear
      const month = params.month ?? now.getMonth() + 1
      if (!Number.isInteger(year) || year < 1970 || year > currentYear) {
        throw new Error(`Year must be between 1970 and ${currentYear}`)
      }
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('Month must be between 1 and 12')
      }
      startDate = `${year}-${String(month).padStart(2, '0')}-01`
      endDate = formatDateKey(new Date(year, month, 0))
    } else if (params.range === 'year') {
      const year = params.year ?? currentYear
      if (!Number.isInteger(year) || year < 1970 || year > currentYear) {
        throw new Error(`Year must be between 1970 and ${currentYear}`)
      }
      startDate = `${year}-01-01`
      endDate = `${year}-12-31`
    } else {
      throw new Error('Ranking range must be day, week, month, or year')
    }

    const todayKey = formatDateKey(now)
    if (startDate > todayKey) {
      throw new Error('Ranking period must not be in the future')
    }

    return {
      range: params.range,
      target: params.target,
      startDate,
      endDate,
      items: this.playStatsRepo.getListeningRanking(startDate, endDate, params.target),
    }
  }

  resetAll(): { ok: true } {
    this.playStatsRepo.resetAll()
    this.recordedSessions.clear()
    return { ok: true }
  }
}
