/** Keep Chinese numeric month labels; English summaries use localized month names. */
export function formatSummaryMonth(
  month: number,
  locale: string,
  width: 'short' | 'long' = 'long',
): string {
  if (!locale.startsWith('en')) return String(month)
  return new Intl.DateTimeFormat(locale, { month: width, timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, month - 1, 1)),
  )
}
