import { describe, expect, it } from 'vitest'
import { readonly } from 'vue'
import { FALLBACK_PALETTE } from '@renderer/features/playback/utils/extractArtworkPalette'
import type { ArtworkPalette } from '@renderer/features/playback/types'

import { albumHeroTintStyle, resolveAlbumHeroTint } from './albumHeroTint'

function paletteFor(key: string): ArtworkPalette {
  return {
    ...FALLBACK_PALETTE,
    key,
    quality: 'full',
    background: { r: 20, g: 8, b: 12 },
    accents: [
      { ...FALLBACK_PALETTE.accents[0]!, rgb: { r: 180, g: 40, b: 60 } },
      { ...FALLBACK_PALETTE.accents[0]!, rgb: { r: 40, g: 80, b: 160 } },
    ],
  }
}

describe('resolveAlbumHeroTint', () => {
  it('uses the cover wash when the palette is still fallback', () => {
    const tint = resolveAlbumHeroTint(FALLBACK_PALETTE, 'cover-a', 'auralis-artwork://cover-a')

    expect(tint.hasPaletteTint).toBe(false)
    expect(tint.washImage).toBe('url("auralis-artwork://cover-a")')
  })

  it('enables the cached palette gradient only for the matching artwork key', () => {
    const tint = resolveAlbumHeroTint(
      readonly(paletteFor('cover-a')),
      'cover-a',
      'auralis-artwork://cover-a',
    )

    expect(tint.hasPaletteTint).toBe(true)
    expect(tint.background).toBe('rgb(20 8 12)')
    expect(tint.accentA).toBe('rgb(180 40 60)')
    expect(tint.accentB).toBe('rgb(40 80 160)')
    expect(tint.accentC).toBe('rgb(40 80 160)')
  })

  it('writes CSS custom properties without waiting for heavy effects', () => {
    const style = albumHeroTintStyle(
      readonly(paletteFor('cover-a')),
      'cover-a',
      'auralis-artwork://cover-a',
      'rgb(180 40 60)',
    )

    expect(style['--auralis-album-detail-accent']).toBe('rgb(180 40 60)')
    expect(style['--album-hero-wash-image']).toBe('url("auralis-artwork://cover-a")')
    expect(style['--album-hero-tint-a']).toBe('rgb(180 40 60)')
  })
})
