import { computed, shallowRef } from 'vue'
import { createPlaybackRequestGate, type PlaybackRequestToken } from '../utils/playbackRequestGate'

export type PlaybackRequestPhase = 'planning' | 'loading' | 'resuming'

/** One foreground request retains its identity from navigation through audio loading. */
export function createPlaybackRequestLifecycle() {
  const gate = createPlaybackRequestGate()
  const phase = shallowRef<PlaybackRequestPhase | null>(null)

  function invalidate(): void {
    gate.invalidate()
    phase.value = null
  }

  return {
    pending: computed(() => phase.value !== null),
    phase: computed(() => phase.value),
    begin(nextPhase: PlaybackRequestPhase): PlaybackRequestToken {
      const token = gate.begin()
      phase.value = nextPhase
      return token
    },
    isCurrent: gate.isCurrent,
    transition(token: PlaybackRequestToken, nextPhase: PlaybackRequestPhase): boolean {
      if (!gate.isCurrent(token)) return false
      phase.value = nextPhase
      return true
    },
    finish(token: PlaybackRequestToken): void {
      if (gate.finish(token)) phase.value = null
    },
    invalidate,
    invalidatePlanning(): void {
      if (phase.value === 'planning') invalidate()
    },
  }
}
