import { getRelativeLuminance, oklabToRgb, rgbToOklab } from '@renderer/shared/color/colorMath'
import type { RgbColor } from '@renderer/shared/color/types'
import type { SurfaceColor } from '@renderer/shared/color/surfaceColor'
export { parseSurfaceColor } from '@renderer/shared/color/surfaceColor'

export interface ForegroundChoice {
  target: RgbColor
  preferred: RgbColor
}
export interface ForegroundStep {
  offset: number
  colors: Record<string, string>
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
  // Foreground candidates stay fixed throughout the transition. Convert them once,
  // rather than repeating color-space conversions at every sampled threshold.
  const candidates = Object.entries(choices).map(([name, choice]) => ({
    name,
    target: getRelativeLuminance(choice.target),
    preferred: getRelativeLuminance(choice.preferred),
    targetCss: `rgb(${choice.target.r} ${choice.target.g} ${choice.target.b})`,
    preferredCss: `rgb(${choice.preferred.r} ${choice.preferred.g} ${choice.preferred.b})`,
  }))
  const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
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
    const luminance = getRelativeLuminance(background)
    return Object.fromEntries(
      candidates.map((choice) => {
        const chosen =
          contrast(choice.target, luminance) >= 4.58
            ? choice.targetCss
            : contrast(choice.preferred, luminance) >= 4.9
              ? choice.preferredCss
              : contrast(1, luminance) >= contrast(0, luminance)
                ? 'rgb(255 255 255)'
                : 'rgb(0 0 0)'
        return [choice.name, chosen]
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
