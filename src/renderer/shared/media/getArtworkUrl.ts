export function getArtworkUrl(key: string | null): string | null {
  return key ? `auralis-artwork://${key}` : null
}
