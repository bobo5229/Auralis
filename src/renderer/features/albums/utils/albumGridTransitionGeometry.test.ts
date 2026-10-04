import { describe, expect, it } from 'vitest'
import { calculateAlbumTransitionRect } from './albumGridTransitionGeometry'

describe('album transition target geometry', () => {
  it('matches the grid padding, column gap and scrolled virtual row', () => {
    expect(
      calculateAlbumTransitionRect({
        viewport: { left: 292, top: 0, width: 970, height: 700 },
        gridWidth: 970,
        columnCount: 5,
        columnIndex: 2,
        rowStart: 536,
        rowHeight: 268,
        paddingTop: 16,
        scrollTop: 500,
      }),
    ).toEqual({ left: 692, top: 52, width: 170, height: 268 })
  })

  it('keeps fractional dimensions and the row height across a column-count change', () => {
    const rect = calculateAlbumTransitionRect({
      viewport: { left: 292, top: 10, width: 1290, height: 700 },
      gridWidth: 1290,
      columnCount: 6,
      columnIndex: 5,
      rowStart: 1000,
      rowHeight: 289.6666666666667,
      paddingTop: 16,
      scrollTop: 900,
    })
    expect(rect.width).toBeCloseTo(191.66666666666666)
    expect(rect.left + rect.width).toBeCloseTo(292 + 1290 - 20)
    expect(rect.top).toBe(126)
    expect(rect.height).toBe(289.6666666666667)
  })
})
