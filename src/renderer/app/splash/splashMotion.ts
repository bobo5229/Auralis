/** 「一声成形」：与已确认的 demo 保持相同的形状、阶段和节奏。 */
export const SPLASH_FORMATION_MS = 900
export const SPLASH_RESONANCE_PATH = 'M17 38C23 29.5 28 45.5 34 37.5S42 32 47 38'

const clamp = (value: number): number => Math.max(0, Math.min(1, value))
const ease = (value: number): number => 1 - (1 - clamp(value)) ** 3

/** 品牌字「共鸣串联」：逐字出现，末尾 s 回弹并在 Logo 成形结束时落定。 */
export function getSplashBrandCharFrame(
  milliseconds: number,
  index: number,
): {
  opacity: number
  offset: number
  accentPercent: number
} {
  const start = 560 + index * 24
  const progress = ease((milliseconds - start) / 160)
  let offset = (1 - progress) * 7
  if (index === 6) {
    // s 从 704ms 开始，以连续的缓出回弹越过基线约 1px，900ms 速度归零。
    const settle = clamp((milliseconds - start) / (SPLASH_FORMATION_MS - start))
    const remaining = 1 - settle
    offset = settle === 1 ? 0 : 7 * remaining ** 2 * (3.2 * remaining - 2.2)
  }
  const echo =
    progress > 0.15 && progress < 0.75 ? Math.sin(((progress - 0.15) / 0.6) * Math.PI) : 0
  return {
    opacity: progress,
    offset,
    accentPercent: Math.round(echo * 90),
  }
}

export function getSplashMotionFrame(milliseconds: number): {
  wavePath: string
  waveOpacity: number
  legProgress: number
  joined: boolean
} {
  const elapsed = Math.max(0, Math.min(SPLASH_FORMATION_MS, milliseconds))
  const spread = ease(elapsed / 240)
  const shape = ease((elapsed - 45) / 260)
  const settle = clamp((elapsed - 610) / 250)
  const amplitude = shape + Math.sin(settle * Math.PI * 2) * 0.12 * (1 - settle) ** 2
  const x = (value: number): string => (32 + (value - 32) * (0.12 + spread * 0.88)).toFixed(3)
  const y = (value: number): string => (38 + (value - 38) * amplitude).toFixed(3)
  return {
    wavePath:
      elapsed >= 860
        ? SPLASH_RESONANCE_PATH
        : `M${x(17)} 38C${x(23)} ${y(29.5)} ${x(28)} ${y(45.5)} ${x(34)} ${y(37.5)}S${x(42)} ${y(32)} ${x(47)} 38`,
    waveOpacity: ease(elapsed / 90),
    legProgress: ease((elapsed - 200) / 420),
    joined: elapsed >= 620,
  }
}
