import { modeRgb, parse, useMode } from 'culori/fn'
import { getContrastRatio } from '@renderer/shared/color/colorMath'

useMode(modeRgb)
type Channels = { r: number; g: number; b: number }
const css = (color: Channels) => `rgb(${color.r} ${color.g} ${color.b})`

/** Preserve the cell's sRGB fill without alpha, and keep all panel text readable. */
export function archivePanelColors(fill: string) {
  const parsed = parse(fill)
  if (!parsed || parsed.mode !== 'rgb') return null
  const background = { r: parsed.r * 255, g: parsed.g * 255, b: parsed.b * 255 }
  const dark = { r: 18, g: 18, b: 18 }
  const light = { r: 255, g: 255, b: 255 }
  let text =
    getContrastRatio(dark, background) >= getContrastRatio(light, background) ? dark : light
  if (getContrastRatio(text, background) < 4.5) text = { r: 0, g: 0, b: 0 }
  let muted = text
  for (const amount of [0.24, 0.16, 0.08]) {
    const candidate = {
      r: text.r * (1 - amount) + background.r * amount,
      g: text.g * (1 - amount) + background.g * amount,
      b: text.b * (1 - amount) + background.b * amount,
    }
    if (getContrastRatio(candidate, background) >= 4.5) {
      muted = candidate
      break
    }
  }
  return { fill: css(background), text: css(text), muted: css(muted) }
}
