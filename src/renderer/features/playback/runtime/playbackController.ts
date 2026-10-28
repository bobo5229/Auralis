import { ListeningProgressTracker } from '../core/listeningProgressTracker'
import { isReadonly, reactive, readonly, ref, toRaw, type DeepReadonly, type Ref } from 'vue'
import {
  isSoftTransitionDuration,
  SOFT_TRANSITION_DEFAULT_SECONDS,
} from '@shared/audio/softTransitionSettings'
import type { PlaybackMode, PlaybackState, PlaybackTrack } from '../types'
import {
  createPlaybackAudioRuntime,
  type PlaybackAudioCallbacks,
  type PlaybackAudioRuntime,
} from '../audio/playbackAudioRuntime'
import { EffectivePlayTracker } from '../core/effectivePlayTracker'
import { PlaybackNavigationSession } from '../core/playbackNavigationSession'
import type {
  PlaybackAdvanceTrigger,
  PlaybackTransitionPlan,
  PlaybackTransitionSource,
} from '../core/playbackTransitionPlanner'
import type { PlaybackRequestToken } from '../utils/playbackRequestGate'
import { createPlaybackRequestLifecycle } from './playbackRequestLifecycle'
import { createGaplessPlaybackSession } from './gaplessPlaybackSession'
import type { PlaybackDependencies } from './playbackDependencies'

const VOLUME_KEY = 'auralis-volume'
const GAPLESS_PLAYBACK_KEY = 'auralis-gapless-playback-enabled'
const DIGITAL_SILENCE_KEY = 'auralis-skip-boundary-digital-silence'
const SOFT_TRANSITION_KEY = 'auralis-soft-transition-enabled'
const SOFT_TRANSITION_DURATION_KEY = 'auralis-soft-transition-duration-seconds'

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export interface PlaybackQueueSession {
  readonly id: number
  readonly source: 'cd' | 'default'
}

export interface PlayTrackFromQueueOptions {
  source?: 'cd'
  shufflePool?: readonly PlaybackTrack[]
  shuffleCycle?: boolean
  playbackMode?: PlaybackMode
  replaceHistory?: boolean
}

export interface ReplaceCurrentPlaybackQueueOptions {
  expectedSessionId: number
  expectedTrackId: number
  expectedQueueTrackIds: readonly number[]
  queue: readonly PlaybackTrack[]
  playbackMode: PlaybackMode
  shufflePool?: readonly PlaybackTrack[]
  shuffleCycle?: boolean
}

export interface PlaybackPublicApi {
  readonly state: DeepReadonly<PlaybackState>
  readonly queueSession: Readonly<Ref<PlaybackQueueSession | null>>
  /** Changes on explicit transport/queue commands, independently of natural playback updates. */
  readonly commandRevision: Readonly<Ref<number>>
  readonly gaplessPlaybackEnabled: Readonly<Ref<boolean>>
  readonly skipDigitalSilenceEnabled: Readonly<Ref<boolean>>
  readonly softTransitionEnabled: Readonly<Ref<boolean>>
  readonly softTransitionDurationSeconds: Readonly<Ref<number>>
  readonly isPlaybackPending: Readonly<Ref<boolean>>
  selectTrack(trackId: number): void
  playTrackFromQueue(
    queue: readonly PlaybackTrack[],
    trackId: number,
    options?: PlayTrackFromQueueOptions,
  ): Promise<void>
  replaceCurrentPlaybackQueue(options: ReplaceCurrentPlaybackQueueOptions): boolean
  insertTrackAfterCurrent(track: PlaybackTrack): void
  insertTracksAfterCurrent(tracks: readonly PlaybackTrack[]): void
  setPlaybackMode(mode: PlaybackMode): void
  setGaplessPlaybackEnabled(enabled: boolean): void
  setSkipDigitalSilenceEnabled(enabled: boolean): void
  setSoftTransitionEnabled(enabled: boolean): void
  setSoftTransitionDurationSeconds(seconds: number): void
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
  const skipDigitalSilenceEnabled = ref(deps.storage.getItem(DIGITAL_SILENCE_KEY) === 'true')
  const softTransitionEnabled = ref(deps.storage.getItem(SOFT_TRANSITION_KEY) === 'true')
  const persistedTransitionDuration = Number(deps.storage.getItem(SOFT_TRANSITION_DURATION_KEY))
  const softTransitionDurationSeconds = ref(
    isSoftTransitionDuration(persistedTransitionDuration)
      ? persistedTransitionDuration
      : SOFT_TRANSITION_DEFAULT_SECONDS,
  )
  const readonlyGaplessPlaybackEnabled = readonly(gaplessPlaybackEnabled)
  const playbackRequests = createPlaybackRequestLifecycle()
  const navigationSession = new PlaybackNavigationSession()
  // Catalog snapshots are immutable. Keep one mutable playback copy per frozen
  // object so queues, history and preloaded plans share metadata without editing it.
  const mutableTracks = new WeakMap<PlaybackTrack, PlaybackTrack>()
  const mutableQueues = new WeakMap<PlaybackTrack[], PlaybackTrack[]>()
  function playbackTrack(track: PlaybackTrack): PlaybackTrack {
    // Public readonly views may return through queue commands. Keep internal
    // metadata writes on the original reactive track, without retaining its readonly proxy.
    if (isReadonly(track)) track = reactive(toRaw(track))
    if (!Object.isFrozen(track)) return track
    let copy = mutableTracks.get(track)
    if (!copy) {
      copy = reactive({ ...track })
      mutableTracks.set(track, copy)
    }
    return copy
  }
  function playbackQueue(input: readonly PlaybackTrack[]): PlaybackTrack[] {
    // Restore the controller's writable handle when a public queue is played again.
    // Preserve the queue identity used by history and the frozen-catalog cache.
    const queue = isReadonly(input)
      ? reactive(toRaw(input) as PlaybackTrack[])
      : (input as PlaybackTrack[])
    const source = toRaw(queue)
    const cached = mutableQueues.get(source)
    // The catalog's objects are frozen, but its consumer's array may be reordered
    // or edited. Reuse only while every entry still maps to the same playback object.
    if (
      cached &&
      cached.length === source.length &&
      source.every((track, index) => playbackTrack(track) === cached[index])
    ) {
      return cached
    }
    // Vue cannot proxy a frozen array; copy its container so mutable entries
    // remain reactive internally and readonly through the public state view.
    let copy = Object.isFrozen(source) ? source.slice() : source
    for (let index = 0; index < source.length; index += 1) {
      const track = playbackTrack(source[index])
      if (track !== source[index]) {
        if (copy === source) copy = source.slice()
        copy[index] = track
      }
    }
    if (copy === source) {
      mutableQueues.delete(source)
      return queue
    }
    // Keep previous copies intact for history, and let discarded catalogs be collected.
    mutableQueues.set(source, copy)
    return copy
  }
  function preparePlaybackPlan(plan: PlaybackTransitionPlan): PlaybackTransitionPlan {
    plan.track = playbackTrack(plan.track)
    plan.queue = playbackQueue(plan.queue)
    if (plan.nextAlbumShuffleContext) {
      plan.nextAlbumShuffleContext = {
        ...plan.nextAlbumShuffleContext,
        tracks: playbackQueue(plan.nextAlbumShuffleContext.tracks),
      }
    }
    return plan
  }
  const queueSession = ref<PlaybackQueueSession | null>(null)
  const commandRevision = ref(0)
  let nextQueueSessionId = 0

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
    playbackMode: 'repeat-all',
    isPlaying: false,
    isMuted: false,
    currentTime: 0,
    duration: 0,
    volume: readPersistedVolume(),
    error: null,
  })

  let lastAudibleVolume = state.volume > 0 ? state.volume : 0.8
  let isDisposed = false
  let pausedByUser = false
  let audioBuffering = false
  const missingTrackIds = new Set<number>()

  function setPlaybackError(err: unknown): void {
    effectivePlayTracker.setPlaying(false)
    listeningProgress?.setPlaying(false)
    state.isPlaying = false
    state.error = err instanceof Error ? err.message : String(err)
  }

  const audioCallbacks: PlaybackAudioCallbacks = {
    onTimeUpdate: ({ currentTime, duration }) => {
      state.currentTime = currentTime
      state.duration = duration
      effectivePlayTracker.updateDuration()
    },
    onDurationChange: (duration) => {
      state.duration = duration
      effectivePlayTracker.updateDuration()
    },
    onPlayingChange: (isPlaying) => {
      const recoveredFromBuffering = audioBuffering && isPlaying
      state.isPlaying = isPlaying && !pausedByUser
      effectivePlayTracker.setPlaying(state.isPlaying)
      listeningProgress?.setPlaying(state.isPlaying)
      const snapshot = audioRuntime.getSnapshot()
      if (
        recoveredFromBuffering &&
        !isDisposed &&
        !pausedByUser &&
        state.currentTrackId !== null &&
        ['gapless', 'mpv'].includes(snapshot.kind) &&
        snapshot.trackId === state.currentTrackId
      ) {
        void gaplessSession.refresh(state.currentTrackId)
      }
    },
    onEnded: (nextTrackId) => {
      effectivePlayTracker.end()
      listeningProgress?.finish(state.duration)
      void commitBoundary(nextTrackId).catch(setPlaybackError)
    },
    onError: (error) => {
      effectivePlayTracker.end()
      listeningProgress?.end()
      audioRuntime.clear()
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
      listeningProgress?.beginSeekingWithFallback()
    },
    onSeeked: () => {
      effectivePlayTracker.endSeeking()
      listeningProgress?.endSeeking()
    },
    onBufferingChange: (buffering) => {
      audioBuffering = buffering
      effectivePlayTracker.setBuffering(buffering)
      listeningProgress?.setBuffering(buffering)
    },
  }
  const createAudioRuntime = deps.createAudioRuntime ?? createPlaybackAudioRuntime
  const audioRuntime: PlaybackAudioRuntime = createAudioRuntime(audioCallbacks)

  audioRuntime.setVolume(state.volume, state.isMuted)

  const listeningProgress =
    deps.getListeningEpoch && deps.recordListeningProgress
      ? new ListeningProgressTracker({
          getEpoch: deps.getListeningEpoch,
          record: deps.recordListeningProgress,
          snapshot: () => {
            const snapshot = audioRuntime.getSnapshot()
            return {
              trackId: snapshot.trackId,
              position: snapshot.currentTime,
              duration: snapshot.duration,
              playing: snapshot.isPlaying,
              hasData: snapshot.hasCurrentData,
            }
          },
          onError: (cause) =>
            deps.diagnostics.warn({
              scope: 'playback.achievements',
              message: 'Failed to record listening evidence',
              cause,
            }),
        })
      : undefined
  const effectivePlayTracker = new EffectivePlayTracker({
    isPlaybackCountable: (trackId) => {
      if (trackId !== state.currentTrackId) return false
      const snapshot = audioRuntime.getSnapshot()
      return snapshot.trackId === trackId && snapshot.isPlaying && snapshot.hasCurrentData
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

      return Number.isFinite(audioDuration) && audioDuration > 0
        ? audioDuration
        : trackDuration || null
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

  function commitCurrentTrack(
    track: PlaybackTrack,
    queue: readonly PlaybackTrack[],
    duration = 0,
  ): void {
    audioBuffering = false
    state.queue = playbackQueue(queue)
    state.currentIndex = queue.findIndex((t) => t.id === track.id)
    state.currentTrack = playbackTrack(track)
    state.currentTrackId = track.id
    state.selectedTrackId = track.id
    state.currentTime = 0
    state.duration = duration
    state.error = null
  }

  function applyTransitionPlan(plan: PlaybackTransitionPlan): void {
    navigationSession.applyPlan(plan, state.currentTrack, state.queue)
    effectivePlayTracker.end()
    listeningProgress?.end()
    commitCurrentTrack(plan.track, plan.queue, audioRuntime.getSnapshot().duration)
    effectivePlayTracker.start(plan.track.id)
    listeningProgress?.start(plan.track.id)
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
    return decision.kind === 'play' ? preparePlaybackPlan(decision.plan) : null
  }

  const gaplessSession = createGaplessPlaybackSession({
    audio: audioRuntime,
    getPlayback: () => ({
      currentTrackId: state.currentTrackId,
      currentTrack: state.currentTrack,
      paused: pausedByUser,
    }),
    getSettings: () => ({
      enabled: gaplessPlaybackEnabled.value,
      skipDigitalSilence: skipDigitalSilenceEnabled.value,
      softTransition: softTransitionEnabled.value,
      softTransitionDurationSeconds: softTransitionDurationSeconds.value,
    }),
    resolvePlan: resolveTransitionPlan,
    filterPlan: filterMissingFromPlan,
    resolveAudioUrl,
  })

  function invalidateNavigationDecision(resetContext = false): void {
    gaplessSession.navigationChanged(resetContext)
    playbackRequests.invalidatePlanning()
    gaplessSession.cancelPreload()
  }

  async function commitBoundary(nextTrackId: number | null): Promise<void> {
    const boundary = gaplessSession.acceptBoundary(nextTrackId)
    if (boundary.kind === 'ignore') return
    if (boundary.kind === 'entered') {
      if (missingTrackIds.has(boundary.plan.track.id)) {
        stopMissingCurrentTrack()
        return
      }
      playbackRequests.invalidate()
      const plan = !boundary.navigationStale
        ? filterMissingFromPlan(boundary.plan)
        : navigationSession.rebaseEnteredPlan(
            filterMissingFromPlan(boundary.plan) ?? boundary.plan,
            {
              queue: state.queue,
              currentIndex: state.currentIndex,
              currentTrackId: state.currentTrackId,
              currentTrack: state.currentTrack,
              playbackMode: state.playbackMode,
            },
            !boundary.contextStale,
          )
      if (!plan) return
      applyTransitionPlan(plan)
      if (!pausedByUser) void gaplessSession.refresh(plan.track.id)
      return
    }
    if (pausedByUser) return
    await advanceTrack('natural-ended')
  }

  // --- Internal track switch ---

  async function playTrackFromResolvedQueue(
    queue: readonly PlaybackTrack[],
    trackId: number,
    options?: {
      recordHistory?: boolean
      resetShuffleContext?: { shufflePool?: PlaybackTrack[]; shuffleCycle?: boolean }
    },
    requestToken?: PlaybackRequestToken,
  ): Promise<void> {
    const index = queue.findIndex((t) => t.id === trackId)
    if (index === -1) return
    const pendingToken = requestToken ?? playbackRequests.begin('loading')
    if (!playbackRequests.transition(pendingToken, 'loading')) return
    pausedByUser = false

    try {
      gaplessSession.endAudioLifetime()
      effectivePlayTracker.end()
      listeningProgress?.end()
      audioRuntime.clear({ replacing: true })

      if (options?.recordHistory !== false) {
        navigationSession.pushHistory(state.currentTrack, trackId, state.queue)
      }

      if (options?.resetShuffleContext) {
        navigationSession.resetForTrackSwitch(options.resetShuffleContext)
      }

      commitCurrentTrack(queue[index], queue, 0)
      state.isPlaying = false

      const audioUrl = await resolveAudioUrl(trackId)

      if (!playbackRequests.isCurrent(pendingToken)) {
        return
      }

      await audioRuntime.start(trackId, audioUrl.url, {
        decodeProbe: audioUrl.decodeProbe,
        preferGapless: gaplessPlaybackEnabled.value,
      })

      if (!playbackRequests.isCurrent(pendingToken)) {
        return
      }

      const snapshot = audioRuntime.getSnapshot()
      state.duration = snapshot.duration
      state.currentTime = snapshot.currentTime
      effectivePlayTracker.start(trackId)
      listeningProgress?.start(trackId)
      if (snapshot.kind === 'gapless' || snapshot.kind === 'mpv') {
        void gaplessSession.refresh(trackId)
      }
    } catch (err) {
      if (!playbackRequests.isCurrent(pendingToken)) {
        return
      }

      audioRuntime.clear()
      setPlaybackError(err)
    } finally {
      playbackRequests.finish(pendingToken)
    }
  }

  // --- Mode-aware advance ---

  async function advanceTrack(trigger: PlaybackAdvanceTrigger): Promise<void> {
    const pendingToken = playbackRequests.begin('planning')
    pausedByUser = false
    try {
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
      if (!playbackRequests.isCurrent(pendingToken)) return

      if (decision.kind === 'noop') {
        return
      }

      if (decision.kind === 'stop') {
        effectivePlayTracker.end()
        listeningProgress?.end()
        audioRuntime.pause()
        state.isPlaying = false
        if (decision.resetTime) {
          state.currentTime = 0
        }
        return
      }

      if (decision.kind === 'play') {
        const plan = preparePlaybackPlan(decision.plan)
        const snapshot = audioRuntime.getSnapshot()
        if (
          state.playbackMode === 'repeat-one' &&
          trigger === 'natural-ended' &&
          snapshot.kind === 'html-audio'
        ) {
          playbackRequests.transition(pendingToken, 'resuming')
          effectivePlayTracker.start(state.currentTrackId!)
          listeningProgress?.start(state.currentTrackId!)
          await audioRuntime.seek(0)
          if (!playbackRequests.isCurrent(pendingToken)) return
          state.currentTime = 0
          await audioRuntime.resume()
          return
        }

        navigationSession.applyPlan(plan, state.currentTrack, state.queue)
        await playTrackFromResolvedQueue(
          plan.queue,
          plan.track.id,
          {
            recordHistory: false,
          },
          pendingToken,
        )
      }
    } catch (err) {
      if (playbackRequests.isCurrent(pendingToken)) setPlaybackError(err)
    } finally {
      playbackRequests.finish(pendingToken)
    }
  }

  // --- Actions ---

  function selectTrack(trackId: number): void {
    state.selectedTrackId = trackId
  }

  async function resolveAudioUrl(trackId: number) {
    const result = await deps.getAudioUrl(trackId)

    if (!result?.url) {
      throw new Error('Audio file is unavailable')
    }

    return result
  }

  function setPlaybackMode(mode: PlaybackMode): void {
    if (state.playbackMode === mode) return
    commandRevision.value += 1
    queueSession.value = null
    invalidateNavigationDecision(true)
    state.playbackMode = mode
    navigationSession.setMode(mode)
    if (
      ['gapless', 'mpv'].includes(audioRuntime.getSnapshot().kind) &&
      state.currentTrackId &&
      state.isPlaying
    ) {
      void gaplessSession.refresh(state.currentTrackId)
    }
  }

  function setGaplessPlaybackEnabled(enabled: boolean): void {
    if (gaplessPlaybackEnabled.value === enabled) return

    gaplessPlaybackEnabled.value = enabled
    deps.storage.setItem(GAPLESS_PLAYBACK_KEY, String(enabled))

    if (!enabled) {
      gaplessSession.cancelPreload()
      return
    }

    if (
      ['gapless', 'mpv'].includes(audioRuntime.getSnapshot().kind) &&
      state.currentTrackId &&
      state.isPlaying
    ) {
      void gaplessSession.refresh(state.currentTrackId)
    }
  }

  function setSkipDigitalSilenceEnabled(enabled: boolean): void {
    skipDigitalSilenceEnabled.value = enabled
    deps.storage.setItem(DIGITAL_SILENCE_KEY, String(enabled))
    gaplessSession.cancelPreload()
    if (state.currentTrackId && state.isPlaying) void gaplessSession.refresh(state.currentTrackId)
  }

  function setSoftTransitionEnabled(enabled: boolean): void {
    if (softTransitionEnabled.value === enabled) return
    softTransitionEnabled.value = enabled
    deps.storage.setItem(SOFT_TRANSITION_KEY, String(enabled))
    gaplessSession.cancelPreload()
    if (state.currentTrackId && state.isPlaying) void gaplessSession.refresh(state.currentTrackId)
  }

  function setSoftTransitionDurationSeconds(seconds: number): void {
    if (!isSoftTransitionDuration(seconds) || softTransitionDurationSeconds.value === seconds)
      return
    softTransitionDurationSeconds.value = seconds
    deps.storage.setItem(SOFT_TRANSITION_DURATION_KEY, String(seconds))
    if (softTransitionEnabled.value && state.currentTrackId && state.isPlaying) {
      gaplessSession.cancelPreload()
      void gaplessSession.refresh(state.currentTrackId)
    }
  }

  async function playTrackFromQueue(
    queue: readonly PlaybackTrack[],
    trackId: number,
    options?: PlayTrackFromQueueOptions,
  ): Promise<void> {
    if (!queue.some((track) => track.id === trackId)) return
    commandRevision.value += 1
    // Explicit playback starts a new session even when the track IDs are unchanged.
    queueSession.value = { id: ++nextQueueSessionId, source: options?.source ?? 'default' }
    if (options?.replaceHistory) navigationSession.clearHistory()
    if (options?.playbackMode) {
      gaplessSession.cancelPreload()
      state.playbackMode = options.playbackMode
      navigationSession.setMode(options.playbackMode)
    }
    await playTrackFromResolvedQueue(queue, trackId, {
      recordHistory: !options?.replaceHistory,
      resetShuffleContext: {
        shufflePool: options?.shufflePool && playbackQueue(options.shufflePool),
        shuffleCycle: options?.shuffleCycle,
      },
    })
  }

  function replaceCurrentPlaybackQueue(options: ReplaceCurrentPlaybackQueueOptions): boolean {
    if (queueSession.value?.id !== options.expectedSessionId) return false
    if (state.currentTrackId !== options.expectedTrackId) {
      return false
    }
    if (
      state.queue.length !== options.expectedQueueTrackIds.length ||
      state.queue.some((track, index) => track.id !== options.expectedQueueTrackIds[index])
    ) {
      return false
    }
    const newIndex = options.queue.findIndex((track) => track.id === options.expectedTrackId)
    if (newIndex === -1) {
      return false
    }

    commandRevision.value += 1
    invalidateNavigationDecision(true)
    state.queue = playbackQueue(options.queue)
    state.currentIndex = newIndex
    state.playbackMode = options.playbackMode
    navigationSession.resetQueueContext({
      mode: options.playbackMode,
      shufflePool: options.shufflePool && playbackQueue(options.shufflePool),
      shuffleCycle: options.shuffleCycle,
    })

    if (
      ['gapless', 'mpv'].includes(audioRuntime.getSnapshot().kind) &&
      state.currentTrackId &&
      state.isPlaying
    ) {
      void gaplessSession.refresh(state.currentTrackId)
    }

    return true
  }

  function insertTrackAfterCurrent(track: PlaybackTrack): void {
    if (!state.currentTrack || state.currentIndex < 0) return
    const currentQueue = state.queue.length > 0 ? state.queue : [state.currentTrack]
    const insertion = navigationSession.insertSingleTrack(
      currentQueue,
      state.currentTrack.id,
      playbackTrack(track),
    )
    if (!insertion) return

    commandRevision.value += 1
    invalidateNavigationDecision()
    queueSession.value = null
    state.queue = insertion.queue
    state.currentIndex = insertion.currentIndex
    if (['gapless', 'mpv'].includes(audioRuntime.getSnapshot().kind) && state.currentTrackId) {
      void gaplessSession.refresh(state.currentTrackId)
    }
  }

  function insertTracksAfterCurrent(tracks: readonly PlaybackTrack[]): void {
    if (!state.currentTrack || state.currentIndex < 0) return
    const currentQueue = state.queue.length > 0 ? state.queue : [state.currentTrack]
    const insertion = navigationSession.insertMultipleTracks(
      currentQueue,
      state.currentTrack.id,
      playbackQueue(tracks),
    )
    if (!insertion) return

    commandRevision.value += 1
    invalidateNavigationDecision()
    queueSession.value = null
    state.queue = insertion.queue
    state.currentIndex = insertion.currentIndex
    if (['gapless', 'mpv'].includes(audioRuntime.getSnapshot().kind) && state.currentTrackId) {
      void gaplessSession.refresh(state.currentTrackId)
    }
  }

  async function resumeCurrentTrack(track: PlaybackTrack): Promise<void> {
    const snapshot = audioRuntime.getSnapshot()
    if (
      snapshot.kind === 'idle' ||
      snapshot.trackId !== track.id ||
      !effectivePlayTracker.hasSession(track.id)
    ) {
      await playTrackFromResolvedQueue(getQueueContainingCurrentTrack(track), track.id, {
        recordHistory: false,
      })
      return
    }

    const pendingToken = playbackRequests.begin('resuming')
    pausedByUser = false
    try {
      await audioRuntime.resume()

      if (!playbackRequests.isCurrent(pendingToken) || state.currentTrackId !== track.id) {
        return
      }

      if (['gapless', 'mpv'].includes(snapshot.kind) && state.currentTrackId) {
        void gaplessSession.refresh(state.currentTrackId)
      }
    } catch (err) {
      if (!playbackRequests.isCurrent(pendingToken) || state.currentTrackId !== track.id) {
        return
      }

      setPlaybackError(err)
    } finally {
      playbackRequests.finish(pendingToken)
    }
  }

  async function togglePlayPause(): Promise<void> {
    commandRevision.value += 1
    if (!state.currentTrack) return

    if (state.isPlaying) {
      pause()
      return
    }

    if (playbackRequests.pending.value) return
    await resumeCurrentTrack(state.currentTrack)
  }

  async function play(): Promise<void> {
    commandRevision.value += 1
    if (!state.currentTrack || state.isPlaying || playbackRequests.pending.value) return
    await resumeCurrentTrack(state.currentTrack)
  }

  function pause(): void {
    commandRevision.value += 1
    pausedByUser = true
    playbackRequests.invalidate()
    gaplessSession.cancelPreload()
    effectivePlayTracker.setPlaying(false)
    listeningProgress?.setPlaying(false)
    audioRuntime.pause()
    state.isPlaying = false
  }

  async function playPrevious(): Promise<void> {
    commandRevision.value += 1
    playbackRequests.invalidate()
    gaplessSession.navigationChanged(true)
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
      await seekCurrentTrack(0)
      return
    }
  }

  async function playNext(): Promise<void> {
    commandRevision.value += 1
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

    commandRevision.value += 1
    const nextTime = Math.min(duration, Math.max(0, targetTime))
    void seekCurrentTrack(nextTime).catch(setPlaybackError)
    state.currentTime = nextTime
  }

  async function seekCurrentTrack(time: number): Promise<void> {
    const trackId = state.currentTrackId
    if (trackId === null) return
    effectivePlayTracker.beginSeekingWithFallback()
    listeningProgress?.beginSeekingWithFallback()
    gaplessSession.cancelPreload()
    const isValidGeneration = gaplessSession.captureValidity()
    const isCurrentSeek = () =>
      isValidGeneration() &&
      state.currentTrackId === trackId &&
      audioRuntime.getSnapshot().trackId === trackId
    try {
      await audioRuntime.seek(time)
      if (!isCurrentSeek()) return
      state.currentTime = time
      if (!pausedByUser && ['gapless', 'mpv'].includes(audioRuntime.getSnapshot().kind)) {
        void gaplessSession.refresh(trackId)
      }
    } catch (error) {
      if (isCurrentSeek()) throw error
    }
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

  function filterMissingFromPlan(plan: PlaybackTransitionPlan): PlaybackTransitionPlan | null {
    if (missingTrackIds.has(plan.track.id)) return null
    return {
      ...plan,
      queue: plan.queue.filter((track) => !missingTrackIds.has(track.id)),
      nextShuffleCycle: plan.nextShuffleCycle
        ? {
            ...plan.nextShuffleCycle,
            remaining: plan.nextShuffleCycle.remaining.filter((id) => !missingTrackIds.has(id)),
          }
        : undefined,
      nextAlbumShuffleContext: plan.nextAlbumShuffleContext
        ? {
            ...plan.nextAlbumShuffleContext,
            tracks: plan.nextAlbumShuffleContext.tracks.filter(
              (track) => !missingTrackIds.has(track.id),
            ),
          }
        : plan.nextAlbumShuffleContext,
    }
  }

  function refreshRelocatedNext(trackIds: number[]): void {
    if (!state.currentTrackId) return
    // Re-resolve only the affected prepared file, preserving a random choice.
    // If the backend has already entered it, the pending boundary owns adoption.
    if (audioRuntime.getSnapshot().trackId !== state.currentTrackId) return
    const relocated = new Set(trackIds)
    const plan = gaplessSession.getPreparingPlan()
    if (!plan || (!relocated.has(plan.track.id) && !relocated.has(state.currentTrackId))) return
    void gaplessSession.refresh(state.currentTrackId, plan)
  }

  function stopMissingCurrentTrack(): void {
    pausedByUser = true
    playbackRequests.invalidate()
    effectivePlayTracker.end()
    listeningProgress?.end()
    gaplessSession.endAudioLifetime()
    audioRuntime.clear()
    state.currentIndex = -1
    state.currentTrack = null
    state.currentTrackId = null
    state.selectedTrackId = null
    state.currentTime = 0
    state.duration = 0
    state.isPlaying = false
    state.error = 'Audio file is unavailable. Please rescan the music library.'
  }

  function removeMissingTracksFromPlayback(trackIds: number[]): void {
    const missingIds = new Set(trackIds)
    if (missingIds.size === 0) return

    for (const id of missingIds) missingTrackIds.add(id)
    playbackRequests.invalidatePlanning()
    const preparingPlan = gaplessSession.getPreparingPlan()
    const nextMissing = preparingPlan !== null && missingIds.has(preparingPlan.track.id)
    const queueChanged = state.queue.some((track) => missingIds.has(track.id))
    const retainedPlan = preparingPlan && filterMissingFromPlan(preparingPlan)
    if (nextMissing) invalidateNavigationDecision()
    const { currentTrackMissing } = navigationSession.removeMissingTracks(
      missingIds,
      state.currentTrackId,
    )
    state.queue = state.queue.filter((track) => !missingIds.has(track.id))

    if (currentTrackMissing) {
      stopMissingCurrentTrack()
      return
    }

    state.currentIndex = state.currentTrackId
      ? state.queue.findIndex((track) => track.id === state.currentTrackId)
      : -1
    if (
      ['gapless', 'mpv'].includes(audioRuntime.getSnapshot().kind) &&
      state.currentTrackId &&
      state.isPlaying &&
      (nextMissing || queueChanged) &&
      audioRuntime.getSnapshot().trackId === state.currentTrackId
    ) {
      void gaplessSession.refresh(state.currentTrackId, retainedPlan ?? undefined)
    }
  }

  const metadataRevisions = new Map<number, number>()
  function visitPlaybackTracks(visit: (track: PlaybackTrack) => void): void {
    const queues = new Set<PlaybackTrack[]>()
    const visitQueue = (queue: PlaybackTrack[]) => {
      const key = toRaw(queue)
      if (queues.has(key)) return
      queues.add(key)
      for (const track of queue) visit(track)
    }
    if (state.currentTrack) visit(state.currentTrack)
    visitQueue(state.queue)
    navigationSession.visitTracks(visit, visitQueue)
    gaplessSession.visitPlans((plan) => {
      visit(plan.track)
      visitQueue(plan.queue)
      if (plan.nextAlbumShuffleContext) visitQueue(plan.nextAlbumShuffleContext.tracks)
    })
  }

  async function refreshPlaybackMetadata(trackIds: number[]): Promise<void> {
    if (!deps.getTrackMetadata) return
    const requested = new Set(trackIds)
    const relevant = new Set<number>()
    visitPlaybackTracks((track) => {
      if (requested.has(track.id)) relevant.add(track.id)
    })
    const results = await Promise.all(
      [...relevant].map(async (id) => {
        const revision = (metadataRevisions.get(id) ?? 0) + 1
        metadataRevisions.set(id, revision)
        try {
          const metadata = await deps.getTrackMetadata!(id)
          return metadata?.trackId === id ? { id, revision, metadata } : undefined
        } catch (cause) {
          deps.diagnostics.warn({
            scope: 'playback.metadata',
            message: 'Unable to refresh playback metadata',
            cause,
          })
          return undefined
        }
      }),
    )
    if (isDisposed) return
    const updates = new Map(
      results.flatMap((result) =>
        result && metadataRevisions.get(result.id) === result.revision
          ? [[result.id, result.metadata] as const]
          : [],
      ),
    )
    if (updates.size === 0) return
    // Re-read current targets after IPC: navigation may have changed while it
    // was pending. Two queue passes per batch, not two passes per changed ID.
    visitPlaybackTracks((track) => {
      const metadata = updates.get(track.id)
      if (metadata)
        Object.assign(track, {
          title: metadata.title,
          artist: metadata.artistDisplay,
          album: metadata.albumTitle,
          albumArtist: metadata.albumArtistDisplay,
        })
    })
  }

  const unsubscribeLibraryChanged = deps.onLibraryChanged((event) => {
    if (event.reason === 'metadata-refresh' || event.reason === 'file-change')
      void refreshPlaybackMetadata(event.trackIds)
    if (event.reason === 'play-stats-reset') {
      effectivePlayTracker.discardPendingRecords()
      listeningProgress?.discardPendingRecords()
    }
    if (event.reason === 'track-missing') removeMissingTracksFromPlayback(event.trackIds)
    if (['track-added', 'track-restored', 'track-relocated'].includes(event.reason)) {
      for (const id of event.trackIds) missingTrackIds.delete(id)
    }
    if (event.reason === 'track-relocated') refreshRelocatedNext(event.trackIds)
  })

  function dispose(): void {
    if (isDisposed) return
    isDisposed = true
    queueSession.value = null
    playbackRequests.invalidate()
    gaplessSession.dispose()
    missingTrackIds.clear()
    effectivePlayTracker.dispose()
    listeningProgress?.dispose()
    audioRuntime.dispose()
    unsubscribeLibraryChanged()
    navigationSession.clear()
  }

  const api: PlaybackPublicApi = {
    state: readonly(state),
    queueSession: readonly(queueSession),
    commandRevision: readonly(commandRevision),
    gaplessPlaybackEnabled: readonlyGaplessPlaybackEnabled,
    skipDigitalSilenceEnabled: readonly(skipDigitalSilenceEnabled),
    softTransitionEnabled: readonly(softTransitionEnabled),
    softTransitionDurationSeconds: readonly(softTransitionDurationSeconds),
    isPlaybackPending: playbackRequests.pending,
    selectTrack,
    playTrackFromQueue,
    replaceCurrentPlaybackQueue,
    insertTrackAfterCurrent,
    insertTracksAfterCurrent,
    setPlaybackMode,
    setGaplessPlaybackEnabled,
    setSkipDigitalSilenceEnabled,
    setSoftTransitionEnabled,
    setSoftTransitionDurationSeconds,
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
