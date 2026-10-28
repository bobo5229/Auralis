import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIQUID_GLASS_DEFAULTS } from '@renderer/shared/glass/liquidGlass'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))

describe('useLiquidGlassParameters', () => {
  const storage = new Map<string, string>()
  const failedKeys = new Set<string>()
  const key = 'auralis-liquid-glass-parameters'

  beforeEach(() => {
    storage.clear()
    failedKeys.clear()
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem: (name: string) => {
        if (failedKeys.has(`read:${name}`)) throw new Error('Read unavailable')
        return storage.get(name) ?? null
      },
      setItem: (name: string, value: string) => {
        if (failedKeys.has(name)) throw new Error('Write unavailable')
        storage.set(name, value)
      },
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('starts at the library defaults and shares later changes', async () => {
    const preference = await import('./useLiquidGlassParameters')
    const first = preference.useLiquidGlassParameters()
    const second = preference.useLiquidGlassParameters()

    expect(first.parameters.value).toEqual({
      scale: LIQUID_GLASS_DEFAULTS.scale,
      chroma: LIQUID_GLASS_DEFAULTS.chroma,
      blur: LIQUID_GLASS_DEFAULTS.blur,
      saturate: LIQUID_GLASS_DEFAULTS.saturate,
    })
    expect(first.atDefaults.value).toBe(true)
    expect(storage.has(key)).toBe(false)

    first.setParameter('scale', -60)
    first.setParameter('saturate', 1.8)
    expect(second.parameters.value).toEqual({
      scale: -60,
      chroma: 6,
      blur: 3,
      saturate: 1.8,
    })
    expect(second.atDefaults.value).toBe(false)
    expect(JSON.parse(storage.get(key) ?? '')).toEqual(second.parameters.value)

    vi.resetModules()
    const restored = (await import('./useLiquidGlassParameters')).useLiquidGlassParameters()
    expect(restored.parameters.value).toEqual({
      scale: -60,
      chroma: 6,
      blur: 3,
      saturate: 1.8,
    })
  })

  it('keeps valid fields and replaces stored values that leave the step grid', async () => {
    storage.set(
      key,
      JSON.stringify({ scale: -180, chroma: 99, blur: 0, saturate: 1.25, border: 0.2 }),
    )
    const { rendererDiagnostics } = await import('@renderer/shared/diagnostics/rendererDiagnostics')
    vi.mocked(rendererDiagnostics.warn).mockClear()
    vi.resetModules()
    const { useLiquidGlassParameters } = await import('./useLiquidGlassParameters')

    expect(useLiquidGlassParameters().parameters.value).toEqual({
      scale: -180,
      chroma: LIQUID_GLASS_DEFAULTS.chroma,
      blur: 0,
      saturate: LIQUID_GLASS_DEFAULTS.saturate,
    })
    expect(rendererDiagnostics.warn).toHaveBeenCalled()
  })

  it('ignores out-of-range and off-step edits', async () => {
    const { useLiquidGlassParameters } = await import('./useLiquidGlassParameters')
    const preference = useLiquidGlassParameters()
    preference.setParameter('blur', 1)
    preference.setParameter('scale', -10)
    preference.setParameter('saturate', 1.55)
    preference.setParameter('chroma', 3.2)

    expect(preference.parameters.value).toEqual({
      scale: LIQUID_GLASS_DEFAULTS.scale,
      chroma: LIQUID_GLASS_DEFAULTS.chroma,
      blur: 1,
      saturate: LIQUID_GLASS_DEFAULTS.saturate,
    })
    expect(JSON.parse(storage.get(key) ?? '')).toEqual({
      scale: LIQUID_GLASS_DEFAULTS.scale,
      chroma: LIQUID_GLASS_DEFAULTS.chroma,
      blur: 1,
      saturate: LIQUID_GLASS_DEFAULTS.saturate,
    })
  })

  it('restores the library defaults and retries a failed save of the same value', async () => {
    const { useLiquidGlassParameters } = await import('./useLiquidGlassParameters')
    const preference = useLiquidGlassParameters()
    preference.setParameter('chroma', 10)
    failedKeys.add(key)
    preference.resetParameters()

    expect(preference.parameters.value).toEqual({
      scale: LIQUID_GLASS_DEFAULTS.scale,
      chroma: LIQUID_GLASS_DEFAULTS.chroma,
      blur: LIQUID_GLASS_DEFAULTS.blur,
      saturate: LIQUID_GLASS_DEFAULTS.saturate,
    })
    expect(preference.persistFailed.value).toBe(true)
    expect(JSON.parse(storage.get(key) ?? '')).toEqual({
      scale: LIQUID_GLASS_DEFAULTS.scale,
      chroma: 10,
      blur: LIQUID_GLASS_DEFAULTS.blur,
      saturate: LIQUID_GLASS_DEFAULTS.saturate,
    })

    preference.resetParameters()
    expect(preference.persistFailed.value).toBe(true)

    failedKeys.delete(key)
    preference.setParameter('chroma', LIQUID_GLASS_DEFAULTS.chroma)
    expect(preference.persistFailed.value).toBe(false)
    expect(preference.atDefaults.value).toBe(true)
  })

  it('falls back to the library defaults when stored parameters cannot be read', async () => {
    failedKeys.add(`read:${key}`)
    const first = await import('./useLiquidGlassParameters')
    expect(first.useLiquidGlassParameters().parameters.value.scale).toBe(
      LIQUID_GLASS_DEFAULTS.scale,
    )

    vi.resetModules()
    failedKeys.delete(`read:${key}`)
    storage.set(key, '{')
    const second = await import('./useLiquidGlassParameters')
    expect(second.useLiquidGlassParameters().parameters.value.scale).toBe(
      LIQUID_GLASS_DEFAULTS.scale,
    )
  })
})
