import type { AudioResource } from '@shared/types/audioDecode'
import type { PlaybackAudioRuntime } from '../audio/playbackAudioRuntime'
import type { PlaybackTransitionPlan } from '../core/playbackTransitionPlanner'
import { getAlbumIdentity } from '../core/playbackAlbumIdentity'
import type { PlaybackTrack } from '../types'

interface GaplessPlaybackDependencies {
  audio: Pick<PlaybackAudioRuntime, 'getSnapshot' | 'scheduleNext' | 'cancelScheduledNext'>
  getPlayback(): {
    currentTrackId: number | null
    currentTrack: PlaybackTrack | null
    paused: boolean
  }
  getSettings(): {
    enabled: boolean
    skipDigitalSilence: boolean
    softTransition: boolean
    softTransitionDurationSeconds: number
  }
  resolvePlan(fromTrackId: number): Promise<PlaybackTransitionPlan | null>
  filterPlan(plan: PlaybackTransitionPlan): PlaybackTransitionPlan | null
  resolveAudioUrl(trackId: number): Promise<AudioResource>
}

export type GaplessBoundaryResult =
  | { kind: 'ignore' }
  | { kind: 'natural-ended' }
  | {
      kind: 'entered'
      plan: PlaybackTransitionPlan
      navigationStale: boolean
      contextStale: boolean
    }

function isSameAlbumBoundary(current: PlaybackTrack | null, next: PlaybackTrack): boolean {
  const currentIdentity = current ? getAlbumIdentity(current) : null
  return currentIdentity !== null && currentIdentity === getAlbumIdentity(next)
}

export function createGaplessPlaybackSession(deps: GaplessPlaybackDependencies) {
  let generation = 0
  let disposed = false
  let navigationRevision = 0
  let navigationContextRevision = 0
  let preparingPlan: PlaybackTransitionPlan | null = null
  let inFlight: { trackId: number; generation: number } | null = null
  let preparedForTrackId: number | null = null
  // Register before the ACK and retain across cancellation: the backend may
  // already have entered a candidate when cancelScheduledNext reaches it.
  const submitted = new Map<
    number,
    { plan: PlaybackTransitionPlan; navigationRevision: number; navigationContextRevision: number }
  >()

  function resetPreparation(): void {
    generation += 1
    preparingPlan = null
    inFlight = null
    preparedForTrackId = null
  }

  function cancelPreload(): void {
    resetPreparation()
    deps.audio.cancelScheduledNext()
  }

  function endAudioLifetime(): void {
    cancelPreload()
    submitted.clear()
  }

  // The closure is an opaque credential; callers never compare internal counters.
  function captureValidity(): () => boolean {
    const captured = generation
    return () => !disposed && captured === generation
  }

  function isCurrentPrefetch(requestGeneration: number, fromTrackId: number): boolean {
    const playback = deps.getPlayback()
    return (
      !disposed &&
      !playback.paused &&
      requestGeneration === generation &&
      playback.currentTrackId === fromTrackId &&
      deps.audio.getSnapshot().trackId === fromTrackId
    )
  }

  async function refresh(
    fromTrackId: number,
    previousPlan?: PlaybackTransitionPlan,
  ): Promise<void> {
    if (disposed) return
    if (!deps.getSettings().enabled) {
      cancelPreload()
      return
    }
    if (!previousPlan && (inFlight?.trackId === fromTrackId || preparedForTrackId === fromTrackId))
      return

    cancelPreload()
    const requestGeneration = generation
    inFlight = { trackId: fromTrackId, generation: requestGeneration }
    try {
      if (!isCurrentPrefetch(requestGeneration, fromTrackId)) return
      if (!deps.audio.getSnapshot().isPlaying) return
      const resolved = previousPlan ?? (await deps.resolvePlan(fromTrackId))
      const plan = resolved && deps.filterPlan(resolved)
      if (!plan || !isCurrentPrefetch(requestGeneration, fromTrackId)) return
      preparingPlan = plan
      const url = await deps.resolveAudioUrl(plan.track.id)
      if (!isCurrentPrefetch(requestGeneration, fromTrackId)) return

      submitted.set(plan.track.id, { plan, navigationRevision, navigationContextRevision })
      const settings = deps.getSettings()
      const scheduled = await deps.audio.scheduleNext(plan.track.id, url.url, {
        decodeProbe: url.decodeProbe,
        trimBoundarySilence:
          settings.skipDigitalSilence &&
          (settings.softTransition ||
            isSameAlbumBoundary(deps.getPlayback().currentTrack, plan.track)),
        softTransition: settings.softTransition,
        softTransitionDurationSeconds: settings.softTransitionDurationSeconds,
      })
      if (scheduled && isCurrentPrefetch(requestGeneration, fromTrackId))
        preparedForTrackId = fromTrackId
      // A stale ACK must not cancel or finish the successor's preparation.
    } catch {
      // Prefetch failure only disables the seamless hand-off.
    } finally {
      if (inFlight?.generation === requestGeneration) inFlight = null
    }
  }

  function acceptBoundary(nextTrackId: number | null): GaplessBoundaryResult {
    if (disposed) return { kind: 'ignore' }
    if (nextTrackId === null) {
      resetPreparation()
      submitted.clear()
      return { kind: 'natural-ended' }
    }
    const candidate = submitted.get(nextTrackId)
    if (!candidate || deps.audio.getSnapshot().trackId !== nextTrackId) return { kind: 'ignore' }
    resetPreparation()
    submitted.clear()
    return {
      kind: 'entered',
      plan: candidate.plan,
      navigationStale: candidate.navigationRevision !== navigationRevision,
      contextStale: candidate.navigationContextRevision !== navigationContextRevision,
    }
  }

  return {
    refresh,
    cancelPreload,
    endAudioLifetime,
    captureValidity,
    acceptBoundary,
    navigationChanged(resetContext = false): void {
      navigationRevision += 1
      if (resetContext) navigationContextRevision += 1
    },
    getPreparingPlan: () => preparingPlan,
    visitPlans(visit: (plan: PlaybackTransitionPlan) => void): void {
      const plans = new Set([...submitted.values()].map(({ plan }) => plan))
      if (preparingPlan) plans.add(preparingPlan)
      for (const plan of plans) visit(plan)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      endAudioLifetime()
    },
  }
}
