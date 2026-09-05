import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

vi.mock('@renderer/features/playback/composables/usePlayerDisplayMode', () => ({
  usePlayerDisplayMode: () => ({
    displayMode: ref<'normal' | 'fullscreen' | 'mini'>('normal'),
  }),
}))

import {
  resolveIsLiquidGlassActive,
  useLiquidGlassFilter,
} from './useLiquidGlassFilter'
import { usePlayerBarMaterial } from '@renderer/features/settings/composables/usePlayerBarMaterial'

describe('resolveIsLiquidGlassActive', () => {
  it('returns true only for modern presentation + liquid-glass material + normal display + syntax supported', () => {
    expect(resolveIsLiquidGlassActive('modern', 'liquid-glass', 'normal', true)).toBe(true)
    expect(resolveIsLiquidGlassActive('manuscript', 'liquid-glass', 'normal', true)).toBe(false)
    expect(resolveIsLiquidGlassActive('modern', 'cover-tint', 'normal', true)).toBe(false)
    expect(resolveIsLiquidGlassActive('modern', 'liquid-glass', 'fullscreen', true)).toBe(false)
    expect(resolveIsLiquidGlassActive('modern', 'liquid-glass', 'normal', false)).toBe(false)
  })
})

describe('useLiquidGlassFilter', () => {
  it('activates and generates valid backdropFilter style when active and target element has dimensions', async () => {
    const el = {
      clientWidth: 360,
      clientHeight: 400,
      getBoundingClientRect: () => ({ width: 360, height: 400 } as DOMRect),
    } as unknown as HTMLElement

    const target = ref<HTMLElement | null>(el)
    const presentation = ref<'modern' | 'manuscript'>('modern')

    const { setPlayerBarMaterial } = usePlayerBarMaterial()
    setPlayerBarMaterial('liquid-glass')

    const { isLiquidGlassActive, liquidFilterStyle, updateFilter } = useLiquidGlassFilter(target, {
      presentation,
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

    presentation.value = 'manuscript'
    await nextTick()
    expect(isLiquidGlassActive.value).toBe(false)
    expect(liquidFilterStyle.value).toEqual({})
  })
})
