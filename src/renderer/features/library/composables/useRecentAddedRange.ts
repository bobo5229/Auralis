import { computed, ref, watch } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import {
  parseRecentAddedLibraryRange,
  type RecentAddedLibraryRange,
} from '../utils/recentAddedLibrary'

type RangeRoute = Pick<RouteLocationNormalizedLoaded, 'name' | 'query' | 'hash'>
const rememberedRange = ref<RecentAddedLibraryRange>('all')

export function useRecentAddedRangeMemory(route: RangeRoute) {
  watch(
    () => [route.name, route.query.range],
    () => {
      if (route.name === 'recent-added')
        rememberedRange.value = parseRecentAddedLibraryRange(route.query.range) ?? 'all'
    },
    { immediate: true, flush: 'sync' },
  )
  return () => String(rememberedRange.value)
}

export function useRecentAddedRange(route: RangeRoute, router: Pick<Router, 'replace'>) {
  useRecentAddedRangeMemory(route)
  const range = computed(() => parseRecentAddedLibraryRange(route.query.range) ?? 'all')
  const editing = ref(false)
  const draft = ref<number | string>(30)
  const invalid = ref(false)
  const failed = ref(false)
  const pending = ref(false)
  function cancel() {
    editing.value = false
    invalid.value = false
  }
  watch(() => [route.name, route.query.range], cancel)
  async function select(value: string) {
    if (pending.value) return
    if (value === 'custom') {
      draft.value = typeof range.value === 'number' ? range.value : 30
      invalid.value = false
      failed.value = false
      editing.value = true
      return
    }
    const parsed = parseRecentAddedLibraryRange(value)
    if (parsed === null) return
    pending.value = true
    failed.value = false
    try {
      await router.replace({ query: { ...route.query, range: String(parsed) }, hash: route.hash })
      if (range.value !== parsed) {
        failed.value = true
        return
      }
      cancel()
    } catch {
      failed.value = true
    } finally {
      pending.value = false
    }
  }
  async function apply() {
    const parsed = parseRecentAddedLibraryRange(draft.value)
    invalid.value = typeof parsed !== 'number'
    if (!invalid.value) await select(String(parsed))
  }
  return { range, editing, draft, invalid, failed, pending, select, apply, cancel }
}
