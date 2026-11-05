import type { RgbColor } from '@renderer/shared/color/types'

// One-time migration for values that were previously hard-coded. They are never
// consulted for rendering once migrated, including after a user restores automatic color.
const SUPERNATURAL_ARTWORK_KEY =
  'v2-b91487d60e6713dacb4d01b24e7ed1436eeafba9b9f08171cadd10f9cc9c16e8.webp'
const YOUR_WEDDING_ARTWORK_KEY =
  'v2-cc83d2eb92cc289bfd2fdd8637819af67f9a5d444466bd3cc1c1315691095a3d.webp'

export function legacyAlbumDetailSourceColor(
  artist: unknown,
  title: unknown,
  artworkKey: string,
  dominant: RgbColor,
): RgbColor {
  if (
    artist === 'NewJeans' &&
    title === 'Supernatural' &&
    artworkKey === SUPERNATURAL_ARTWORK_KEY
  ) {
    return { r: 36, g: 36, b: 36 }
  }
  if (
    artist === '你的婚礼 电影原声带' &&
    title === '你的婚礼 电影原声带' &&
    artworkKey === YOUR_WEDDING_ARTWORK_KEY
  ) {
    return { r: 207, g: 255, b: 196 }
  }
  return dominant
}
