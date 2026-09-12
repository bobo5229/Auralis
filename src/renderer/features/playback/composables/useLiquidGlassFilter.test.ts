import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

vi.mock('@renderer/features/playback/composables/usePlayerDisplayMode', () => ({
  usePlayerDisplayMode: () => ({
    displayMode: ref<'normal' | 'fullscreen' | 'mini'>('normal'),
  }),
}))

import { resolveIsLiquidGlassActive, useLiquidGlassFilter } from './useLiquidGlassFilter'
import { usePlayerBarMaterial } from '@renderer/features/settings/composables/usePlayerBarMaterial'

describe('resolveIsLiquidGlassActive', () => {
  it('returns true only for liquid-glass material, normal display, and supported syntax', () => {
    expect(resolveIsLiquidGlassActive('liquid-glass', 'normal', true)).toBe(true)
    expect(resolveIsLiquidGlassActive('cover-tint', 'normal', true)).toBe(false)
    expect(resolveIsLiquidGlassActive('liquid-glass', 'fullscreen', true)).toBe(false)
    expect(resolveIsLiquidGlassActive('liquid-glass', 'normal', false)).toBe(false)
  })
})

describe('useLiquidGlassFilter', () => {
  it('activates and generates valid backdropFilter style when active and target element has dimensions', async () => {
    const el = {
      clientWidth: 360,
      clientHeight: 400,
      getBoundingClientRect: () => ({ width: 360, height: 400 }) as DOMRect,
    } as unknown as HTMLElement

    const target = ref<HTMLElement | null>(el)
    const { setPlayerBarMaterial } = usePlayerBarMaterial()
    setPlayerBarMaterial('liquid-glass')

    const { isLiquidGlassActive, liquidFilterStyle, updateFilter } = useLiquidGlassFilter(target, {
      radius: 16,
      depth: 8,
      strength: 40,
      chromaticAberration: 2,
      forceEnableSyntax: true,
    })

    expect(isLiquidGlassActive.value).toBe(true)

    updateFilter()
    await nextTick()

    expect(liquidFilterStyle.value.backdropFilter).toContain('url(')
    expect(liquidFilterStyle.value.backdropFilter).toContain('brightness(1.08)')
    expect(liquidFilterStyle.value.backdropFilter).toContain('saturate(1.4)')
  })

  it('includes blur in backdropFilter and WebkitBackdropFilter when blur option is provided', async () => {
    const el = {
      clientWidth: 360,
      clientHeight: 400,
      getBoundingClientRect: () => ({ width: 360, height: 400 }) as DOMRect,
    } as unknown as HTMLElement

    const target = ref<HTMLElement | null>(el)
    const { setPlayerBarMaterial } = usePlayerBarMaterial()
    setPlayerBarMaterial('liquid-glass')

    const { liquidFilterStyle, updateFilter } = useLiquidGlassFilter(target, {
      blur: 16,
      forceEnableSyntax: true,
    })

    updateFilter()
    await nextTick()

    expect(liquidFilterStyle.value.backdropFilter).toContain('blur(16px)')
    expect(liquidFilterStyle.value.WebkitBackdropFilter).toContain('blur(16px)')
    expect(liquidFilterStyle.value.backdropFilter).toMatch(
      /url\('.+'\) blur\(16px\) brightness\(1\.08\) saturate\(1\.4\)/,
    )
  })
})
