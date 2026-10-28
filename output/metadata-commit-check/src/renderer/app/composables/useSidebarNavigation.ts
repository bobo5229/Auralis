import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { LibraryStats } from '@shared/types/app'
import type { SidebarIconKind } from '@renderer/shared/components/SidebarIcon.vue'
import { prefetchRouteOnIntent } from '../router/routeWarmup'
import type { WarmableRouteName } from '../router/routeComponentLoaders'

interface SidebarNavigationOptions {
  route: Pick<RouteLocationNormalizedLoaded, 'path' | 'name'>
  libraryStats: Readonly<Ref<LibraryStats>>
  t: (key: string) => string
}

export function useSidebarNavigation({ route, libraryStats, t }: SidebarNavigationOptions) {
  /** Cleans up optimistic nav highlight listeners when a new press starts or the component unmounts. */
  let pendingNavCleanup: (() => void) | null = null
  const POINTER_MOVE_TOLERANCE = 6
  const activePath = ref(route.path)
  const primaryNav = computed<
    Array<{
      to: string
      label: string
      icon: SidebarIconKind
      routeName?: WarmableRouteName
    }>
  >(() => [
    {
      to: '/songs',
      label: t('nav.songs'),
      icon: 'song',
      routeName: 'library',
    },
    {
      to: '/albums',
      label: t('nav.albums'),
      icon: 'albums',
      routeName: 'albums',
    },
    {
      to: '/recent-added',
      label: t('sidebar.recentAdded'),
      icon: 'recentAdded',
      routeName: 'library',
    },
    {
      to: '/archive',
      label: t('nav.archive'),
      icon: 'archive',
      routeName: 'archive',
    },
  ])
  function isPrimaryNavActive(path: string): boolean {
    return (
      activePath.value === path ||
      (path === '/archive' && route.name === 'archive-annual-summary') ||
      (path === '/albums' && route.name === 'album-detail' && activePath.value === route.path)
    )
  }
  function onRouteIntent(routeName?: WarmableRouteName): void {
    if (routeName) {
      void prefetchRouteOnIntent(routeName)
    }
  }
  const primaryNavItems = computed(() =>
    primaryNav.value.map((item) => ({
      ...item,
      count:
        item.to === '/songs'
          ? libraryStats.value.trackCount
          : item.to === '/albums'
            ? libraryStats.value.albumCount
            : null,
    })),
  )
  watch(
    () => route.path,
    (path) => {
      activePath.value = path
    },
  )
  function setPendingActive(path: string): void {
    activePath.value = path
  }
  function syncActivePathToRoute(): void {
    activePath.value = route.path
  }
  /**
   * Optimistic sidebar highlight on press. Must revert when the press does not
   * complete as a navigation (drag, cancel, release outside) so the active tab
   * never desyncs from the actual route.
   */
  function setPendingActiveFromPointer(event: PointerEvent, path: string): void {
    if (event.button !== 0) {
      return
    }

    pendingNavCleanup?.()
    setPendingActive(path)

    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    let settled = false

    const cleanupListeners = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      if (pendingNavCleanup === settle) {
        pendingNavCleanup = null
      }
    }

    const revertIfStale = () => {
      if (activePath.value === path && route.path !== path) {
        syncActivePathToRoute()
      }
    }

    const settle = (shouldRevert: boolean) => {
      if (settled) return
      settled = true
      cleanupListeners()
      if (shouldRevert) {
        revertIfStale()
      }
    }

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY)
      if (distance > POINTER_MOVE_TOLERANCE) {
        // Drag / long-press move: cancel optimistic highlight; click usually will not navigate.
        settle(true)
      }
    }

    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return
      cleanupListeners()
      // Defer past click + router navigation microtasks; revert if route never matched.
      window.setTimeout(() => {
        settled = true
        revertIfStale()
      }, 0)
    }

    const onCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pointerId) return
      settle(true)
    }

    pendingNavCleanup = () => settle(true)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }
  onBeforeUnmount(() => {
    pendingNavCleanup?.()
    pendingNavCleanup = null
  })
  return {
    activePath,
    primaryNavItems,
    isPrimaryNavActive,
    onRouteIntent,
    setPendingActive,
    setPendingActiveFromPointer,
  }
}
