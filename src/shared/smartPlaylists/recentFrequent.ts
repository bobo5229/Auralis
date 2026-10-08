import type { RecentFrequentSmartPlaylistRule, SmartPlaylistRule } from '../types/smartPlaylist'

export const RECENT_FREQUENT_DAY_OPTIONS = [3, 7, 30, 90, 365] as const
export const DEFAULT_RECENT_FREQUENT_DAYS = 30
export const DEFAULT_RECENT_PLAYED_DAYS = 30

export function assertRecentFrequentDays(days: number): void {
  if (!Number.isSafeInteger(days) || days < 1) {
    throw new Error('时间范围必须是正整数天数')
  }
}

export function isRecentFrequentRule(
  rule: SmartPlaylistRule,
): rule is RecentFrequentSmartPlaylistRule {
  return 'preset' in rule && rule.preset === 'recentFrequent'
}

/** Use local calendar dates to match daily play statistics, including DST boundaries. */
export function resolveRecentFrequentDateRange(
  days: number,
  now = new Date(),
): { startDate: string; endDate: string } {
  assertRecentFrequentDays(days)
  if (!Number.isFinite(now.getTime()) || now.getFullYear() < 1 || now.getFullYear() > 9999) {
    throw new Error('无效的当前日期')
  }
  const end = new Date(0)
  end.setUTCHours(0, 0, 0, 0)
  end.setUTCFullYear(now.getFullYear(), now.getMonth(), now.getDate())
  const earliest = Date.parse('0001-01-01T00:00:00Z')
  const dayMs = 86_400_000
  // Larger ranges mean all recorded history; never overflow Date for a large custom value.
  const offset = Math.min(days - 1, Math.floor((end.getTime() - earliest) / dayMs))
  const start = new Date(end.getTime() - offset * dayMs)
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
}
