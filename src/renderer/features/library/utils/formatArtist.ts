export function formatArtist(artist: string | null): string {
  if (!artist) return ''

  const parts = artist
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length <= 1) return parts[0] ?? ''

  const last = parts.pop()!
  return `${parts.join(', ')} & ${last}`
}
