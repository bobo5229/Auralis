import { uiText, i18n } from '@renderer/i18n'

export type ArchiveDailyDetailView = 'loading' | 'error' | 'tracks' | 'empty'

export interface ArchiveDailyDetailDialogModel {
  date: string
  label: string
  x: number
  y: number
  expanded: boolean
}

export function formatArchiveMinutes(durationSeconds: number): string {
  if (durationSeconds > 0 && durationSeconds < 60) return uiText('archive.mac.lessThanMinute')
  return uiText('albums.detail.metrics.minutesUnit', {
    minutes: Math.round(durationSeconds / 60).toLocaleString(i18n.global.locale.value),
  })
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
