import { reactive, readonly, ref, type Ref } from 'vue'
import type { PlaybackMode, PlaybackState, PlaybackTrack } from '../types'
import {
  createPlaybackAudioRuntime,
  type PlaybackAudioRuntime,
} from '../audio/playbackAudioRuntime'
import { EffectivePlayTracker } from '../core/effectivePlayTracker'
import { PlaybackNavigationSession } from '../core/playbackNavigationSession'
import type {
  PlaybackAdvanceTrigger,
  PlaybackTransitionPlan,
  PlaybackTransitionSource,
} from '../core/playbackTransitionPlanner'
import { createPlaybackRequestGate, type PlaybackRequestToken } from '../utils/playbackRequestGate'
import type { PlaybackDependencies } from './playbackDependencies'

const VOLUME_KEY = 'auralis-volume'
const GAPLESS_PLAYBACK_KEY = 'auralis-gapless-playback-enabled'

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export interface PlaybackPublicApi {
  readonly state: PlaybackState
  readonly gaplessPlaybackEnabled: Readonly<Ref<boolean>>
  readonly isPlaybackPending: Readonly<Ref<boolean>>
  selectTrack(trackId: number): void
  playTrackFromQueue(
    queue: PlaybackTrack[],
    trackId: number,
    options?: { shufflePool?: PlaybackTrack[] },
  ): Promise<void>
  insertTrackAfterCurrent(track: PlaybackTrack): void
  insertTracksAfterCurrent(tracks: PlaybackTrack[]): void
  setPlaybackMode(mode: PlaybackMode): void
  setGaplessPlaybackEnabled(enabled: boolean): void
  togglePlayPause(): Promise<void>
  play(): Promise<void>
  pause(): void
  playPrevious(): Promise<void>
  playNext(): Promise<void>
  seekByRatio(ratio: number): void
  seekTo(time: number): void
  setVolume(volume: number): void
  toggleMute(): void
  clearError(): void
}

export interface PlaybackController {
  readonly api: PlaybackPublicApi
  dispose(): void
}

export function createPlaybackController(deps: PlaybackDependencies): PlaybackController {
  function readPersistedVolume(): number {
    const raw = deps.storage.getItem(VOLUME_KEY)
    if (!raw) return 0.8
    const num = Number(raw)
    return Number.isFinite(num) && num >= 0 && num <= 1 ? num : 0.8
  }

  function readPersistedGaplessPlayback(): boolean {
    return deps.storage.getItem(GAPLESS_PLAYBACK_KEY) !== 'false'
  }

  const gaplessPlaybackEnabled = ref(readPersistedGaplessPlayback())
  const playbackPending = ref(false)
  const readonlyPlaybackPending = readonly(playbackPending)
  const readonlyGaplessPlaybackEnabled = readonly(gaplessPlaybackEnabled)
  const playbackRequestGate = createPlaybackRequestGate()
  const navigationSession = new PlaybackNavigationSession()

  const transitionSource: PlaybackTransitionSource = {
    getRandomTrack: (excludeTrackId) => deps.getRandomTrack(excludeTrackId),
    getAlbumTracks: (albumKey) => deps.getAlbumTracks(albumKey),
    getRandomAlbumTracks: (excludeAlbumKey) => deps.getRandomAlbumTracks(excludeAlbumKey),
  }

  const state = reactive<PlaybackState>({
    queue: [],
    currentIndex: -1,
    currentTrack: null,
    selectedTrackId: null,
    currentTrackId: null,
    playbackMode: 'sequential',
    isPlaying: false,
    isMuted: false,
    currentTime: 0,
    duration: 0,
    volume: readPersistedVolume(),
    error: null,
  })

  let lastAudibleVolume = state.volume > 0 ? state.volume : 0.8
  let playbackRequestId = 0
  let transitionGeneration = 0
  let isDisposed = false

  let scheduledPlan: PlaybackTransitionPlan | null = null

  function beginPlaybackRequest(): PlaybackRequestToken {
    const token = playbackRequestGate.begin()
    playbackPending.value = true
    return token
  }

  function isCurrentPlaybackRequest(token: PlaybackRequestToken, requestId: number): boolean {
    return playbackRequestGate.isCurrent(token) && requestId === playbackRequestId
  }

  function finishPlaybackRequest(token: PlaybackRequestToken): void {
    if (playbackRequestGate.finish(token)) {
      playbackPending.value = false
    }
  }

  function invalidatePlaybackRequest(): void {
    playbackRequestGate.invalidate()
    playbackPending.value = false
  }

  function setPlaybackError(err: unknown): void {
    state.isPlaying = false
    state.error = err instanceof Error ? err.message : String(err)
  }

  const audioRuntime: PlaybackAudioRuntime = deps.createAudioRuntime
    ? deps.createAudioRuntime({
        onTimeUpdate: ({ currentTime, duration }) => {
          state.currentTime = currentTime
          state.duration = duration
        },
        onDurationChange: (duration) => {
          state.duration = duration
        },
        onPlayingChange: (isPlaying) => {
          state.isPlaying = isPlaying
        },
        onEnded: (nextTrackId) => {
          void commitBoundary(nextTrackId).catch(setPlaybackError)
        },
        onError: (error) => {
          audioRuntime.clear()
          effectivePlayTracker.end()
          state.isPlaying = false
          state.error = `Audio error: ${error.detail}`
          deps.diagnostics.error({
            scope: 'playback.audio',
            message: 'Audio playback failed',
            context: {
              trackId: state.currentTrackId,
              errorCode: error.errorCode,
              errorDetail: error.detail,
              networkState: error.networkState,
              readyState: error.readyState,
            },
          })
        },
        onSeeking: () => {
          effectivePlayTracker.beginSeekingWithFallback()
        },
        onSeeked: () => {
          effectivePlayTracker.endSeeking()
        },
        onBufferingChange: (buffering) => {
          effectivePlayTracker.setBuffering(buffering)
        },
      })
    : createPlaybackAudioRuntime({
        onTimeUpdate: ({ currentTime, duration }) => {
          state.currentTime = currentTime
          state.duration = duration
        },
        onDurationChange: (duration) => {
          state.duration = duration
        },
        onPlayingChange: (isPlaying) => {
          state.isPlaying = isPlaying
        },
        onEnded: (nextTrackId) => {
          void commitBoundary(nextTrackId).catch(setPlaybackError)
        },
        onError: (error) => {
          audioRuntime.clear()
          effectivePlayTracker.end()
          state.isPlaying = false
          state.error = `Audio error: ${error.detail}`
          deps.diagnostics.error({
            scope: 'playback.audio',
            message: 'Audio playback failed',
            context: {
              trackId: state.currentTrackId,
              errorCode: error.errorCode,
              errorDetail: error.detail,
              networkState: error.networkState,
              readyState: error.readyState,
            },
          })
        },
        onSeeking: () => {
          effectivePlayTracker.beginSeekingWithFallback()
        },
        onSeeked: () => {
          effectivePlayTracker.endSeeking()
        },
        onBufferingChange: (buffering) => {
          effectivePlayTracker.setBuffering(buffering)
        },
      })

  audioRuntime.setVolume(state.volume, state.isMuted)

  const effectivePlayTracker = new EffectivePlayTracker({
    isPlaybackCountable: (trackId) => {
      if (trackId !== state.currentTrackId) return false
      const snapshot = audioRuntime.getSnapshot()
      return snapshot.isPlaying && snapshot.hasCurrentData
    },
    getDurationSeconds: () => {
      const snapshot = audioRuntime.getSnapshot()
      const audioDuration = snapshot.duration
      const trackDuration =
        state.currentTrack?.durationSeconds &&
        Number.isFinite(state.currentTrack.durationSeconds) &&
        state.currentTrack.durationSeconds > 0
          ? state.currentTrack.durationSeconds
          : 0

      return audioDuration || trackDuration || null
    },
    recordEffectivePlay: (payload) => deps.recordEffectivePlay(payload),
    onRecordError: (error) => {
      deps.diagnostics.warn({
        scope: 'playback.statistics',
        message: 'Failed to record play count',
        cause: error,
      })
    },
  })

  function getQueueContainingCurrentTrack(track: PlaybackTrack): PlaybackTrack[] {
    return state.queue.some((queuedTrack) => queuedTrack.id === track.id) ? state.queue : [track]
  }

  function commitCurrentTrack(track: PlaybackTrack, queue: PlaybackTrack[], duration = 0): void {
    state.queue = queue
    state.currentIndex = queue.findIndex((t) => t.id === track.id)
    state.currentTrack = track
    state.currentTrackId = track.id
    state.selectedTrackId = track.id
    state.currentTime = 0
    state.duration = duration
    state.error = null
  }

  function applyTransitionPlan(plan: PlaybackTransitionPlan): void {
    navigationSession.applyPlan(plan, state.currentTrack, state.queue)
    effectivePlayTracker.end()
    commitCurrentTrack(plan.track, plan.queue, audioRuntime.getSnapshot().duration)
    effectivePlayTracker.start(plan.track.id)
  }

  async function resolveTransitionPlan(
    fromTrackId: number,
  ): Promise<PlaybackTransitionPlan | null> {
    if (state.currentTrackId !== fromTrackId) return null
    const decision = await navigationSession.resolveAdvance(
      {
        queue: state.queue,
        currentIndex: state.currentIndex,
        currentTrackId: state.currentTrackId,
        currentTrack: state.currentTrack,
        playbackMode: state.playbackMode,
      },
      transitionSource,
      'gapless-prefetch',
    )
    return decision.kind === 'play' ? decision.plan : null
  }

  function invalidateGaplessTransition(): void {
    transitionGeneration += 1
    scheduledPlan = null
    audioRuntime.cancelScheduledNext()
  }

  function isSameAlbumBoundary(current: PlaybackTrack | null, next: PlaybackTrack): boolean {
    if (!current?.album || !next.album) return false
    const currentAlbumArtist = current.albumArtist || current.artist || ''
    const nextAlbumArtist = next.albumArtist || next.artist || ''
    return (
      current.album.trim().toLocaleLowerCase() === next.album.trim().toLocaleLowerCase() &&
      currentAlbumArtist.trim().toLocaleLowerCase() === nextAlbumArtist.trim().toLocaleLowerCase()
    )
  }

  async function refreshGaplessNext(fromTrackId: number): Promise<void> {
    if (!gaplessPlaybackEnabled.value) {
      transitionGeneration += 1
      scheduledPlan = null
      audioRuntime.cancelScheduledNext()
      return
    }

    const generation = ++transitionGeneration
    const requestId = playbackRequestId
    scheduledPlan = null
    audioRuntime.cancelScheduledNext()

    try {
      if (!audioRuntime.getSnapshot().isPlaying) return
      const plan = await resolveTransitionPlan(fromTrackId)
      if (
        !plan ||
        generation !== transitionGeneration ||
        requestId !== playbackRequestId ||
        state.currentTrackId !== fromTrackId
      )
        return

      const url = await resolveAudioUrl(plan.track.id)
      if (
        generation !== transitionGeneration ||
        requestId !== playbackRequestId ||
        state.currentTrackId !== fromTrackId
      )
        return

      const scheduled = await audioRuntime.scheduleNext(plan.track.id, url, {
        trimBoundarySilence: isSameAlbumBoundary(state.currentTrack, plan.track),
      })
      if (
        generation !== transitionGeneration ||
        requestId !== playbackRequestId ||
        state.currentTrackId !== fromTrackId
      ) {
        if (scheduled) audioRuntime.cancelScheduledNext()
        return
      }
      if (scheduled) scheduledPlan = plan
    } catch {
      // Prefetch failure only disables the seamless hand-off.
    }
  }

  async function commitBoundary(nextTrackId: number | null): Promise<void> {
    const plan = scheduledPlan
    scheduledPlan = null
    if (plan && nextTrackId === plan.track.id) {
      applyTransitionPlan(plan)
      void refreshGaplessNext(plan.track.id)
      return
    }
    await advanceTrack('natural-ended')
  }

  // --- Internal track switch ---

  async function playTrackFromResolvedQueue(
    queue: PlaybackTrack[],
    trackId: number,
    options?: {
      recordHistory?: boolean
      resetShuffleContext?: { shufflePool?: PlaybackTrack[] }
    },
  ): Promise<void> {
    const index = queue.findIndex((t) => t.id === trackId)
    if (index === -1) return
    const requestId = ++playbackRequestId
    invalidateGaplessTransition()
    audioRuntime.clear()

    if (options?.recordHistory !== false) {
      navigationSession.pushHistory(state.currentTrack, trackId, state.queue)
    }

    if (options?.resetShuffleContext) {
      navigationSession.resetForTrackSwitch(options.resetShuffleContext)
    }

    effectivePlayTracker.end()
    commitCurrentTrack(queue[index], queue, 0)
    state.isPlaying = false
    const pendingToken = beginPlaybackRequest()

    try {
      const audioUrl = await resolveAudioUrl(trackId)

      if (!isCurrentPlaybackRequest(pendingToken, requestId)) {
        return
      }

      await audioRuntime.start(trackId, audioUrl, {
        preferGapless: gaplessPlaybackEnabled.value,
      })

      if (!isCurrentPlaybackRequest(pendingToken, requestId)) {
        return
      }

      const snapshot = audioRuntime.getSnapshot()
      state.duration = snapshot.duration
      state.currentTime = snapshot.currentTime
      effectivePlayTracker.start(trackId)
      if (snapshot.kind === 'gapless') {
        void refreshGaplessNext(trackId)
      }
    } catch (err) {
      if (!isCurrentPlaybackRequest(pendingToken, requestId)) {
        return
      }

      state.isPlaying = false
      state.error = err instanceof Error ? err.message : String(err)
    } finally {
      finishPlaybackRequest(pendingToken)
    }
  }

  // --- Mode-aware advance ---

  async function advanceTrack(trigger: PlaybackAdvanceTrigger): Promise<void> {
    const decision = await navigationSession.resolveAdvance(
      {
        queue: state.queue,
        currentIndex: state.currentIndex,
        currentTrackId: state.currentTrackId,
        currentTrack: state.currentTrack,
        playbackMode: state.playbackMode,
      },
      transitionSource,
      trigger,
    )

    if (decision.kind === 'noop') {
      return
    }

    if (decision.kind === 'stop') {
      effectivePlayTracker.end()
      audioRuntime.pause()
      state.isPlaying = false
      if (decision.resetTime) {
        state.currentTime = 0
      }
      return
    }

    if (decision.kind === 'play') {
      const plan = decision.plan
      const snapshot = audioRuntime.getSnapshot()
      if (
        state.playbackMode === 'repeat-one' &&
        trigger === 'natural-ended' &&
        snapshot.kind === 'html-audio'
      ) {
        effectivePlayTracker.start(state.currentTrackId!)
        await audioRuntime.seek(0)
        state.currentTime = 0
        await audioRuntime.resume()
        return
      }

      navigationSession.applyPlan(plan, state.currentTrack, state.queue)
      await playTrackFromResolvedQueue(plan.queue, plan.track.id, {
        recordHistory: false,
      })
    }
  }

  // --- Actions ---

  function selectTrack(trackId: number): void {
    state.selectedTrackId = trackId
  }

  async function resolveAudioUrl(trackId: number): Promise<string> {
    const result = await deps.getAudioUrl(trackId)

    if (!result?.url) {
      throw new Error('Audio file is unavailable')
    }

    return result.url
  }

  function setPlaybackMode(mode: PlaybackMode): void {
    invalidateGaplessTransition()
    state.playbackMode = mode
    navigationSession.setMode(mode)
    if (audioRuntime.getSnapshot().kind === 'gapless' && state.currentTrackId && state.isPlaying) {
      void refreshGaplessNext(state.currentTrackId)
    }
  }

  function setGaplessPlaybackEnabled(enabled: boolean): void {
    if (gaplessPlaybackEnabled.value === enabled) return

    gaplessPlaybackEnabled.value = enabled
    deps.storage.setItem(GAPLESS_PLAYBACK_KEY, String(enabled))

    if (!enabled) {
      invalidateGaplessTransition()
      return
    }

    if (audioRuntime.getSnapshot().kind === 'gapless' && state.currentTrackId && state.isPlaying) {
      void refreshGaplessNext(state.currentTrackId)
    }
  }

  async function playTrackFromQueue(
    queue: PlaybackTrack[],
    trackId: number,
    options?: { shufflePool?: PlaybackTrack[] },
  ): Promise<void> {
    await playTrackFromResolvedQueue(queue, trackId, {
      recordHistory: true,
      resetShuffleContext: { shufflePool: options?.shufflePool },
    })
  }

  function insertTrackAfterCurrent(track: PlaybackTrack): void {
    if (!state.currentTrack || state.currentIndex < 0) return
    const currentQueue = state.queue.length > 0 ? state.queue : [state.currentTrack]
    const insertion = navigationSession.insertSingleTrack(
      currentQueue,
      state.currentTrack.id,
      track,
    )
    if (!insertion) return

    state.queue = insertion.queue
    state.currentIndex = insertion.currentIndex
    if (audioRuntime.getSnapshot().kind === 'gapless' && state.currentTrackId) {
      void refreshGaplessNext(state.currentTrackId)
    }
  }

  function insertTracksAfterCurrent(tracks: PlaybackTrack[]): void {
    if (!state.currentTrack || state.currentIndex < 0) return
    const currentQueue = state.queue.length > 0 ? state.queue : [state.currentTrack]
    const insertion = navigationSession.insertMultipleTracks(
      currentQueue,
      state.currentTrack.id,
      tracks,
    )
    if (!insertion) return

    state.queue = insertion.queue
    state.currentIndex = insertion.currentIndex
    if (audioRuntime.getSnapshot().kind === 'gapless' && state.currentTrackId) {
      void refreshGaplessNext(state.currentTrackId)
    }
  }

  async function resumeCurrentTrack(track: PlaybackTrack): Promise<void> {
    const snapshot = audioRuntime.getSnapshot()
    if (snapshot.kind === 'idle' || snapshot.trackId !== track.id) {
      await playTrackFromResolvedQueue(getQueueContainingCurrentTrack(track), track.id, {
        recordHistory: false,
      })
      return
    }

    const requestId = playbackRequestId
    const pendingToken = beginPlaybackRequest()
    try {
      await audioRuntime.resume()

      if (!isCurrentPlaybackRequest(pendingToken, requestId) || state.currentTrackId !== track.id) {
        return
      }

      if (snapshot.kind === 'gapless' && state.currentTrackId) {
        void refreshGaplessNext(state.currentTrackId)
      }
    } catch (err) {
      if (!isCurrentPlaybackRequest(pendingToken, requestId) || state.currentTrackId !== track.id) {
        return
      }

      state.isPlaying = false
      state.error = err instanceof Error ? err.message : String(err)
    } finally {
      finishPlaybackRequest(pendingToken)
    }
  }

  async function togglePlayPause(): Promise<void> {
    if (!state.currentTrack || playbackPending.value) return

    if (state.isPlaying) {
      invalidateGaplessTransition()
      audioRuntime.pause()
      return
    }

    await resumeCurrentTrack(state.currentTrack)
  }

  async function play(): Promise<void> {
    if (!state.currentTrack || state.isPlaying || playbackPending.value) return
    await resumeCurrentTrack(state.currentTrack)
  }

  function pause(): void {
    invalidateGaplessTransition()
    audioRuntime.pause()
  }

  async function playPrevious(): Promise<void> {
    const decision = navigationSession.resolvePrevious({
      queue: state.queue,
      currentIndex: state.currentIndex,
      playbackMode: state.playbackMode,
    })

    if (decision.kind === 'restore-history') {
      await playTrackFromResolvedQueue(decision.entry.queue, decision.entry.track.id, {
        recordHistory: false,
      })
      return
    }

    if (decision.kind === 'play-queue-track') {
      await playTrackFromResolvedQueue(state.queue, decision.track.id, { recordHistory: false })
      return
    }

    if (decision.kind === 'seek-to-start') {
      await audioRuntime.seek(0)
      state.currentTime = 0
      return
    }
  }

  async function playNext(): Promise<void> {
    await advanceTrack('manual-next')
  }

  function seekToClampedTime(targetTime: number): void {
    if (!state.currentTrack || !Number.isFinite(targetTime)) return

    const snapshot = audioRuntime.getSnapshot()
    const duration =
      snapshot.duration ||
      (state.currentTrack?.durationSeconds && state.currentTrack.durationSeconds > 0
        ? state.currentTrack.durationSeconds
        : 0)

    if (!duration) return

    const nextTime = Math.min(duration, Math.max(0, targetTime))
    effectivePlayTracker.beginSeekingWithFallback()
    invalidateGaplessTransition()
    void audioRuntime.seek(nextTime).then(() => {
      if (snapshot.kind === 'gapless' && state.currentTrackId) {
        void refreshGaplessNext(state.currentTrackId)
      }
    })
    state.currentTime = nextTime
  }

  function seekByRatio(ratio: number): void {
    if (!state.currentTrack || !Number.isFinite(ratio)) return
    const snapshot = audioRuntime.getSnapshot()
    const duration =
      snapshot.duration ||
      (state.currentTrack?.durationSeconds && state.currentTrack.durationSeconds > 0
        ? state.currentTrack.durationSeconds
        : 0)

    if (!duration) return
    const clampedRatio = Math.min(1, Math.max(0, ratio))
    seekToClampedTime(duration * clampedRatio)
  }

  function seekTo(time: number): void {
    seekToClampedTime(time)
  }

  function setVolume(volume: number): void {
    const clamped = clampVolume(volume)
    state.volume = clamped
    audioRuntime.setVolume(clamped, state.isMuted)
    if (clamped > 0) {
      lastAudibleVolume = clamped
    }
    if (state.isMuted) {
      state.isMuted = false
      audioRuntime.setVolume(state.volume, false)
    }
    deps.storage.setItem(VOLUME_KEY, String(clamped))
  }

  function toggleMute(): void {
    if (state.isMuted) {
      state.isMuted = false

      if (state.volume <= 0) {
        setVolume(lastAudibleVolume)
      } else {
        audioRuntime.setVolume(state.volume, false)
      }

      return
    }

    if (state.volume > 0) {
      lastAudibleVolume = state.volume
    }

    state.isMuted = true
    audioRuntime.setVolume(state.volume, true)
  }

  function clearError(): void {
    state.error = null
  }

  function removeMissingTracksFromPlayback(trackIds: number[]): void {
    const missingIds = new Set(trackIds)
    if (missingIds.size === 0) return

    const { currentTrackMissing } = navigationSession.removeMissingTracks(
      missingIds,
      state.currentTrackId,
    )
    state.queue = state.queue.filter((track) => !missingIds.has(track.id))

    if (currentTrackMissing) {
      playbackRequestId += 1
      invalidatePlaybackRequest()
      invalidateGaplessTransition()
      audioRuntime.clear()
      effectivePlayTracker.end()
      state.currentIndex = -1
      state.currentTrack = null
      state.currentTrackId = null
      state.selectedTrackId = null
      state.currentTime = 0
      state.duration = 0
      state.isPlaying = false
      state.error = 'Audio file is unavailable. Please rescan the music library.'
      return
    }

    state.currentIndex = state.currentTrackId
      ? state.queue.findIndex((track) => track.id === state.currentTrackId)
      : -1
    if (audioRuntime.getSnapshot().kind === 'gapless' && state.currentTrackId && state.isPlaying) {
      void refreshGaplessNext(state.currentTrackId)
    }
  }

  const unsubscribeLibraryChanged = deps.onLibraryChanged((event) => {
    if (event.reason === 'track-missing') removeMissingTracksFromPlayback(event.trackIds)
  })

  function dispose(): void {
    if (isDisposed) return
    isDisposed = true
    playbackRequestId += 1
    invalidatePlaybackRequest()
    invalidateGaplessTransition()
    effectivePlayTracker.end()
    audioRuntime.dispose()
    unsubscribeLibraryChanged()
    navigationSession.clear()
  }

  const api: PlaybackPublicApi = {
    state,
    gaplessPlaybackEnabled: readonlyGaplessPlaybackEnabled,
    isPlaybackPending: readonlyPlaybackPending,
    selectTrack,
    playTrackFromQueue,
    insertTrackAfterCurrent,
    insertTracksAfterCurrent,
    setPlaybackMode,
    setGaplessPlaybackEnabled,
    togglePlayPause,
    play,
    pause,
    playPrevious,
    playNext,
    seekByRatio,
    seekTo,
    setVolume,
    toggleMute,
    clearError,
  }

  return {
    api,
    dispose,
  }
}
