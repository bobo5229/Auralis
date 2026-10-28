import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import type { LibraryStats } from '@shared/types/app'
import { useSidebarFlavor } from './useSidebarFlavor'

interface SidebarFlavorLabelOptions {
  isRail: Readonly<Ref<boolean>>
  libraryStats: Readonly<Ref<LibraryStats>>
  t: (key: string, values: { count: number }) => string
}

export function useSidebarFlavorLabel({ isRail, libraryStats, t }: SidebarFlavorLabelOptions) {
  const isFlavorHovered = ref(false)
  const isFlavorFocused = ref(false)
  const flavor = useSidebarFlavor(
    computed(() => !isRail.value),
    computed(() => isFlavorHovered.value || isFlavorFocused.value),
  )
  const flavorValues = computed(() => ({ count: libraryStats.value.trackCount }))
  const flavorLabel = computed(() => t(`sidebar.flavor.${flavor.key.value}`, flavorValues.value))
  const flavorLabelRef = ref<HTMLElement | null>(null)
  const flavorTextRef = ref<HTMLElement | null>(null)
  const isFlavorOverflowing = ref(false)
  const flavorOverflowDistance = ref(0)
  function updateFlavorOverflow(): void {
    if (isRail.value || !flavorLabelRef.value || !flavorTextRef.value) {
      isFlavorOverflowing.value = false
      flavorOverflowDistance.value = 0
      return
    }
    const containerWidth = flavorLabelRef.value.clientWidth
    const contentWidth = flavorTextRef.value.scrollWidth
    if (contentWidth > containerWidth + 4) {
      isFlavorOverflowing.value = true
      flavorOverflowDistance.value = contentWidth - containerWidth
    } else {
      isFlavorOverflowing.value = false
      flavorOverflowDistance.value = 0
    }
  }
  useResizeObserver(flavorLabelRef, updateFlavorOverflow)
  const flavorMarqueeStyle = computed(() => {
    if (!isFlavorOverflowing.value) return undefined
    const duration = Math.max(7, Math.round(flavorOverflowDistance.value / 18))
    return {
      '--flavor-scroll-distance': `${flavorOverflowDistance.value}px`,
      '--flavor-scroll-duration': `${duration}s`,
    }
  })
  watch([() => flavorLabel.value, isRail], () => {
    void nextTick(updateFlavorOverflow)
  })
  onMounted(() => {
    void nextTick(updateFlavorOverflow)
    window.addEventListener('resize', updateFlavorOverflow)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', updateFlavorOverflow)
  })
  return {
    isFlavorHovered,
    isFlavorFocused,
    flavorLabel,
    flavorLabelRef,
    flavorTextRef,
    isFlavorOverflowing,
    flavorMarqueeStyle,
  }
}
