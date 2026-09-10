import {
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'
import { MODERN_PLAYER_BAR_MAX_WIDTH_PX } from '@renderer/features/playback/utils/modernPlayerBarLayout'

export function readIslandInlineSize(
  entry: Pick<ResizeObserverEntry, 'borderBoxSize' | 'contentRect'> | undefined,
  fallbackWidth: number,
): number {
  return entry?.borderBoxSize?.[0]?.inlineSize ?? entry?.contentRect.width ?? fallbackWidth
}

export function usePlayerBarIslandMetrics(options: {
  islandRef: Ref<HTMLElement | null>
  hostRef: Ref<HTMLElement | null>
  enabled: MaybeRefOrGetter<boolean>
  onIslandSizeChange?: () => void
}): {
  islandInlineSize: Ref<number>
  measureHostInlineSize: () => number
} {
  const islandInlineSize = ref(MODERN_PLAYER_BAR_MAX_WIDTH_PX)
  const hostInlineSize = ref(Number.POSITIVE_INFINITY)
  let islandResizeObserver: ResizeObserver | null = null

  function syncIslandInlineSize(width: number): void {
    if (!Number.isFinite(width) || width <= 0) return
    islandInlineSize.value = width
    options.onIslandSizeChange?.()
  }

  function bindIslandObserver(): void {
    islandResizeObserver?.disconnect()
    islandResizeObserver = null
    const el = options.islandRef.value
    if (!el || !toValue(options.enabled)) return

    islandResizeObserver = new ResizeObserver((entries) => {
      const size = readIslandInlineSize(entries[0], el.clientWidth)
      syncIslandInlineSize(size)
    })
    islandResizeObserver.observe(el)
    syncIslandInlineSize(el.getBoundingClientRect().width)
  }

  function unbindIslandObserver(): void {
    islandResizeObserver?.disconnect()
    islandResizeObserver = null
  }

  function measureHostInlineSize(): number {
    const width = options.hostRef.value?.getBoundingClientRect().width
    if (width && Number.isFinite(width) && width > 0) {
      hostInlineSize.value = width
      return width
    }
    return hostInlineSize.value
  }

  watch(
    () => toValue(options.enabled),
    async (shouldObserveIsland) => {
      if (!shouldObserveIsland) {
        unbindIslandObserver()
        return
      }
      await nextTick()
      bindIslandObserver()
    },
    { flush: 'post' },
  )

  onMounted(() => {
    if (toValue(options.enabled)) bindIslandObserver()
  })

  onUnmounted(() => {
    unbindIslandObserver()
  })

  return {
    islandInlineSize,
    measureHostInlineSize,
  }
}
