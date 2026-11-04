import { getContrastRatio, oklabToRgb, rgbToOklab } from '@renderer/shared/color/colorMath'
import type { RgbColor } from '@renderer/shared/color/types'

const rgb = (value: number): RgbColor => ({ r: value, g: value, b: value })
const mix = (a: RgbColor, b: RgbColor, t: number): RgbColor => ({
  r: Math.round(a.r + (b.r - a.r) * t),
  g: Math.round(a.g + (b.g - a.g) * t),
  b: Math.round(a.b + (b.b - a.b) * t),
})

/** Preserve the theme color whenever it meets contrast on the actual composited surface. */
export function readableAlbumText(source: RgbColor, background: RgbColor, opacity = 1): RgbColor {
  const target = rgb(255)
  for (let step = 0; step <= 100; step++) {
    const candidate = mix(source, target, step / 100)
    if (getContrastRatio(mix(background, candidate, opacity), background) >= 4.5) return candidate
  }
  return target
}

/** Use a neutral line with a restrained contrast against the album surface. */
export function readableAlbumDivider(background: RgbColor): RgbColor {
  for (let value = 165; value <= 255; value++) {
    const candidate = rgb(value)
    if (getContrastRatio(candidate, background) >= 1.7) return candidate
  }
  return rgb(255)
}

/** The cover canvas uses the same dark palette in either application theme. */
export function albumDetailColors(source: RgbColor) {
  const { a, b } = rgbToOklab(source)
  const chroma = Math.hypot(a, b)
  const strength = chroma < 0.015 ? 0 : Math.min(1.3, 0.16 / chroma)
  const surface = (l: number) => {
    let scale = strength
    let color = oklabToRgb({ l, a: a * scale, b: b * scale })
    for (let i = 0; i < 12 && [color.r, color.g, color.b].some((v) => v <= 1 || v >= 254); i++) {
      scale *= 0.9
      color = oklabToRgb({ l, a: a * scale, b: b * scale })
    }
    return color
  }
  let mainLightness = 0.56
  let main = surface(mainLightness)
  while (mainLightness > 0.49 && getContrastRatio(rgb(255), main) < 4.5) {
    mainLightness -= 0.005
    main = surface(mainLightness)
  }
  const more = surface(0.48)
  const side = surface(0.4)
  const defaults = {
    text: { r: 243, g: 238, b: 230 },
    muted: { r: 175, g: 180, b: 188 },
    faint: { r: 146, g: 153, b: 163 },
    active: rgb(216),
    inactive: { r: 81, g: 81, b: 82 },
  }
  const text = (color: RgbColor, bg: RgbColor, opacity = 1) => readableAlbumText(color, bg, opacity)
  return {
    main,
    divider: readableAlbumDivider(main),
    more,
    side,
    moreText: text(defaults.text, more),
    moreFaint: text(defaults.faint, more),
    mainText: text(defaults.text, main),
    mainMuted: text(defaults.muted, main),
    mainFaint: text(defaults.faint, main),
    sideText: text(defaults.text, side),
    sideMuted: text(defaults.muted, side),
    sideFaint: text(defaults.faint, side),
    lyricsActive: text(defaults.active, side),
    lyricsInactive: text(defaults.inactive, side, 0.8),
    lyricsMuted: text(defaults.muted, side),
  }
}

export function cssAlbumColor(value: RgbColor): string {
  return `rgb(${value.r} ${value.g} ${value.b})`
}
