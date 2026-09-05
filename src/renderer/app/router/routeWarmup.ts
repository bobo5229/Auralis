import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import {
  defaultRouteLoaderRegistry,
  PRIMARY_WARMABLE_ROUTES,
  type RouteComponentModule,
  type WarmableRouteName,
} from './routeComponentLoaders'

export type WarmupTrigger = 'intent' | 'idle'

export interface IdleDeadlineLike {
  readonly didTimeout: boolean
  timeRemaining(): number
}

export type IdleCallbackHandle = number
export type IdleCallback = (deadline: IdleDeadlineLike) => void

export interface IdleScheduler {
  requestIdleCallback(callback: IdleCallback, options?: { timeout?: number }): IdleCallbackHandle
  cancelIdleCallback(handle: IdleCallbackHandle): void
}

export interface RouteWarmupOptions {
  loadRoute?: (name: WarmableRouteName) => Promise<RouteComponentModule>
  warmableRoutes?: readonly WarmableRouteName[]
  scheduler?: IdleScheduler
  now?: () => number
  minIdleTimeRemainingMs?: number
  idleTimeoutMs?: number
}

const defaultIdleScheduler: IdleScheduler = {
  requestIdleCallback(callback: IdleCallback, options?: { timeout?: number }): IdleCallbackHandle {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      return (window as unknown as IdleScheduler).requestIdleCallback(callback, options)
    }
    const start = Date.now()
    return setTimeout(() => {
      callback({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
      })
    }, 16) as unknown as number
  },
  cancelIdleCallback(handle: IdleCallbackHandle): void {
    if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
      ;(window as unknown as IdleScheduler).cancelIdleCallback(handle)
    } else {
      clearTimeout(handle)
    }
  },
}

export function createRouteWarmupCoordinator(options: RouteWarmupOptions = {}) {
  const loadRoute = options.loadRoute ?? defaultRouteLoaderRegistry.loadRoute
  const warmableRoutes = options.warmableRoutes ?? PRIMARY_WARMABLE_ROUTES
  const scheduler = options.scheduler ?? defaultIdleScheduler
  const now =
    options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()))
  const minIdleTimeRemainingMs = options.minIdleTimeRemainingMs ?? 5
  const idleTimeoutMs = options.idleTimeoutMs ?? 1500

  const completed = new Set<WarmableRouteName>()
  let isDisposed = false
  let idleQueue: WarmableRouteName[] = []
  let currentIdleHandle: IdleCallbackHandle | null = null

  const logDiagnostic = (
    name: WarmableRouteName,
    trigger: WarmupTrigger,
    durationMs: number,
    error?: unknown,
  ) => {
    if (import.meta.env?.DEV) {
      if (error) {
        rendererDiagnostics.warn({
          scope: 'router.warmup',
          message: `Failed to warm up route chunk: ${name}`,
          context: { route: name, trigger, durationMs: Math.round(durationMs) },
          cause: error,
        })
      } else {
        rendererDiagnostics.info({
          scope: 'router.warmup',
          message: `Warmed up route chunk: ${name}`,
          context: { route: name, trigger, durationMs: Math.round(durationMs) },
        })
      }
    }
  }

  const warmRoute = async (
    name: WarmableRouteName,
    trigger: WarmupTrigger,
  ): Promise<RouteComponentModule | undefined> => {
    if (isDisposed) return undefined
    if (completed.has(name)) return undefined

    const startTime = now()
    try {
      const result = await loadRoute(name)
      completed.add(name)
      const durationMs = now() - startTime
      logDiagnostic(name, trigger, durationMs)
      return result
    } catch (error) {
      const durationMs = now() - startTime
      logDiagnostic(name, trigger, durationMs, error)
      // Do not mark completed on failure, allowing retry on next intent or navigation
      throw error
    }
  }

  const prefetchRouteOnIntent = (name: WarmableRouteName): Promise<void> => {
    if (isDisposed || completed.has(name)) {
      return Promise.resolve()
    }
    return warmRoute(name, 'intent')
      .then(() => {})
      .catch(() => {
        // Fire-and-forget: catch to prevent unhandled rejection.
        // Navigation itself will trigger loader and surface any persistent error.
      })
  }

  const scheduleNextIdleItem = () => {
    if (isDisposed || idleQueue.length === 0) {
      currentIdleHandle = null
      return
    }

    currentIdleHandle = scheduler.requestIdleCallback(
      async (deadline) => {
        currentIdleHandle = null
        if (isDisposed || idleQueue.length === 0) return

        // If time remaining is already insufficient and not timed out, yield to next frame
        if (deadline.timeRemaining() < minIdleTimeRemainingMs && !deadline.didTimeout) {
          scheduleNextIdleItem()
          return
        }

        const nextRoute = idleQueue.shift()
        if (!nextRoute) return

        if (completed.has(nextRoute)) {
          // Already completed by intent warmup, immediately proceed to next item
          scheduleNextIdleItem()
          return
        }

        try {
          await warmRoute(nextRoute, 'idle')
        } catch {
          // Failure logged in warmRoute; queue item removed so we continue sequentially
        }

        if (!isDisposed && idleQueue.length > 0) {
          scheduleNextIdleItem()
        }
      },
      { timeout: idleTimeoutMs },
    )
  }

  const schedulePrimaryRouteWarmup = (): void => {
    if (isDisposed) return
    idleQueue = warmableRoutes.filter((route) => !completed.has(route))
    if (idleQueue.length > 0 && currentIdleHandle === null) {
      scheduleNextIdleItem()
    }
  }

  const dispose = (): void => {
    isDisposed = true
    idleQueue = []
    if (currentIdleHandle !== null) {
      scheduler.cancelIdleCallback(currentIdleHandle)
      currentIdleHandle = null
    }
  }

  const isRouteWarmed = (name: WarmableRouteName): boolean => {
    return completed.has(name)
  }

  return {
    prefetchRouteOnIntent,
    schedulePrimaryRouteWarmup,
    dispose,
    isRouteWarmed,
    _getPendingIdleQueue: () => [...idleQueue],
  }
}

export const defaultRouteWarmupCoordinator = createRouteWarmupCoordinator()

export const { prefetchRouteOnIntent, schedulePrimaryRouteWarmup } = defaultRouteWarmupCoordinator
