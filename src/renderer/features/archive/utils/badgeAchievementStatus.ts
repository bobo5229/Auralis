import type { BadgeAchievements } from '@shared/types/badgeAchievements'
import type { MilestoneBadge } from '../constants/milestoneBadges'
export function badgeAchievementStatus(badge: MilestoneBadge, achievements: BadgeAchievements) {
  if (badge.group === 'hours')
    return {
      earned: achievements.listeningSeconds >= (badge.amount ?? Infinity) * 3600,
      current: achievements.listeningSeconds / 3600,
      target: badge.amount ?? 0,
      unit: 'hours',
    }
  if (badge.group === 'days')
    return {
      earned: achievements.listeningDays >= (badge.amount ?? Infinity),
      current: achievements.listeningDays,
      target: badge.amount ?? 0,
      unit: 'days',
    }
  const live = badge.id === 'albumsLive',
    progress = live ? achievements.liveAlbumProgress : achievements.albumProgress
  return {
    earned: (live ? achievements.completeLiveAlbums : achievements.completeAlbums) > 0,
    current: progress.completedTracks,
    target: progress.totalTracks,
    unit: 'tracks',
  }
}
