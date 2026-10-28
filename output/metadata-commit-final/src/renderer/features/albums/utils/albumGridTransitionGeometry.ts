import { COLUMN_GAP, GRID_PADDING_X } from '../composables/useAlbumGridLayout'
import type { AlbumTransitionRect } from './albumGridTransitionController'

/** Mirror the virtual row's CSS grid without laying out the hidden live cards. */
export function calculateAlbumTransitionRect(input: {
  viewport: AlbumTransitionRect
  gridWidth: number
  columnCount: number
  columnIndex: number
  rowStart: number
  rowHeight: number
  paddingTop: number
  scrollTop: number
}): AlbumTransitionRect {
  const width =
    (input.gridWidth - GRID_PADDING_X - COLUMN_GAP * (input.columnCount - 1)) / input.columnCount
  return {
    left: input.viewport.left + GRID_PADDING_X / 2 + input.columnIndex * (width + COLUMN_GAP),
    top: input.viewport.top + input.paddingTop + input.rowStart - input.scrollTop,
    width,
    height: input.rowHeight,
  }
}
