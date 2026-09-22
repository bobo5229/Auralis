import {
  computed,
  getCurrentInstance,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type CSSProperties,
  type Ref,
  unref,
} from 'vue'
import { getDisplacementFilter } from '@renderer/features/playback/utils/liquidGlassDisplacementMap'

export interface LiquidGlassRefractionConfig {
  active: Ref<boolean> | boolean
  radius?: number
  depth?: number
  strength?: number
  chromaticAberration?: number
  brightness?: number
  saturate?: number
  blur?: number
}

/**
 * Size-bound SVG displacement filter (nikdelvin/liquid-glass). Independent of
 * PlayerBar material so overlays can share the same refraction pipeline.
 */
export function useLiquidGlassRefraction(
  targetRef: Ref<HTMLElement | null>,
  config: LiquidGlassRefractionConfig,
) {
  const radius = config.radius ?? 16
  const depth = config.depth ?? 10
  const strength = config.strength ?? 40
  const chromaticAberration = config.chromaticAberration ?? 2
  const brightness = config.brightness ?? 1.08
  const saturate = config.saturate ?? 1.4
  const blur = config.blur ?? 0

  const isActive = computed(() => unref(config.active))
  const filterUrl = ref<string | null>(null)
  let resizeObserver: ResizeObserver | null = null

  function updateFilter(): void {
    if (!isActive.value) {
      filterUrl.value = null
      return
    }

    const el = targetRef.value
    if (!el) return

    const width = Math.round(
      el.clientWidth ||
        (typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect().width : 0) ||
        0,
    )
    const height = Math.round(
      el.clientHeight ||
        (typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect().height : 0) ||
        0,
    )
    if (width <= 0 || height <= 0) return

    filterUrl.value = getDisplacementFilter({
      width,
      height,
      radius,
      depth,
      strength,
      chromaticAberration,
    })
  }

  const liquidFilterStyle = computed<CSSProperties>(() => {
    if (!isActive.value || !filterUrl.value) return {}
    const blurSegment = blur > 0 ? ` blur(${blur}px)` : ''
    return {
      backdropFilter: `url('${filterUrl.value}')${blurSegment} brightness(${brightness}) saturate(${saturate})`,
      WebkitBackdropFilter: `url('${filterUrl.value}')${blurSegment} brightness(${brightness}) saturate(${saturate})`,
    }
  })

  function bindObserver(): void {
    resizeObserver?.disconnect()
    resizeObserver = null

    const el = targetRef.value
    if (!el || typeof ResizeObserver === 'undefined') return

    resizeObserver = new ResizeObserver(() => {
      updateFilter()
    })
    resizeObserver.observe(el)
    updateFilter()
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      void nextTick(() => {
        bindObserver()
      })
    })

    onUnmounted(() => {
      resizeObserver?.disconnect()
      resizeObserver = null
    })
  }

  watch(
    () => targetRef.value,
    (el) => {
      if (el) {
        void nextTick(() => bindObserver())
      }
    },
  )

  watch(isActive, () => {
    void nextTick(() => updateFilter())
  })

  return {
    isActive,
    liquidFilterStyle,
    updateFilter,
  }
}
