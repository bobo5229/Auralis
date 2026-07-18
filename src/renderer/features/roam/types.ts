/** Brick-wall cover size in CSS pixels (MVP). */
export const COVER_SIZE = 140

/** Gap between cover tiles in CSS pixels. */
export const GAP = 12

/** Cell stride = cover + gap. */
export const STRIDE = COVER_SIZE + GAP

/** Odd rows shift by half a cell for brick layout. */
export const ODD_ROW_OFFSET = STRIDE / 2

/** Extra cells rendered beyond the viewport edges. */
export const OVERSCAN_CELLS = 2

/** Album summary for roam tiles (no track list needed for MVP). */
export interface RoamAlbum {
  key: string
  title: string
  albumArtist: string
  artworkCacheKey: string | null
}

/** One virtual tile on the infinite brick wall. */
export interface RoamTile {
  id: string
  cx: number
  cy: number
  x: number
  y: number
  album: RoamAlbum
}
