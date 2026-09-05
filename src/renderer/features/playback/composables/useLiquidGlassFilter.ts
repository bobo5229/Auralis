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
import { usePlayerBarMaterial } from '@renderer/features/settings/composables/usePlayerBarMaterial'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import {
  getDisplacementFilter,
  supportsBackdropFilterUrlSyntax,
} from '@renderer/features/playback/utils/liquidGlassDisplacementMap'
import type { PlayerSurfacePresentation } from '@renderer/app/utils/playerSurfacePresentation'

export interface LiquidGlassFilterConfig {
  presentation: Ref<PlayerSurfacePresentation> | PlayerSurfacePresentation
  radius?: number
  depth?: number
  strength?: number
  chromaticAberration?: number
  brightness?: number
  saturate?: number
  forceEnableSyntax?: boolean
}

export function resolveIsLiquidGlassActive(
  presentation: PlayerSurfacePresentation,
  material: string,
  displayMode: string,
  syntaxSupported = supportsBackdropFilterUrlSyntax(),
): boolean {
  return (
    presentation === 'modern' &&
    displayMode === 'normal' &&
    material === 'liquid-glass' &&
    syntaxSupported
  )
}

export function useLiquidGlassFilter(
  targetRef: Ref<HTMLElement | null>,
  config: LiquidGlassFilterConfig,
) {
  const { playerBarMaterial } = usePlayerBarMaterial()
  const { displayMode } = usePlayerDisplayMode()

  const radius = config.radius ?? 16
  const depth = config.depth ?? 10
  const strength = config.strength ?? 40
  const chromaticAberration = config.chromaticAberration ?? 2
  const brightness = config.brightness ?? 1.08
  const saturate = config.saturate ?? 1.4
  const syntaxSupported = config.forceEnableSyntax ?? supportsBackdropFilterUrlSyntax()

  const isModern = computed(() => unref(config.presentation) === 'modern')
  const isNormalDisplay = computed(() => displayMode.value === 'normal')

  const isLiquidGlassActive = computed(() =>
    resolveIsLiquidGlassActive(
      unref(config.presentation),
      playerBarMaterial.value,
      displayMode.value,
      syntaxSupported,
    ),
  )

  const filterUrl = ref<string | null>(null)
  let resizeObserver: ResizeObserver | null = null

  function updateFilter(): void {
    if (!isLiquidGlassActive.value) {
      filterUrl.value = null
      return
    }

    const el = targetRef.value
    if (!el) return

    const width = Math.round(
      el.clientWidth || (typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect().width : 0) || 0,
    )
    const height = Math.round(
      el.clientHeight || (typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect().height : 0) || 0,
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
    if (!isLiquidGlassActive.value || !filterUrl.value) return {}
    return {
      backdropFilter: `url('${filterUrl.value}') brightness(${brightness}) saturate(${saturate})`,
      WebkitBackdropFilter: `url('${filterUrl.value}') brightness(${brightness}) saturate(${saturate})`,
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

  watch(
    () => [playerBarMaterial.value, isLiquidGlassActive.value],
    () => {
      void nextTick(() => updateFilter())
    },
  )

  return {
    isLiquidGlassActive,
    liquidFilterStyle,
    updateFilter,
  }
}
