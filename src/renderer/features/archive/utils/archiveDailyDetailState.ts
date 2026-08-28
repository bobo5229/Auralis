export type ArchiveDailyDetailView = 'loading' | 'error' | 'tracks' | 'empty'

export interface ArchiveDailyDetailDialogModel {
  date: string
  label: string
  x: number
  y: number
  expanded: boolean
}

export function formatArchiveMinutes(durationSeconds: number): string {
  if (durationSeconds > 0 && durationSeconds < 60) return '不到 1 分钟'
  return `${Math.round(durationSeconds / 60)} 分钟`
}

export function resolveArchiveDailyDetailView(
  loading: boolean,
  error: string | null,
  trackCount: number,
): ArchiveDailyDetailView {
  if (loading) return 'loading'
  if (error) return 'error'
  return trackCount > 0 ? 'tracks' : 'empty'
}
