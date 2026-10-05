export interface LiquidMetalSettings {
  speed: number
  folds: number
  roughness: number
}

export const DEFAULT_LIQUID_METAL_SETTINGS: Readonly<LiquidMetalSettings> = {
  speed: 0.7,
  folds: 1.15,
  roughness: 0.12,
}

export const LIQUID_METAL_RANGES = {
  speed: { min: 0.15, max: 1.8, step: 0.05 },
  folds: { min: 0.65, max: 2.2, step: 0.05 },
  roughness: { min: 0.04, max: 0.35, step: 0.01 },
} as const

export function resolveLiquidMetalSettings(
  next: Partial<LiquidMetalSettings>,
  previous: Readonly<LiquidMetalSettings> = DEFAULT_LIQUID_METAL_SETTINGS,
): LiquidMetalSettings {
  const result = { ...previous }
  for (const key of ['speed', 'folds', 'roughness'] as const) {
    const value = next[key]
    if (value === undefined || !Number.isFinite(value)) continue
    const range = LIQUID_METAL_RANGES[key]
    result[key] = Math.min(range.max, Math.max(range.min, value))
  }
  return result
}
