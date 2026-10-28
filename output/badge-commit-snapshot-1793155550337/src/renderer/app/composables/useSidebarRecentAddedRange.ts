import { computed, nextTick, ref, watch } from 'vue'
import type { Router, RouteLocationNormalizedLoaded, RouteLocationRaw } from 'vue-router'
import {
  parseRecentAddedLibraryRange,
  type RecentAddedLibraryRange,
} from '@renderer/features/library/utils/recentAddedLibrary'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { pointReference, startFloatingPosition } from '@renderer/shared/floating/floatingPosition'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'
import { resolveRestorableFocusTarget } from '../utils/sidebarModalFocus'
import { onMenuKeydown } from '../utils/sidebarMenuKeyboard'

interface SidebarRecentAddedRangeOptions {
  route: Pick<RouteLocationNormalizedLoaded, 'path' | 'name' | 'query' | 'hash'>
  router: Pick<Router, 'replace'>
  onBeforeOpen: () => void
}

export function useSidebarRecentAddedRange({
  route,
  router,
  onBeforeOpen,
}: SidebarRecentAddedRangeOptions) {
  const recentAddedContextMenu = ref<{ x: number; y: number } | null>(null)
  const recentAddedContextPanel = ref<HTMLElement | null>(null)
  const recentAddedContextTrigger = ref<HTMLElement | null>(null)
  const recentAddedContextPositioned = ref(false)
  const recentAddedRangeSelectorOpen = ref(false)
  const recentAddedRangeSelectorPanel = ref<HTMLElement | null>(null)
  const recentAddedRangeOptions = [
    { value: 7, label: 'sidebar.recentAddedRange7Days' },
    { value: 30, label: 'sidebar.recentAddedRange30Days' },
    { value: 90, label: 'sidebar.recentAddedRange90Days' },
    { value: 'all', label: 'sidebar.recentAddedRangeAll' },
  ] as const
  const recentAddedRange = ref<RecentAddedLibraryRange>('all')
  const recentAddedRangeDraft = ref<RecentAddedLibraryRange | null>(null)
  const selectedRecentAddedRange = computed(() => {
    const range = recentAddedRangeDraft.value ?? recentAddedRange.value
    return recentAddedRangeOptions.some((option) => option.value === range) ? range : 'custom'
  })
  const recentAddedRangeSliderValue = ref(recentAddedRangeOptions.length - 1)
  let committedRecentAddedSliderValue = recentAddedRangeSliderValue.value
  const recentAddedRangeSliderFill = computed(
    () => `${(recentAddedRangeSliderValue.value / (recentAddedRangeOptions.length - 1)) * 100}%`,
  )
  const customRecentAddedDays = ref<number | ''>('')
  let committedCustomRecentAddedDays: number | '' = ''
  let recentAddedRangeNavigationId = 0
  watch(
    [() => route.name, () => route.query.range],
    () => {
      if (route.name === 'recent-added') {
        syncRecentAddedRange(parseRecentAddedLibraryRange(route.query.range) ?? 'all')
      }
    },
    { immediate: true },
  )
  let recentAddedContextPosition: ReturnType<typeof startFloatingPosition> | undefined
  watch(
    recentAddedContextMenu,
    () => {
      recentAddedContextPosition?.dispose()
      recentAddedContextPositioned.value = false
    },
    { flush: 'sync' },
  )
  watch(
    [recentAddedContextMenu, recentAddedContextPanel],
    (_values, _previous, onCleanup) => {
      const menu = recentAddedContextMenu.value
      const panel = recentAddedContextPanel.value
      if (!menu || !panel) return
      const session = startFloatingPosition({
        reference: pointReference(menu.x, menu.y),
        floating: panel,
        profile: 'point-menu',
        onPosition: () => {
          recentAddedContextPositioned.value = true
        },
        onError: closeRecentAddedContextMenu,
      })
      recentAddedContextPosition = session
      onCleanup(session.dispose)
    },
    { flush: 'post' },
  )
  function getPrimaryNavTarget(path: string): RouteLocationRaw {
    if (path !== '/recent-added') return path
    return {
      path,
      query: {
        ...(route.name === 'recent-added' ? route.query : {}),
        range: String(recentAddedRange.value),
      },
      hash: route.name === 'recent-added' ? route.hash : '',
    }
  }
  function onRecentAddedContextMenuKeydown(event: KeyboardEvent): void {
    if (!recentAddedRangeSelectorOpen.value) {
      onMenuKeydown(event)
    }
  }
  function openRecentAddedContextMenu(x: number, y: number, trigger: HTMLElement | null): void {
    onBeforeOpen()
    recentAddedRangeSelectorOpen.value = false
    recentAddedContextTrigger.value = trigger
    recentAddedContextMenu.value = { x, y }
  }
  function closeRecentAddedContextMenu(): void {
    recentAddedRangeSelectorOpen.value = false
    syncRecentAddedRange(recentAddedRange.value)
    customRecentAddedDays.value = committedCustomRecentAddedDays
    recentAddedContextMenu.value = null
  }
  async function openRecentAddedRangeSelector(): Promise<void> {
    recentAddedRangeSelectorOpen.value = true
    await nextTick()
    recentAddedRangeSelectorPanel.value
      ?.querySelector<HTMLInputElement>('input[type="range"]')
      ?.focus()
  }
  function syncRecentAddedRange(range: RecentAddedLibraryRange): void {
    recentAddedRange.value = range
    recentAddedRangeDraft.value = null
    const index = recentAddedRangeOptions.findIndex((option) => option.value === range)
    if (index >= 0) {
      committedRecentAddedSliderValue = index
      recentAddedRangeSliderValue.value = index
    } else if (typeof range === 'number') {
      recentAddedRangeSliderValue.value = committedRecentAddedSliderValue
      committedCustomRecentAddedDays = range
      customRecentAddedDays.value = range
    }
  }
  function applyRecentAddedRange(range: RecentAddedLibraryRange): void {
    if (route.name !== 'recent-added') {
      syncRecentAddedRange(range)
      return
    }
    recentAddedRangeDraft.value = range
    const navigationId = ++recentAddedRangeNavigationId
    void router
      .replace({ query: { ...route.query, range: String(range) }, hash: route.hash })
      .then(() => {
        if (navigationId === recentAddedRangeNavigationId && route.name === 'recent-added') {
          syncRecentAddedRange(parseRecentAddedLibraryRange(route.query.range) ?? 'all')
        }
      })
      .catch((error) => {
        if (navigationId === recentAddedRangeNavigationId && route.name === 'recent-added') {
          syncRecentAddedRange(parseRecentAddedLibraryRange(route.query.range) ?? 'all')
        }
        rendererDiagnostics.error({
          scope: 'sidebar.recent-added',
          message: 'Failed to update recently added range',
          cause: error,
        })
      })
  }
  function selectRecentAddedRangeBySlider(event: Event): void {
    const sliderValue = Number((event.target as HTMLInputElement).value)
    const option = recentAddedRangeOptions[sliderValue]
    if (!option) {
      syncRecentAddedRange(recentAddedRange.value)
      return
    }
    if (route.name !== 'recent-added') {
      syncRecentAddedRange(option.value)
      return
    }
    recentAddedRangeSliderValue.value = sliderValue
    recentAddedRangeDraft.value = option.value
  }
  function commitRecentAddedRangeBySlider(event: Event): void {
    const option = recentAddedRangeOptions[Number((event.target as HTMLInputElement).value)]
    if (!option) {
      syncRecentAddedRange(recentAddedRange.value)
      return
    }
    applyRecentAddedRange(option.value)
  }
  function applyCustomRecentAddedRange(): void {
    const days = parseRecentAddedLibraryRange(customRecentAddedDays.value)
    if (typeof days === 'number') {
      committedCustomRecentAddedDays = days
      applyRecentAddedRange(days)
    } else {
      customRecentAddedDays.value = committedCustomRecentAddedDays
    }
  }
  function onPrimaryNavContextMenu(item: { to: string }, event: MouseEvent): void {
    if (item.to !== '/recent-added') return
    event.preventDefault()
    event.stopPropagation()
    openRecentAddedContextMenu(
      event.clientX,
      event.clientY,
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
    )
  }
  function onPrimaryNavKeydown(item: { to: string }, event: KeyboardEvent): void {
    if (
      item.to !== '/recent-added' ||
      (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey))
    )
      return

    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return
    const rect = target.getBoundingClientRect()
    openRecentAddedContextMenu(rect.left + rect.width / 2, rect.top + rect.height / 2, target)
  }
  useOverlayFocusTrap({
    isOpen: () => recentAddedContextMenu.value !== null && recentAddedContextPositioned.value,
    container: recentAddedContextPanel,
    initialFocus: () =>
      recentAddedContextPanel.value?.querySelector<HTMLButtonElement>('button') ??
      recentAddedContextPanel.value ??
      undefined,
    onEscape: closeRecentAddedContextMenu,
    restoreFocus: () => resolveRestorableFocusTarget(recentAddedContextTrigger.value)?.focus(),
  })
  return {
    recentAddedContextMenu,
    recentAddedContextPanel,
    recentAddedRangeSelectorOpen,
    recentAddedRangeSelectorPanel,
    recentAddedRangeOptions,
    recentAddedRangeSliderValue,
    recentAddedRangeSliderFill,
    selectedRecentAddedRange,
    customRecentAddedDays,
    getPrimaryNavTarget,
    onRecentAddedContextMenuKeydown,
    closeRecentAddedContextMenu,
    openRecentAddedRangeSelector,
    selectRecentAddedRangeBySlider,
    commitRecentAddedRangeBySlider,
    applyCustomRecentAddedRange,
    onPrimaryNavContextMenu,
    onPrimaryNavKeydown,
  }
}
