import { computed, readonly, ref } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { LIQUID_GLASS_DEFAULTS } from '@renderer/shared/glass/liquidGlass'

export const LIQUID_GLASS_PARAMETERS_KEY = 'auralis-liquid-glass-parameters'
export const LIQUID_GLASS_PARAMETER_FIELDS = ['scale', 'chroma', 'blur', 'saturate'] as const
export type LiquidGlassParameterField = (typeof LIQUID_GLASS_PARAMETER_FIELDS)[number]

export interface LiquidGlassParameters {
  scale: number
  chroma: number
  blur: number
  saturate: number
}

export const LIQUID_GLASS_PARAMETER_LIMITS: Record<
  LiquidGlassParameterField,
  { readonly min: number; readonly max: number; readonly step: number }
> = {
  scale: { min: -180, max: -40, step: 1 },
  chroma: { min: 0, max: 16, step: 1 },
  blur: { min: 0, max: 12, step: 1 },
  saturate: { min: 1, max: 2.2, step: 0.1 },
}

function defaultParameters(): LiquidGlassParameters {
  return {
    scale: LIQUID_GLASS_DEFAULTS.scale,
    chroma: LIQUID_GLASS_DEFAULTS.chroma,
    blur: LIQUID_GLASS_DEFAULTS.blur,
    saturate: LIQUID_GLASS_DEFAULTS.saturate,
  }
}

function warn(message: string, cause?: unknown): void {
  rendererDiagnostics.warn({
    scope: 'appearance.liquid-glass',
    message,
    cause,
  })
}

/** Accept a finite number on the field's step grid. Off-grid and out-of-range values are rejected. */
export function normalizeLiquidGlassParameter(
  raw: unknown,
  field: LiquidGlassParameterField,
): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  const limit = LIQUID_GLASS_PARAMETER_LIMITS[field]
  const places = limit.step < 1 ? 1 : 0
  const steps = Math.round((raw - limit.min) / limit.step)
  const snapped = Number((limit.min + steps * limit.step).toFixed(places))
  if (snapped < limit.min || snapped > limit.max) return null
  if (Math.abs(snapped - raw) > limit.step / 20) return null
  return snapped
}

function readParameters(): LiquidGlassParameters {
  let stored: string | null
  try {
    stored = localStorage.getItem(LIQUID_GLASS_PARAMETERS_KEY)
  } catch (cause) {
    warn('Could not read liquid glass parameters', cause)
    return defaultParameters()
  }
  if (stored === null) return defaultParameters()

  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch (cause) {
    warn('Could not read liquid glass parameters', cause)
    return defaultParameters()
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    warn('Could not read liquid glass parameters')
    return defaultParameters()
  }

  const record = parsed as Record<string, unknown>
  const next = defaultParameters()
  let dropped = false
  for (const field of LIQUID_GLASS_PARAMETER_FIELDS) {
    if (record[field] === undefined) continue
    const normalized = normalizeLiquidGlassParameter(record[field], field)
    if (normalized === null) {
      dropped = true
      continue
    }
    next[field] = normalized
  }
  if (dropped) warn('Could not read liquid glass parameters')
  return next
}

const parameters = ref<LiquidGlassParameters>(readParameters())
const persistFailed = ref(false)
const atDefaults = computed(() =>
  LIQUID_GLASS_PARAMETER_FIELDS.every(
    (field) => parameters.value[field] === LIQUID_GLASS_DEFAULTS[field],
  ),
)

function write(next: LiquidGlassParameters): void {
  parameters.value = next
  try {
    localStorage.setItem(
      LIQUID_GLASS_PARAMETERS_KEY,
      JSON.stringify({
        scale: next.scale,
        chroma: next.chroma,
        blur: next.blur,
        saturate: next.saturate,
      }),
    )
    persistFailed.value = false
  } catch (cause) {
    persistFailed.value = true
    warn('Could not save liquid glass parameters; keeping them for this session', cause)
  }
}

function setParameter(field: LiquidGlassParameterField, value: number): void {
  const normalized = normalizeLiquidGlassParameter(value, field)
  if (normalized === null) return
  if (parameters.value[field] === normalized && !persistFailed.value) return
  write({ ...parameters.value, [field]: normalized })
}

function resetParameters(): void {
  const next = defaultParameters()
  if (atDefaults.value && !persistFailed.value) return
  write(next)
}

export function useLiquidGlassParameters() {
  return {
    parameters: readonly(parameters),
    persistFailed: readonly(persistFailed),
    atDefaults: readonly(atDefaults),
    setParameter,
    resetParameters,
  }
}
