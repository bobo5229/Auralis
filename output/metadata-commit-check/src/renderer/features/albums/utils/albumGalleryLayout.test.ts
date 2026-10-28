import { describe, expect, it } from 'vitest'
import { albumGalleryCapacity, updateRandomAlbumOrder } from './albumGalleryLayout'

describe('albumGalleryCapacity', () => {
  it('includes only complete fixed-size cards and accounts for gaps', () => {
    expect(albumGalleryCapacity(0, 144, 18)).toBe(0)
    expect(albumGalleryCapacity(143, 144, 18)).toBe(0)
    expect(albumGalleryCapacity(144, 144, 18)).toBe(1)
    expect(albumGalleryCapacity(467, 144, 18)).toBe(2)
    expect(albumGalleryCapacity(468, 144, 18)).toBe(3)
    expect(albumGalleryCapacity(1116, 144, 18)).toBe(7)
  })
})

describe('updateRandomAlbumOrder', () => {
  it('randomizes a new visit without duplicates or mutation', () => {
    const candidates = ['a', 'b', 'c', 'a']
    expect(updateRandomAlbumOrder([], candidates, () => 0)).toEqual(['b', 'c', 'a'])
    expect(updateRandomAlbumOrder([], candidates, () => 0.99)).toEqual(['a', 'b', 'c'])
    expect(candidates).toEqual(['a', 'b', 'c', 'a'])
  })

  it('keeps existing recommendations in place across data refreshes and window resizing', () => {
    const order = updateRandomAlbumOrder([], ['a', 'b', 'c', 'd'], () => 0)
    const refreshed = updateRandomAlbumOrder(order, ['d', 'c', 'b', 'a', 'e'], () => 0.99)
    expect(refreshed.slice(0, 4)).toEqual(order)
    expect(refreshed.slice(0, 2)).toEqual(order.slice(0, 2))
    expect(refreshed.slice(0, 20)).toHaveLength(5)
    expect(updateRandomAlbumOrder(order, ['a', 'd'], () => 0)).toEqual(
      order.filter((key) => key === 'a' || key === 'd'),
    )
  })
})
