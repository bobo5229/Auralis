import { readonly, ref, type Ref } from 'vue'
import { REDUCED_MOTION_QUERY } from '../utils/lyricsMotion'

export interface UseReducedMotion {
  matches: Readonly<Ref<boolean>>
  /** Remove the matchMedia change listener; call on unmount. */
  dispose: () => void
}

/**
 * Reactive `prefers-reduced-motion` state backed by matchMedia. The query
 * factory is injectable for node tests; the caller must call `dispose()` on
 * unmount to remove the change listener.
 */
export function useReducedMotion(
  createQuery: () => MediaQueryList = () => window.matchMedia(REDUCED_MOTION_QUERY),
): UseReducedMotion {
  const query = createQuery()
  const matches = ref(query.matches)
  const onChange = (event: MediaQueryListEvent): void => {
    matches.value = event.matches
  }
  query.addEventListener('change', onChange)
  return {
    matches: readonly(matches),
    dispose: () => query.removeEventListener('change', onChange),
  }
}
