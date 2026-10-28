import { onScopeDispose, watch, type Ref } from 'vue'
import { liquidGlass, type LiquidGlassHandle, type LiquidGlassOptions } from './liquidGlass'

/** Wait until a slider settles before rebuilding the displacement map. */
export const LIQUID_GLASS_REFRESH_DELAY_MS = 80

export interface OpaqueSurfaceQuery {
  readonly matches: boolean
  subscribe(listener: () => void): () => void
  dispose?(): void
}

const OPAQUE_SURFACE_QUERIES = [
  '(prefers-reduced-transparency: reduce)',
  '(prefers-contrast: more)',
]

export function createOpaqueSurfaceQuery(
  match: typeof globalThis.matchMedia | undefined = globalThis.matchMedia,
): OpaqueSurfaceQuery {
  if (typeof match !== 'function') {
    return { matches: false, subscribe: () => () => {} }
  }
  const queries = OPAQUE_SURFACE_QUERIES.map((query) => match(query))
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of listeners) listener()
  }
  for (const query of queries) query.addEventListener('change', notify)
  return {
    get matches() {
      return queries.some((query) => query.matches)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      for (const query of queries) query.removeEventListener('change', notify)
      listeners.clear()
    },
  }
}

/**
 * Runs liquid glass while the surface is allowed to refract.
 * Omitted options keep the library defaults. A live filter waits briefly
 * before rebuilding so a slider drag does not regenerate the map on every tick.
 */
export function useLiquidGlassEffect(
  element: Ref<HTMLElement | null>,
  active: Ref<boolean>,
  opaqueSurface: OpaqueSurfaceQuery = createOpaqueSurfaceQuery(),
  options?: Ref<LiquidGlassOptions | undefined>,
): void {
  let handle: LiquidGlassHandle | null = null
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  function stop(): void {
    handle?.destroy()
    handle = null
  }

  function clearRefresh(): void {
    if (refreshTimer === null) return
    clearTimeout(refreshTimer)
    refreshTimer = null
  }

  function attach(): void {
    stop()
    if (!active.value || opaqueSurface.matches || !element.value) return
    const next = options?.value
    handle = next ? liquidGlass(element.value, next) : liquidGlass(element.value)
  }

  function sync(immediate: boolean): void {
    clearRefresh()
    if (immediate || handle === null) {
      attach()
      return
    }
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      attach()
    }, LIQUID_GLASS_REFRESH_DELAY_MS)
  }

  watch([element, active], () => sync(true), { immediate: true, flush: 'post' })
  if (options) watch(options, () => sync(false), { flush: 'post' })
  const unsubscribe = opaqueSurface.subscribe(() => sync(true))
  onScopeDispose(() => {
    unsubscribe()
    clearRefresh()
    stop()
    opaqueSurface.dispose?.()
  })
}
