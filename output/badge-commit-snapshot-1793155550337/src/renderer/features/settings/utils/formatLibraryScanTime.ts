/** SQLite CURRENT_TIMESTAMP is UTC but carries no timezone suffix. */
export function formatLibraryScanTime(value: string, locale: string): string {
  const timestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return value

  // Omitting timeZone uses the user's computer timezone, independently of locale.
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}
