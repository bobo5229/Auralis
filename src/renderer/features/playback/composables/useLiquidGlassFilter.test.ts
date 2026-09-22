import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'

import { useLiquidGlassRefraction } from './useLiquidGlassFilter'

describe('useLiquidGlassRefraction styles', () => {
  it('activates and generates valid backdropFilter style when active and target element has dimensions', async () => {
    const el = {
      clientWidth: 360,
      clientHeight: 400,
      getBoundingClientRect: () => ({ width: 360, height: 400 }) as DOMRect,
    } as unknown as HTMLElement

    const target = ref<HTMLElement | null>(el)
    const { isActive, liquidFilterStyle, updateFilter } = useLiquidGlassRefraction(target, {
      active: true,
      radius: 16,
      depth: 8,
      strength: 40,
      chromaticAberration: 2,
    })

    expect(isActive.value).toBe(true)

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
    const { liquidFilterStyle, updateFilter } = useLiquidGlassRefraction(target, {
      active: true,
      blur: 16,
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

describe('useLiquidGlassRefraction', () => {
  it('generates displacement backdropFilter and clears it when disabled', async () => {
    const el = {
      clientWidth: 240,
      clientHeight: 320,
      getBoundingClientRect: () => ({ width: 240, height: 320 }) as DOMRect,
    } as unknown as HTMLElement

    const target = ref<HTMLElement | null>(el)
    const active = ref(true)
    const { isActive, liquidFilterStyle, updateFilter } = useLiquidGlassRefraction(target, {
      active,
      radius: 20,
      depth: 10,
      strength: 50,
      chromaticAberration: 2,
      brightness: 1.08,
      saturate: 1.28,
    })

    updateFilter()
    await nextTick()

    expect(isActive.value).toBe(true)
    expect(liquidFilterStyle.value.backdropFilter).toContain('url(')
    expect(liquidFilterStyle.value.backdropFilter).toContain('#displace')
    expect(liquidFilterStyle.value.backdropFilter).toContain('brightness(1.08)')
    expect(liquidFilterStyle.value.backdropFilter).toContain('saturate(1.28)')
    expect(liquidFilterStyle.value.WebkitBackdropFilter).toContain('url(')

    active.value = false
    await nextTick()
    expect(isActive.value).toBe(false)
    expect(liquidFilterStyle.value).toEqual({})
  })
})
