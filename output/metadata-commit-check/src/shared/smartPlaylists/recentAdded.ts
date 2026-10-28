export const RECENT_ADDED_DAY_OPTIONS = [7, 30, 90, 365] as const
export const DEFAULT_RECENT_ADDED_DAYS = 30

export function assertRecentAddedDays(days: number): void {
  if (!(RECENT_ADDED_DAY_OPTIONS as readonly number[]).includes(days)) {
    throw new Error('最近添加仅支持 7、30、90、365 天')
  }
}
