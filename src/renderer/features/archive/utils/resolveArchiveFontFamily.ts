export function resolveArchiveFontFamily(
  value: string | null | undefined,
  fallback: string,
): string {
  const family = value?.trim()
  return family && !/var\s*\(/iu.test(family) ? family : fallback
}
