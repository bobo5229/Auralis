import type { PlayStatsRepository } from '../repositories/playStatsRepository'
import type { DailyPlayCount, DailyTopAlbum, DailyTopTrack } from '@shared/types/listeningArchive'
import { buildAnnualSummary } from './annualSummary'
import { isListeningArchiveDate } from '@shared/listeningArchiveDate'

/** In-memory idempotency window for sessionIds (insertion-order FIFO eviction). */
const MAX_SESSION_CACHE = 5000

export class PlayStatsService {
  /** Last N recorded sessionIds; Set preserves insertion order for FIFO eviction. */
  private readonly recordedSessions = new Set<string>()

  constructor(private readonly playStatsRepo: PlayStatsRepository) {}

  recordEffectivePlay(payload: { trackId: number; sessionId: string; playedAtIso: string }): {
    ok: boolean
    recorded: boolean
  } {
    const { trackId, sessionId, playedAtIso } = payload

    if (!Number.isInteger(trackId) || trackId <= 0) {
      return { ok: false, recorded: false }
    }

    if (!sessionId?.trim()) {
      return { ok: false, recorded: false }
    }

    if (!playedAtIso || Number.isNaN(Date.parse(playedAtIso))) {
      return { ok: false, recorded: false }
    }

    if (this.recordedSessions.has(sessionId)) {
      return { ok: true, recorded: false }
    }

    // Reject unknown tracks before any write (avoids FK throw + retry loops)
    if (!this.playStatsRepo.trackExists(trackId)) {
      return { ok: false, recorded: false }
    }

    const playedAt = new Date(playedAtIso)
    const localPlayDate = [
      playedAt.getFullYear(),
      String(playedAt.getMonth() + 1).padStart(2, '0'),
      String(playedAt.getDate()).padStart(2, '0'),
    ].join('-')

    this.playStatsRepo.incrementPlayCount(trackId, playedAtIso, localPlayDate)
    this.rememberSession(sessionId)

    return { ok: true, recorded: true }
  }

  private rememberSession(sessionId: string): void {
    if (this.recordedSessions.has(sessionId)) return

    while (this.recordedSessions.size >= MAX_SESSION_CACHE) {
      const first = this.recordedSessions.values().next().value
      if (first === undefined) break
      this.recordedSessions.delete(first)
    }

    this.recordedSessions.add(sessionId)
  }

  getAnnualPlayCounts(year: number): DailyPlayCount[] {
    if (!Number.isInteger(year) || year < 1900 || year > 9999) {
      throw new RangeError('Invalid listening archive year')
    }
    return this.playStatsRepo.getAnnualPlayCounts(year)
  }

  getAnnualSummary(year: number) {
    if (!Number.isInteger(year) || year < 1900 || year > 9999) {
      throw new RangeError('Invalid listening archive year')
    }
    return this.playStatsRepo.withAnnualListeningSnapshot(
      year,
      ({ days, rows, getDayTopAlbums }) => {
        const summary = buildAnnualSummary(year, days, rows)
        if (summary.peakDay)
          summary.peakDay.album = getDayTopAlbums(summary.peakDay.date)[0] ?? null
        return summary
      },
    )
  }

  getDayTopTracks(date: string): DailyTopTrack[] {
    if (!isListeningArchiveDate(date)) throw new RangeError('Invalid listening archive date')
    return this.playStatsRepo.getDayTopTracks(date)
  }

  getDayTopAlbums(date: string): DailyTopAlbum[] {
    if (!isListeningArchiveDate(date)) throw new RangeError('Invalid listening archive date')
    return this.playStatsRepo.getDayTopAlbums(date)
  }

  resetAll(): { ok: true } {
    this.playStatsRepo.resetAll()
    this.recordedSessions.clear()
    return { ok: true }
  }
}
