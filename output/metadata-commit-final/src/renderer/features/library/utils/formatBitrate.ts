/** music-metadata reports encoded bitrate in bits per second. */
export function formatBitrate(bitrateBps: number | null | undefined): string {
  return typeof bitrateBps === 'number' && Number.isFinite(bitrateBps) && bitrateBps > 0
    ? `${Math.round(bitrateBps / 1000)} K`
    : '—'
}
