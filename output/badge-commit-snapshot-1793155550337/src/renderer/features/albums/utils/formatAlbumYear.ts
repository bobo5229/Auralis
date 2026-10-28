export function formatAlbumYear(value: string | null, locale: string, unknownYear: string): string {
  if (!value) return unknownYear
  const yearText = value.slice(0, 4)
  if (!/^\d{4}$/.test(yearText)) return unknownYear
  const year = Number(yearText)
  return new Intl.DateTimeFormat(locale, { year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, 0, 1)),
  )
}
