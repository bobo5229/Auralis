export function formatAlbumReleaseDate(value: string | null, unknownDate: string): string {
  const match = value?.trim().match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/)
  if (!match) return unknownDate
  const [, year, month, day] = match
  if (!month) return year
  if (Number(month) < 1 || Number(month) > 12) return unknownDate
  // 不完整的发行日期保留已知部分，不补造月日。
  if (!day) return `${year}-${month}`

  const date = new Date(0)
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day))
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return unknownDate
  }
  return `${year}-${month}-${day}`
}
