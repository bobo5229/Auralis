import type Database from 'better-sqlite3'
import type { BadgeAchievementRepository } from '../repositories/badgeAchievementRepository'
import type { PlayStatsRepository } from '../repositories/playStatsRepository'

/** Clear both histories and advance the evidence epoch in one transaction. */
export function resetListeningHistory(
  db: Database.Database,
  playStats: Pick<PlayStatsRepository, 'resetAll'>,
  badges: Pick<BadgeAchievementRepository, 'resetAll'>,
): void {
  db.transaction(() => {
    playStats.resetAll()
    badges.resetAll()
  })()
}
