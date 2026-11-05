import { getContrastRatio, oklabToRgb, rgbToOklab } from '@renderer/shared/color/colorMath'
import type { RgbColor } from '@renderer/shared/color/types'

const rgb = (value: number): RgbColor => ({ r: value, g: value, b: value })
const mix = (a: RgbColor, b: RgbColor, t: number): RgbColor => ({
  r: Math.round(a.r + (b.r - a.r) * t),
  g: Math.round(a.g + (b.g - a.g) * t),
  b: Math.round(a.b + (b.b - a.b) * t),
})

// This cover has a black background and several equally prominent hues. A single
// petal is not representative of its overall surface; keep the override local to
// this exact artwork and album, leaving the shared palette and other versions intact.
const SUPERNATURAL_ARTWORK_KEY =
  'v2-b91487d60e6713dacb4d01b24e7ed1436eeafba9b9f08171cadd10f9cc9c16e8.webp'

export function albumDetailSourceColor(
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
    return rgb(36)
  }
  return dominant
}

/** Keep the preferred neutral when readable, otherwise move toward a readable extreme. */
export function readableAlbumText(source: RgbColor, background: RgbColor): RgbColor {
  if (getContrastRatio(source, background) >= 4.5) return source
  const white = rgb(255)
  const black = rgb(0)
  const target = getContrastRatio(white, background) >= 4.5 ? white : black
  for (let step = 1; step <= 100; step++) {
    const candidate = mix(source, target, step / 100)
    if (getContrastRatio(candidate, background) >= 4.5) return candidate
  }
  return target
}

/** Retain the cover's lightness and chroma while keeping side surfaces slightly darker. */
export function albumDetailColors(source: RgbColor) {
  const { l, a, b } = rgbToOklab(source)
  const mainLightness = Math.max(0.32, Math.min(0.9, l))
  const surface = (lightness: number) => {
    let scale = 1
    let color = oklabToRgb({ l: lightness, a, b })
    for (let i = 0; i < 12 && [color.r, color.g, color.b].some((v) => v <= 1 || v >= 254); i++) {
      scale *= 0.9
      color = oklabToRgb({ l: lightness, a: a * scale, b: b * scale })
    }
    return color
  }
  const main = surface(mainLightness)
  const more = surface(mainLightness - 0.04)
  const side = surface(mainLightness - 0.08)
  const defaults = {
    text: { r: 243, g: 238, b: 230 },
    muted: { r: 175, g: 180, b: 188 },
    faint: { r: 146, g: 153, b: 163 },
    active: rgb(216),
    inactive: { r: 81, g: 81, b: 82 },
  }
  const text = (color: RgbColor, bg: RgbColor) => readableAlbumText(color, bg)
  const mainText = text(defaults.text, main)
  return {
    main,
    divider: mainText,
    more,
    side,
    moreText: text(defaults.text, more),
    moreFaint: text(defaults.faint, more),
    mainText,
    mainMuted: text(defaults.muted, main),
    mainFaint: text(defaults.faint, main),
    sideText: text(defaults.text, side),
    sideMuted: text(defaults.muted, side),
    sideFaint: text(defaults.faint, side),
    lyricsActive: text(getContrastRatio(rgb(255), side) >= 4.5 ? defaults.active : rgb(32), side),
    lyricsInactive: text(defaults.inactive, side),
    lyricsMuted: text(defaults.muted, side),
  }
}

export function cssAlbumColor(value: RgbColor): string {
  return `rgb(${value.r} ${value.g} ${value.b})`
}
