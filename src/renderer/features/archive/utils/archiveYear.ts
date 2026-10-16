/** Restore the selected archive year without accepting unsupported query values. */
export function resolveArchiveYear(value: unknown, fallback = new Date().getFullYear()): number {
  if (typeof value !== 'string' || !/^\d{4}$/.test(value)) return fallback
  const year = Number(value)
  return year >= 1900 ? year : fallback
}
