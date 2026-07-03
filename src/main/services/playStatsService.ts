import type { PlayStatsRepository } from '../repositories/playStatsRepository'
import type { ListeningHeatmap } from '@shared/types/archive'

const MAX_SESSION_CACHE = 1000

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
}
