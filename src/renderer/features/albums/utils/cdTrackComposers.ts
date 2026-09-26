export function presentCdTrackComposers(value: string | null | undefined): string[] | null {
  const names =
    value
      ?.split(';')
      .map((name) => name.trim())
      .filter(Boolean) ?? []
  return names.length > 0 ? names : null
}
