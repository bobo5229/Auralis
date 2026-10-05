import { uiText, i18n } from '@renderer/i18n'

export function formatArchiveMinutes(durationSeconds: number): string {
  if (durationSeconds > 0 && durationSeconds < 60) return uiText('archive.mac.lessThanMinute')
  return uiText('albums.detail.metrics.minutesUnit', {
    minutes: Math.round(durationSeconds / 60).toLocaleString(i18n.global.locale.value),
  })
}
