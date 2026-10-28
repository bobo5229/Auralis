export interface CdIndexReturnMarker {
  albumKey: string
  scrollTop: number
}

let marker: CdIndexReturnMarker | null = null

export function rememberCdIndexDeparture(next: CdIndexReturnMarker): void {
  marker = { albumKey: next.albumKey, scrollTop: next.scrollTop }
}

/** One-shot restore. A later visit does not replay the highlight. */
export function consumeCdIndexReturn(): CdIndexReturnMarker | null {
  const current = marker
  marker = null
  return current
}

export function clearCdIndexReturn(): void {
  marker = null
}
