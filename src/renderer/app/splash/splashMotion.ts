/** 「一声成形」：与已确认的 demo 保持相同的形状、阶段和节奏。 */
export const SPLASH_FORMATION_MS = 900
export const SPLASH_RESONANCE_PATH = 'M17 38C23 29.5 28 45.5 34 37.5S42 32 47 38'

const clamp = (value: number): number => Math.max(0, Math.min(1, value))
const ease = (value: number): number => 1 - (1 - clamp(value)) ** 3

export function getSplashMotionFrame(milliseconds: number): {
  wavePath: string
  waveOpacity: number
  legProgress: number
  joined: boolean
  brandOpacity: number
  brandOffset: number
} {
  const elapsed = Math.max(0, Math.min(SPLASH_FORMATION_MS, milliseconds))
  const spread = ease(elapsed / 240)
  const shape = ease((elapsed - 45) / 260)
  const settle = clamp((elapsed - 610) / 250)
  const amplitude = shape + Math.sin(settle * Math.PI * 2) * 0.12 * (1 - settle) ** 2
  const x = (value: number): string => (32 + (value - 32) * (0.12 + spread * 0.88)).toFixed(3)
  const y = (value: number): string => (38 + (value - 38) * amplitude).toFixed(3)
  const brandOpacity = ease((elapsed - 570) / 280)
  return {
    wavePath:
      elapsed >= 860
        ? SPLASH_RESONANCE_PATH
        : `M${x(17)} 38C${x(23)} ${y(29.5)} ${x(28)} ${y(45.5)} ${x(34)} ${y(37.5)}S${x(42)} ${y(32)} ${x(47)} 38`,
    waveOpacity: ease(elapsed / 90),
    legProgress: ease((elapsed - 200) / 420),
    joined: elapsed >= 620,
    brandOpacity,
    brandOffset: (1 - brandOpacity) * 4,
  }
}
