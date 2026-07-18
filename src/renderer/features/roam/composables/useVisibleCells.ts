import {
  COVER_SIZE,
  ODD_ROW_OFFSET,
  OVERSCAN_CELLS,
  STRIDE,
  type RoamAlbum,
  type RoamTile,
} from '../types'
import { cellAlbumIndex } from '../utils/cellHash'

export interface ComputeVisibleTilesOptions {
  albums: readonly RoamAlbum[]
  seed: number
  /** Viewport top-left in world space. */
  cameraX: number
  cameraY: number
  viewportW: number
  viewportH: number
}

/**
 * Brick-wall world position of cell `(cx, cy)`:
 * - worldX = cx * STRIDE + (odd row ? ODD_ROW_OFFSET : 0)
 * - worldY = cy * STRIDE
 */
export function cellWorldPosition(cx: number, cy: number): { x: number; y: number } {
  const rowOffset = (cy & 1) !== 0 ? ODD_ROW_OFFSET : 0
  return {
    x: cx * STRIDE + rowOffset,
    y: cy * STRIDE,
  }
}

/**
 * Inclusive integer range of cell indices whose cover rects intersect `[min, max)`
 * along one axis, where cell origin is `index * STRIDE + offset` and size is COVER_SIZE.
 */
function visibleIndexRange(
  min: number,
  max: number,
  offset: number,
): { start: number; end: number } {
  // left + COVER_SIZE > min  =>  index > (min - offset - COVER_SIZE) / STRIDE
  const start = Math.floor((min - offset - COVER_SIZE) / STRIDE) + 1
  // left < max  =>  index < (max - offset) / STRIDE
  const end = Math.ceil((max - offset) / STRIDE) - 1
  return { start, end }
}

/**
 * Pure: compute virtual tiles intersecting the camera viewport (+ overscan).
 * Same album may appear on many cells (T3 infinite mapping).
 */
export function computeVisibleTiles(opts: ComputeVisibleTilesOptions): RoamTile[] {
  const { albums, seed, cameraX, cameraY, viewportW, viewportH } = opts
  const albumCount = albums.length

  if (albumCount === 0 || viewportW <= 0 || viewportH <= 0) {
    return []
  }

  const overscan = OVERSCAN_CELLS * STRIDE
  const x0 = cameraX - overscan
  const y0 = cameraY - overscan
  const x1 = cameraX + viewportW + overscan
  const y1 = cameraY + viewportH + overscan

  // Rows have no X offset in Y; row offset only affects X.
  const { start: cyStart, end: cyEnd } = visibleIndexRange(y0, y1, 0)

  const tiles: RoamTile[] = []

  for (let cy = cyStart; cy <= cyEnd; cy++) {
    const rowOffset = (cy & 1) !== 0 ? ODD_ROW_OFFSET : 0
    const { start: cxStart, end: cxEnd } = visibleIndexRange(x0, x1, rowOffset)

    for (let cx = cxStart; cx <= cxEnd; cx++) {
      const x = cx * STRIDE + rowOffset
      const y = cy * STRIDE
      const album = albums[cellAlbumIndex(seed, cx, cy, albumCount)]!

      tiles.push({
        id: `${cx},${cy}`,
        cx,
        cy,
        x,
        y,
        album,
      })
    }
  }

  return tiles
}
