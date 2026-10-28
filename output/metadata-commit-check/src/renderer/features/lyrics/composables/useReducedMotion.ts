import { readonly, ref, type Ref } from 'vue'
import {
  createReducedMotionQuery,
  type MotionQuery,
} from '@renderer/shared/animation/motionPreference'

export interface UseReducedMotion {
  matches: Readonly<Ref<boolean>>
  /** Remove the matchMedia change listener; call on unmount. */
  dispose: () => void
}

/**
 * Reactive effective reduced-motion state (system or in-app preference). The query
 * factory is injectable for node tests; the caller must call `dispose()` on
 * unmount to remove the change listener.
 */
export function useReducedMotion(
  createQuery: () => MotionQuery = createReducedMotionQuery,
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
