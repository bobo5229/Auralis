import { getContrastRatio, oklabToRgb, rgbToOklab } from '@renderer/shared/color/colorMath'
import type { OklabColor, RgbColor } from '@renderer/shared/color/types'

export interface SurfaceColor extends RgbColor {
  a: number
  lab?: OklabColor
}
export interface ForegroundChoice {
  target: RgbColor
  preferred: RgbColor
}
export interface ForegroundStep {
  offset: number
  colors: Record<string, string>
}

export function parseSurfaceColor(value: string): SurfaceColor | null {
  const raw = value.trim()
  const lab = /^oklab\(\s*([-+\d.]+)\s+([-+\d.]+)\s+([-+\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/i.exec(
    raw,
  )
  if (lab) {
    const value = { l: Number(lab[1]), a: Number(lab[2]), b: Number(lab[3]) }
    return { ...oklabToRgb(value), a: lab[4] === undefined ? 1 : Number(lab[4]), lab: value }
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw)?.[1]
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    }
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(
    raw,
  )
  return rgb
    ? {
        r: Number(rgb[1]),
        g: Number(rgb[2]),
        b: Number(rgb[3]),
        a: rgb[4] === undefined ? 1 : Number(rgb[4]),
      }
    : null
}

// CSS `ease`: cubic-bezier(.25,.1,.25,1). Solve x to obtain the eased progress.
function ease(time: number): number {
  let lo = 0,
    hi = 1
  for (let i = 0; i < 16; i++) {
    const t = (lo + hi) / 2,
      x = 3 * (1 - t) * (1 - t) * t * 0.25 + 3 * (1 - t) * t * t * 0.25 + t * t * t
    if (x < time) lo = t
    else hi = t
  }
  const t = (lo + hi) / 2
  return 3 * (1 - t) * (1 - t) * t * 0.1 + 3 * (1 - t) * t * t + t * t * t
}

function backgroundAt(
  from: SurfaceColor,
  to: SurfaceColor,
  time: number,
  backdrop: RgbColor,
): RgbColor {
  const p = ease(time),
    a = from.a + (to.a - from.a) * p
  if (from.lab || to.lab) {
    const first = from.lab ?? rgbToOklab(from)
    const last = to.lab ?? rgbToOklab(to)
    const channel = (key: 'l' | 'a' | 'b') =>
      a > 0 ? (first[key] * from.a * (1 - p) + last[key] * to.a * p) / a : 0
    const color = oklabToRgb({ l: channel('l'), a: channel('a'), b: channel('b') })
    return {
      r: Math.round(color.r * a + backdrop.r * (1 - a)),
      g: Math.round(color.g * a + backdrop.g * (1 - a)),
      b: Math.round(color.b * a + backdrop.b * (1 - a)),
    }
  }
  // CSS color transitions interpolate premultiplied channels when alpha differs.
  const channel = (key: 'r' | 'g' | 'b') => {
    const premultiplied = from[key] * from.a * (1 - p) + to[key] * to.a * p
    return Math.round(premultiplied + backdrop[key] * (1 - a))
  }
  return { r: channel('r'), g: channel('g'), b: channel('b') }
}

/** Plan only discrete color changes; no foreground work is performed per animation frame. */
export function planAlbumForeground(
  from: SurfaceColor,
  to: SurfaceColor,
  backdrop: RgbColor,
  choices: Record<string, ForegroundChoice>,
  backdropTransition?: { from: SurfaceColor; to: SurfaceColor; offset: number; scale: number },
): ForegroundStep[] {
  const white = { r: 255, g: 255, b: 255 },
    black = { r: 0, g: 0, b: 0 }
  const at = (time: number): Record<string, string> => {
    const currentBackdrop = backdropTransition
      ? backgroundAt(
          backdropTransition.from,
          backdropTransition.to,
          Math.max(0, Math.min(1, backdropTransition.offset + time * backdropTransition.scale)),
          backdrop,
        )
      : backdrop
    const background = backgroundAt(from, to, time, currentBackdrop)
    return Object.fromEntries(
      Object.entries(choices).map(([name, choice]) => {
        const chosen =
          getContrastRatio(choice.target, background) >= 4.58
            ? choice.target
            : getContrastRatio(choice.preferred, background) >= 4.9
              ? choice.preferred
              : getContrastRatio(white, background) >= getContrastRatio(black, background)
                ? white
                : black
        return [name, `rgb(${chosen.r} ${chosen.g} ${chosen.b})`]
      }),
    )
  }
  const steps: ForegroundStep[] = [{ offset: 0, colors: at(0) }]
  let previous = JSON.stringify(steps[0].colors)
  for (let i = 1; i <= 128; i++) {
    const time = i / 128,
      colors = at(time),
      next = JSON.stringify(colors)
    if (next === previous) continue
    let lo = (i - 1) / 128,
      hi = time
    for (let j = 0; j < 10; j++) {
      const mid = (lo + hi) / 2
      if (JSON.stringify(at(mid)) === previous) lo = mid
      else hi = mid
    }
    const exact = at(hi)
    steps.push({ offset: hi, colors: exact })
    previous = JSON.stringify(exact)
  }
  return steps
}
