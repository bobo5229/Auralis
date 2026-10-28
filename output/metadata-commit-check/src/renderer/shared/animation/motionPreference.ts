export const MOTION_PREFERENCE_KEY = 'auralis-reduced-motion'
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
export type MotionPreference = 'system' | 'reduce'

type MotionListener = (event: MediaQueryListEvent) => void
export interface MotionQuery {
  readonly matches: boolean
  addEventListener(
    type: 'change',
    listener: MotionListener,
    options?: boolean | AddEventListenerOptions,
  ): void
  removeEventListener(type: 'change', listener: MotionListener): void
}

function readPreference(): MotionPreference {
  try {
    return localStorage.getItem(MOTION_PREFERENCE_KEY) === 'reduce' ? 'reduce' : 'system'
  } catch {
    return 'system'
  }
}

let preference = readPreference()
let saveFailed = false
const subscribers = new Set<() => void>()

export function getMotionPreference(): MotionPreference {
  return preference
}

export function hasMotionPreferenceSaveFailed(): boolean {
  return saveFailed
}

export function subscribeMotionPreference(listener: () => void): () => void {
  subscribers.add(listener)
  return () => subscribers.delete(listener)
}

export function setMotionPreference(value: MotionPreference): void {
  preference = value
  try {
    localStorage.setItem(MOTION_PREFERENCE_KEY, value)
    saveFailed = false
  } catch {
    saveFailed = true
  }
  for (const listener of [...subscribers]) listener()
}

/** Same lifecycle as a media query; subscribers also receive in-app preference changes. */
export function createReducedMotionQuery(
  createQuery: () => MotionQuery = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(REDUCED_MOTION_QUERY)
      : matchMedia(REDUCED_MOTION_QUERY),
): MotionQuery {
  const system = createQuery()
  const listeners = new Map<MotionListener, () => void>()
  return {
    get matches() {
      return preference === 'reduce' || system.matches
    },
    addEventListener(_type, listener, options) {
      if (listeners.has(listener)) return
      const signal = typeof options === 'object' ? options.signal : undefined
      if (signal?.aborted) return
      const once = typeof options === 'object' && options.once
      let previous = preference === 'reduce' || system.matches
      const notify = (systemMatches = system.matches): void => {
        const matches = preference === 'reduce' || systemMatches
        if (previous === matches) return
        previous = matches
        if (once) cleanup()
        listener(Object.assign(new Event('change'), { matches, media: REDUCED_MOTION_QUERY }))
      }
      const onSystemChange = (event: MediaQueryListEvent): void => notify(event.matches)
      const unsubscribe = subscribeMotionPreference(() => notify())
      system.addEventListener('change', onSystemChange)
      const cleanup = (): void => {
        system.removeEventListener('change', onSystemChange)
        unsubscribe()
        signal?.removeEventListener('abort', cleanup)
        listeners.delete(listener)
      }
      listeners.set(listener, cleanup)
      signal?.addEventListener('abort', cleanup, { once: true })
    },
    removeEventListener(_type, listener) {
      listeners.get(listener)?.()
      listeners.delete(listener)
    },
  }
}

/** Keep CSS and other same-origin windows in sync with the effective preference. */
export function initMotionPreference(): () => void {
  const query = createReducedMotionQuery()
  const syncRoot = (): void => {
    document.documentElement.dataset.reducedMotion = String(query.matches)
  }
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== MOTION_PREFERENCE_KEY && event.key !== null) return
    preference = readPreference()
    saveFailed = false
    for (const listener of [...subscribers]) listener()
  }
  syncRoot()
  query.addEventListener('change', syncRoot)
  window.addEventListener('storage', onStorage)
  return () => {
    query.removeEventListener('change', syncRoot)
    window.removeEventListener('storage', onStorage)
  }
}
