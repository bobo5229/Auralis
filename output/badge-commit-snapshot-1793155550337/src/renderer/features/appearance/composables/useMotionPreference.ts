import { onScopeDispose, readonly, ref } from 'vue'
import {
  getMotionPreference,
  hasMotionPreferenceSaveFailed,
  setMotionPreference,
  subscribeMotionPreference,
} from '@renderer/shared/animation/motionPreference'

export function useMotionPreference() {
  const motionPreference = ref(getMotionPreference())
  const persistFailed = ref(hasMotionPreferenceSaveFailed())
  const stop = subscribeMotionPreference(() => {
    motionPreference.value = getMotionPreference()
    persistFailed.value = hasMotionPreferenceSaveFailed()
  })
  onScopeDispose(stop)
  return {
    motionPreference: readonly(motionPreference),
    persistFailed: readonly(persistFailed),
    setMotionPreference,
  }
}
