import { convertOklabToRgb } from 'culori/fn'
import { getContrastRatio } from '@renderer/shared/color/colorMath'
import type { RgbColor } from '../types'
import { rgbToOklab } from './colorSpace'

const WHITE: RgbColor = { r: 255, g: 255, b: 255 }
const cssRgb = (color: RgbColor) => `rgb(${color.r} ${color.g} ${color.b})`

function composite(background: RgbColor, foreground: RgbColor, alpha: number): RgbColor {
  return {
    r: Math.round(background.r + (foreground.r - background.r) * alpha),
    g: Math.round(background.g + (foreground.g - background.g) * alpha),
    b: Math.round(background.b + (foreground.b - background.b) * alpha),
  }
}

/** The comparison prototype's fixed OKLCH canvas recipe, local to solid fullscreen. */
export function resolveFullscreenSolidColor(source: RgbColor | null) {
  const lab = rgbToOklab(source ?? { r: 128, g: 128, b: 128 })
  const chroma = Math.hypot(lab.a, lab.b)
  const hue = Math.atan2(lab.b, lab.a)
  const colorAt = (c: number) =>
    convertOklabToRgb({ l: 0.34, a: Math.cos(hue) * c, b: Math.sin(hue) * c })
  let low = 0
  let high = Math.min(0.075, chroma)
  const fits = (c: number) => {
    const rgb = colorAt(c)
    return [rgb.r, rgb.g, rgb.b].every((channel) => channel >= 0 && channel <= 1)
  }
  if (fits(high)) low = high
  else {
    for (let i = 0; i < 20; i++) {
      const middle = (low + high) / 2
      if (fits(middle)) low = middle
      else high = middle
    }
  }
  const rgb = colorAt(low)
  const background = {
    r: Math.round(rgb.r * 255),
    g: Math.round(rgb.g * 255),
    b: Math.round(rgb.b * 255),
  }
  const alphaFor = (foreground: RgbColor, start: number, minimum: number) => {
    let alpha = start
    while (
      alpha < 1 &&
      getContrastRatio(background, composite(background, foreground, alpha)) < minimum
    ) {
      alpha = Math.min(1, alpha + 0.01)
    }
    return alpha
  }
  const primary = composite(background, WHITE, alphaFor(WHITE, 0.96, 4.5))
  const secondary = composite(background, WHITE, alphaFor(WHITE, 0.7, 4.5))
  const control = composite(background, WHITE, alphaFor(WHITE, 0.5, 3))
  const inactiveOpacity = alphaFor(primary, 0.34, 3)
  return {
    background,
    primary,
    secondary,
    control,
    inactiveOpacity,
    style: {
      '--auralis-fullscreen-solid-bg': cssRgb(background),
      '--auralis-fullscreen-bg': cssRgb(background),
      '--auralis-text': cssRgb(primary),
      '--auralis-text-muted': cssRgb(secondary),
      '--auralis-text-disabled': cssRgb(control),
      '--auralis-progress-track': cssRgb(control),
      '--auralis-progress-fill': cssRgb(primary),
      '--auralis-volume-fill': cssRgb(primary),
      '--auralis-fullscreen-pause-fill': cssRgb(primary),
      '--fullscreen-lyric-inactive-opacity': String(inactiveOpacity),
    },
  }
}
