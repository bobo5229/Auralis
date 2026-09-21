import type { CSSProperties, DeepReadonly } from 'vue'
import type { ArtworkPalette, RgbColor } from '@renderer/features/playback/types'

function formatRgb(color: RgbColor): string {
  return `rgb(${color.r} ${color.g} ${color.b})`
}

export function resolveAlbumHeroTint(
  palette: DeepReadonly<ArtworkPalette>,
  artworkCacheKey: string | null,
  artworkUrl: string | null,
): {
  hasPaletteTint: boolean
  washImage: string
  background: string
  accentA: string
  accentB: string
  accentC: string
} {
  const hasPaletteTint =
    palette.quality !== 'fallback' && Boolean(artworkCacheKey) && palette.key === artworkCacheKey
  const first = palette.accents[0]?.rgb ?? palette.background
  const second = palette.accents[1]?.rgb ?? first
  const third = palette.accents[2]?.rgb ?? second

  return {
    hasPaletteTint,
    washImage: artworkUrl ? `url("${artworkUrl}")` : 'none',
    background: formatRgb(palette.background),
    accentA: formatRgb(first),
    accentB: formatRgb(second),
    accentC: formatRgb(third),
  }
}

export function albumHeroTintStyle(
  palette: DeepReadonly<ArtworkPalette>,
  artworkCacheKey: string | null,
  artworkUrl: string | null,
  accent: string,
): CSSProperties {
  const tint = resolveAlbumHeroTint(palette, artworkCacheKey, artworkUrl)
  return {
    '--auralis-album-detail-accent': accent,
    '--album-hero-tint-bg': tint.background,
    '--album-hero-tint-a': tint.accentA,
    '--album-hero-tint-b': tint.accentB,
    '--album-hero-tint-c': tint.accentC,
    '--album-hero-wash-image': tint.washImage,
  } as CSSProperties
}
