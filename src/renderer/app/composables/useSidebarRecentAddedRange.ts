import type { RouteLocationNormalizedLoaded, RouteLocationRaw } from 'vue-router'
import { useRecentAddedRangeMemory } from '@renderer/features/library/composables/useRecentAddedRange'

export function useSidebarRecentAddedRange({
  route,
}: {
  route: Pick<RouteLocationNormalizedLoaded, 'name' | 'query' | 'hash'>
}) {
  const rememberedRange = useRecentAddedRangeMemory(route)
  function getPrimaryNavTarget(path: string): RouteLocationRaw {
    if (path !== '/recent-added') return path
    return {
      path,
      query: { ...(route.name === 'recent-added' ? route.query : {}), range: rememberedRange() },
      hash: route.name === 'recent-added' ? route.hash : '',
    }
  }
  return { getPrimaryNavTarget }
}
