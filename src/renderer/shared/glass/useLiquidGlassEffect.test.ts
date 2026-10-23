import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LIQUID_GLASS_REFRESH_DELAY_MS,
  useLiquidGlassEffect,
  type OpaqueSurfaceQuery,
} from './useLiquidGlassEffect'
import type { LiquidGlassOptions } from './liquidGlass'

const destroy = vi.hoisted(() => vi.fn())
const liquidGlass = vi.hoisted(() => vi.fn(() => ({ supported: true, refresh: vi.fn(), destroy })))

vi.mock('./liquidGlass', () => ({
  liquidGlass,
  LIQUID_GLASS_DEFAULTS: {
    scale: -112,
    chroma: 6,
    border: 0.07,
    mapBlur: 12,
    blur: 3,
    saturate: 1.5,
    radius: null,
    fallbackBlur: 16,
  },
}))

function opaqueQuery(matches: boolean): OpaqueSurfaceQuery & { emit: () => void } {
  let listener: (() => void) | null = null
  return {
    get matches() {
      return matches
    },
    subscribe(next) {
      listener = next
      return () => {
        listener = null
      }
    },
    emit() {
      listener?.()
    },
  }
}

describe('useLiquidGlassEffect', () => {
  beforeEach(() => {
    liquidGlass.mockClear()
    destroy.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the library default strength and removes the filter when the surface turns off', async () => {
    const element = ref<HTMLElement | null>(null)
    const active = ref(false)
    const scope = effectScope()
    scope.run(() => useLiquidGlassEffect(element, active, opaqueQuery(false)))

    expect(liquidGlass).not.toHaveBeenCalled()

    element.value = {} as HTMLElement
    active.value = true
    await nextTick()

    expect(liquidGlass).toHaveBeenCalledTimes(1)
    expect(liquidGlass).toHaveBeenCalledWith(element.value)

    active.value = false
    await nextTick()
    expect(destroy).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('stays off while reduced transparency or higher contrast wants an opaque surface', async () => {
    const element = ref<HTMLElement | null>({} as HTMLElement)
    const active = ref(true)
    const query = opaqueQuery(true)
    const scope = effectScope()
    scope.run(() => useLiquidGlassEffect(element, active, query))
    await nextTick()

    expect(liquidGlass).not.toHaveBeenCalled()
    scope.stop()
  })

  it('rebuilds a live filter with the next optical parameters after the slider settles', async () => {
    vi.useFakeTimers()
    const element = ref<HTMLElement | null>({} as HTMLElement)
    const active = ref(true)
    const options = ref<LiquidGlassOptions | undefined>({
      scale: -112,
      chroma: 6,
      blur: 3,
      saturate: 1.5,
    })
    const scope = effectScope()
    scope.run(() => useLiquidGlassEffect(element, active, opaqueQuery(false), options))
    await nextTick()

    expect(liquidGlass).toHaveBeenCalledTimes(1)
    expect(liquidGlass).toHaveBeenCalledWith(element.value, options.value)

    options.value = { scale: -180, chroma: 10, blur: 1, saturate: 1.8 }
    await nextTick()
    await vi.advanceTimersByTimeAsync(LIQUID_GLASS_REFRESH_DELAY_MS - 1)
    expect(liquidGlass).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(liquidGlass).toHaveBeenCalledTimes(2)
    expect(liquidGlass).toHaveBeenLastCalledWith(element.value, {
      scale: -180,
      chroma: 10,
      blur: 1,
      saturate: 1.8,
    })
    scope.stop()
  })

  it('drops a pending parameter rebuild when the surface turns off', async () => {
    vi.useFakeTimers()
    const element = ref<HTMLElement | null>({} as HTMLElement)
    const active = ref(true)
    const options = ref<LiquidGlassOptions | undefined>({ scale: -112 })
    const scope = effectScope()
    scope.run(() => useLiquidGlassEffect(element, active, opaqueQuery(false), options))
    await nextTick()

    options.value = { scale: -60 }
    await nextTick()
    active.value = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(LIQUID_GLASS_REFRESH_DELAY_MS)

    expect(liquidGlass).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
    scope.stop()
  })
})
