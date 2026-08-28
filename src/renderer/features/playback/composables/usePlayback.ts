import { reactive, readonly, ref } from 'vue'
import type { PlaybackMode, PlaybackState, PlaybackTrack } from '../types'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { GaplessAudioEngine } from '../audio/gaplessAudioEngine'
import { EffectivePlayTracker } from '../core/effectivePlayTracker'
import {
  insertTrackAfterCurrent as buildSingleTrackInsertion,
  insertTracksAfterCurrent as buildMultiTrackInsertion,
  PlaybackHistory,
  type AlbumShuffleContext,
} from '../core/playbackQueueState'
import {
  findCurrentAlbumShuffleContext,
  getAlbumKey,
  resolvePlaybackTransition,
  selectRandomAlbumShuffleContext,
  type PlaybackTransitionPlan,
} from '../core/playbackTransitionPlanner'
import { createPlaybackRequestGate, type PlaybackRequestToken } from '../utils/playbackRequestGate'

const VOLUME_KEY = 'auralis-volume'
const GAPLESS_PLAYBACK_KEY = 'auralis-gapless-playback-enabled'

function readPersistedVolume(): number {
  const raw = localStorage.getItem(VOLUME_KEY)
  if (!raw) return 0.8
  const num = Number(raw)
  return Number.isFinite(num) && num >= 0 && num <= 1 ? num : 0.8
}

function readPersistedGaplessPlayback(): boolean {
  return localStorage.getItem(GAPLESS_PLAYBACK_KEY) !== 'false'
}

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value))
}

const audio = new Audio()
const gaplessPlaybackEnabled = ref(readPersistedGaplessPlayback())
const playbackPending = ref(false)
const readonlyPlaybackPending = readonly(playbackPending)
const playbackRequestGate = createPlaybackRequestGate()

function describeMediaError(code: number): string {
  switch (code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'fetch aborted'
    case MediaError.MEDIA_ERR_NETWORK:
      return 'network or protocol error'
    case MediaError.MEDIA_ERR_DECODE:
      return 'decode failed or unsupported/corrupt media'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'source not supported'
    default:
      return 'unknown media error'
  }
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
let audioSourceTrackId: number | null = null
let queuedNextTrackId: number | null = null
let transitionGeneration = 0

let scheduledPlan: PlaybackTransitionPlan | null = null

const playbackHistory = new PlaybackHistory()
let albumShuffleContext: AlbumShuffleContext = null
let shuffleTrackPool: PlaybackTrack[] | null = null

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

function clearHtmlAudioSource(): void {
  // Clear the identity before pause/load so late events from the previous
  // source cannot be mistaken for the current track.
  audioSourceTrackId = null
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
}

function hasCurrentHtmlAudioSource(trackId: number): boolean {
  return !gaplessEngine.isActive && audioSourceTrackId === trackId && Boolean(audio.src)
}

function getQueueContainingCurrentTrack(track: PlaybackTrack): PlaybackTrack[] {
  return state.queue.some((queuedTrack) => queuedTrack.id === track.id) ? state.queue : [track]
}

audio.volume = state.volume
audio.muted = state.isMuted

const gaplessEngine = new GaplessAudioEngine({
  onCurrentEnded: (nextTrackId) => {
    void commitGaplessBoundary(nextTrackId).catch(setPlaybackError)
  },
  onPlaybackStateChange: (isPlaying) => {
    state.isPlaying = isPlaying
  },
  onTimeUpdate: ({ currentTime, duration }) => {
    state.currentTime = currentTime
    state.duration = duration
  },
})
gaplessEngine.setVolume(state.volume, state.isMuted)

const effectivePlayTracker = new EffectivePlayTracker({
  isPlaybackCountable: (trackId) => {
    if (trackId !== state.currentTrackId) return false
    if (gaplessEngine.isActive) return gaplessEngine.getSnapshot().isPlaying
    if (audio.paused || audio.ended) return false
    return audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  },
  getDurationSeconds: () => {
    const snapshot = gaplessEngine.isActive ? gaplessEngine.getSnapshot() : null
    const audioDuration = snapshot
      ? snapshot.duration
      : Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : 0
    const trackDuration =
      state.currentTrack?.durationSeconds &&
      Number.isFinite(state.currentTrack.durationSeconds) &&
      state.currentTrack.durationSeconds > 0
        ? state.currentTrack.durationSeconds
        : 0

    return audioDuration || trackDuration || null
  },
  recordEffectivePlay: (payload) => auralis.playback.recordEffectivePlay(payload),
  onRecordError: (error) => {
    rendererDiagnostics.warn({
      scope: 'playback.statistics',
      message: 'Failed to record play count',
      cause: error,
    })
  },
})

// --- History helpers ---

function pushHistory(previousTrack: PlaybackTrack | null, nextTrackId: number): void {
  playbackHistory.push(previousTrack, nextTrackId, {
    queue: state.queue,
    albumShuffleContext,
    shuffleTrackPool,
  })
}

function applyTransitionPlan(plan: PlaybackTransitionPlan): void {
  if (plan.recordHistory) pushHistory(state.currentTrack, plan.track.id)
  if (plan.consumeQueued) queuedNextTrackId = null
  if (plan.nextAlbumShuffleContext !== undefined) {
    albumShuffleContext = plan.nextAlbumShuffleContext
  }
  effectivePlayTracker.end()
  state.queue = plan.queue
  state.currentIndex = plan.queue.findIndex((track) => track.id === plan.track.id)
  state.currentTrack = plan.track
  state.currentTrackId = plan.track.id
  state.selectedTrackId = plan.track.id
  state.currentTime = 0
  state.duration = gaplessEngine.getSnapshot().duration
  state.error = null
  effectivePlayTracker.start(plan.track.id)
}

async function resolveTransitionPlan(fromTrackId: number): Promise<PlaybackTransitionPlan | null> {
  if (state.currentTrackId !== fromTrackId) return null
  return resolvePlaybackTransition(
    {
      currentTrackId: state.currentTrackId,
      currentTrack: state.currentTrack,
      queue: state.queue,
      currentIndex: state.currentIndex,
      playbackMode: state.playbackMode,
      queuedNextTrackId,
      albumShuffleContext,
      shuffleTrackPool,
    },
    {
      getRandomTrack: async (excludeTrackId) =>
        (await auralis.playback.getRandomTrack(excludeTrackId)) as PlaybackTrack | null,
      getAlbumTracks: async (albumKey) =>
        (await auralis.playback.getAlbumTracks(albumKey)) as AlbumShuffleContext,
      getRandomAlbumTracks: async (excludeAlbumKey) =>
        (await auralis.playback.getRandomAlbumTracks(excludeAlbumKey)) as AlbumShuffleContext,
    },
  )
}

function invalidateGaplessTransition(): void {
  transitionGeneration += 1
  scheduledPlan = null
  gaplessEngine.cancelScheduledNext()
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
    gaplessEngine.cancelScheduledNext()
    return
  }

  const generation = ++transitionGeneration
  const requestId = playbackRequestId
  scheduledPlan = null
  gaplessEngine.cancelScheduledNext()

  try {
    if (!gaplessEngine.getSnapshot().isPlaying) return
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

    const scheduled = await gaplessEngine.scheduleNext(plan.track.id, url, {
      trimBoundarySilence: isSameAlbumBoundary(state.currentTrack, plan.track),
    })
    if (
      generation !== transitionGeneration ||
      requestId !== playbackRequestId ||
      state.currentTrackId !== fromTrackId
    ) {
      if (scheduled) gaplessEngine.cancelScheduledNext()
      return
    }
    if (scheduled) scheduledPlan = plan
  } catch {
    // Prefetch failure only disables the seamless hand-off. The existing ended path
    // remains responsible for starting the next track and surfacing real playback errors.
  }
}

async function commitGaplessBoundary(nextTrackId: number | null): Promise<void> {
  const plan = scheduledPlan
  scheduledPlan = null
  if (plan && nextTrackId === plan.track.id) {
    applyTransitionPlan(plan)
    void refreshGaplessNext(plan.track.id)
    return
  }
  // The audio clock has stopped.  Existing mode navigation will start the HTML fallback
  // or a fresh Web Audio source and preserves all legacy end-of-queue semantics.
  await handleTrackEnded()
}

// --- Internal track switch ---

async function playTrackFromResolvedQueue(
  queue: PlaybackTrack[],
  trackId: number,
  options?: { recordHistory?: boolean },
): Promise<void> {
  const index = queue.findIndex((t) => t.id === trackId)
  if (index === -1) return
  const requestId = ++playbackRequestId
  invalidateGaplessTransition()
  gaplessEngine.cancel()
  clearHtmlAudioSource()

  if (options?.recordHistory !== false) {
    pushHistory(state.currentTrack, trackId)
  }

  effectivePlayTracker.end()

  state.queue = queue
  state.currentIndex = index
  state.currentTrack = queue[index]
  state.currentTrackId = trackId
  state.selectedTrackId = trackId
  state.currentTime = 0
  state.duration = 0
  state.error = null
  state.isPlaying = false
  const pendingToken = beginPlaybackRequest()

  try {
    const audioUrl = await resolveAudioUrl(trackId)

    if (!isCurrentPlaybackRequest(pendingToken, requestId)) {
      return
    }

    const startedGapless =
      gaplessPlaybackEnabled.value && (await gaplessEngine.start(trackId, audioUrl))

    if (!isCurrentPlaybackRequest(pendingToken, requestId)) return

    if (startedGapless) {
      const snapshot = gaplessEngine.getSnapshot()
      state.duration = snapshot.duration
      state.currentTime = snapshot.currentTime
      effectivePlayTracker.start(trackId)
      void refreshGaplessNext(trackId)
      return
    }

    audioSourceTrackId = trackId
    audio.src = audioUrl
    audio.currentTime = 0
    await audio.play()

    if (!isCurrentPlaybackRequest(pendingToken, requestId)) {
      return
    }

    effectivePlayTracker.start(trackId)
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

function setPlaybackError(err: unknown): void {
  state.isPlaying = false
  state.error = err instanceof Error ? err.message : String(err)
}

// --- Audio events ---

audio.addEventListener('loadedmetadata', () => {
  if (audioSourceTrackId !== state.currentTrackId) return
  state.duration = audio.duration
})

audio.addEventListener('durationchange', () => {
  if (audioSourceTrackId !== state.currentTrackId) return
  state.duration = audio.duration
})

audio.addEventListener('timeupdate', () => {
  if (audioSourceTrackId !== state.currentTrackId) return
  state.currentTime = audio.currentTime
})

audio.addEventListener('play', () => {
  if (audioSourceTrackId !== state.currentTrackId) return
  state.isPlaying = true
})

audio.addEventListener('pause', () => {
  if (audioSourceTrackId !== state.currentTrackId) return
  state.isPlaying = false
})

audio.addEventListener('seeking', () => {
  effectivePlayTracker.beginSeekingWithFallback()
})

audio.addEventListener('seeked', () => {
  effectivePlayTracker.endSeeking()
})

audio.addEventListener('waiting', () => {
  effectivePlayTracker.setBuffering(true)
})

audio.addEventListener('stalled', () => {
  effectivePlayTracker.setBuffering(true)
})

audio.addEventListener('playing', () => {
  effectivePlayTracker.setBuffering(false)
})

audio.addEventListener('canplay', () => {
  effectivePlayTracker.setBuffering(false)
})

audio.addEventListener('ended', () => {
  if (audioSourceTrackId !== state.currentTrackId) return
  void handleTrackEnded().catch(setPlaybackError)
})

audio.addEventListener('error', () => {
  if (audioSourceTrackId !== state.currentTrackId) return
  audioSourceTrackId = null
  effectivePlayTracker.end()
  state.isPlaying = false
  const mediaError = audio.error
  const detail = mediaError
    ? `${describeMediaError(mediaError.code)} (${mediaError.code})`
    : 'unknown media error'
  state.error = `Audio error: ${detail}`
  rendererDiagnostics.error({
    scope: 'playback.audio',
    message: 'Audio playback failed',
    context: {
      trackId: state.currentTrackId,
      errorCode: mediaError?.code ?? null,
      errorDetail: detail,
      networkState: audio.networkState,
      readyState: audio.readyState,
    },
  })
})

// --- Mode-aware ended handler ---

async function handleTrackEnded(): Promise<void> {
  if (state.playbackMode !== 'repeat-one' && (await playQueuedNextTrack())) {
    return
  }

  switch (state.playbackMode) {
    case 'repeat-one':
      if (gaplessEngine.isActive && state.currentTrack) {
        await playTrackFromResolvedQueue(state.queue, state.currentTrack.id, {
          recordHistory: false,
        })
        return
      }
      effectivePlayTracker.start(state.currentTrackId!)
      audio.currentTime = 0
      state.currentTime = 0
      await audio.play()
      return
    case 'repeat-all':
      await playNextInQueue({ wrap: true })
      return
    case 'shuffle':
      await playRandomTrack()
      return
    case 'album-shuffle':
      await playNextAlbumShuffleTrack()
      return
    case 'sequential':
    default:
      await playNextInQueue({ wrap: false, stopAtEnd: true })
      return
  }
}

// --- Queue navigation helpers ---

async function playNextInQueue(options?: { wrap?: boolean; stopAtEnd?: boolean }): Promise<void> {
  if (state.queue.length === 0) return

  const nextIndex = state.currentIndex + 1

  if (nextIndex >= state.queue.length) {
    if (options?.wrap) {
      const track = state.queue[0]
      await playTrackFromResolvedQueue(state.queue, track.id)
      return
    }
    if (options?.stopAtEnd) {
      effectivePlayTracker.end()
      if (gaplessEngine.isActive) gaplessEngine.pause()
      else audio.pause()
      state.isPlaying = false
      state.currentTime = 0
      return
    }
    return
  }

  const track = state.queue[nextIndex]
  await playTrackFromResolvedQueue(state.queue, track.id)
}

async function playQueuedNextTrack(): Promise<boolean> {
  if (queuedNextTrackId === null) return false

  const trackId = queuedNextTrackId
  const nextTrack = state.queue[state.currentIndex + 1]
  queuedNextTrackId = null

  if (!nextTrack || nextTrack.id !== trackId) {
    return false
  }

  await playTrackFromResolvedQueue(state.queue, trackId, { recordHistory: true })
  return true
}

async function playPreviousInQueue(options?: { wrap?: boolean }): Promise<void> {
  if (state.queue.length === 0) return

  const prevIndex = state.currentIndex - 1

  if (prevIndex < 0) {
    if (options?.wrap) {
      const track = state.queue[state.queue.length - 1]
      await playTrackFromResolvedQueue(state.queue, track.id, { recordHistory: false })
      return
    }
    audio.currentTime = 0
    state.currentTime = 0
    return
  }

  const track = state.queue[prevIndex]
  await playTrackFromResolvedQueue(state.queue, track.id, { recordHistory: false })
}

// --- Random track ---

async function playRandomTrack(): Promise<void> {
  if (shuffleTrackPool && shuffleTrackPool.length > 0) {
    const candidates = shuffleTrackPool.filter((track) => track.id !== state.currentTrackId)
    if (candidates.length === 0) return

    const track = candidates[Math.floor(Math.random() * candidates.length)]
    await playTrackFromResolvedQueue(shuffleTrackPool, track.id, {
      recordHistory: true,
    })
    return
  }

  const track = await auralis.playback.getRandomTrack(state.currentTrackId ?? undefined)
  if (!track) return
  await playTrackFromResolvedQueue([track as PlaybackTrack], (track as PlaybackTrack).id, {
    recordHistory: true,
  })
}

// --- Album shuffle ---

async function playNextFromAlbumShuffleContext(): Promise<boolean> {
  if (!albumShuffleContext) return false

  const index = albumShuffleContext.tracks.findIndex((track) => track.id === state.currentTrackId)
  if (index === -1) {
    albumShuffleContext = null
    return false
  }

  const next = albumShuffleContext.tracks[index + 1]
  if (!next) {
    albumShuffleContext = null
    return false
  }

  await playTrackFromResolvedQueue(albumShuffleContext.tracks, next.id, {
    recordHistory: true,
  })
  return true
}

async function adoptCurrentAlbumShuffleContext(): Promise<boolean> {
  if (shuffleTrackPool?.length) {
    const context = findCurrentAlbumShuffleContext(shuffleTrackPool, state.currentTrackId)
    if (!context) return false

    albumShuffleContext = context
    return true
  }

  const currentAlbumKey = getAlbumKey(state.currentTrack)
  if (!currentAlbumKey || !state.currentTrackId) return false

  const currentAlbum = await auralis.playback.getAlbumTracks(currentAlbumKey)
  if (!currentAlbum || currentAlbum.tracks.length === 0) return false

  const context = currentAlbum as { albumArtist: string; album: string; tracks: PlaybackTrack[] }
  const currentIndex = context.tracks.findIndex((track) => track.id === state.currentTrackId)
  if (currentIndex === -1) return false

  albumShuffleContext = context
  return true
}

async function playNextAlbumShuffleTrack(): Promise<void> {
  if (await playNextFromAlbumShuffleContext()) {
    return
  }

  if (await adoptCurrentAlbumShuffleContext()) {
    if (await playNextFromAlbumShuffleContext()) {
      return
    }
  }

  const context = shuffleTrackPool?.length
    ? selectRandomAlbumShuffleContext(shuffleTrackPool, state.currentTrack)
    : ((await auralis.playback.getRandomAlbumTracks(getAlbumKey(state.currentTrack))) as Exclude<
        AlbumShuffleContext,
        null
      > | null)
  if (!context) return
  if (context.tracks.length === 0) return

  albumShuffleContext = context
  await playTrackFromResolvedQueue(context.tracks, context.tracks[0].id, {
    recordHistory: true,
  })
}

// --- Actions ---

function selectTrack(trackId: number): void {
  state.selectedTrackId = trackId
}

async function resolveAudioUrl(trackId: number): Promise<string> {
  const result = await auralis.playback.getAudioUrl(trackId)

  if (!result) {
    throw new Error('Audio file is unavailable')
  }

  return result.url
}

function setPlaybackMode(mode: PlaybackMode): void {
  invalidateGaplessTransition()
  state.playbackMode = mode
  if (mode !== 'album-shuffle') {
    albumShuffleContext = null
  }
  if (mode !== 'shuffle' && mode !== 'album-shuffle') {
    playbackHistory.clear()
  }
  if (gaplessEngine.isActive && state.currentTrackId && state.isPlaying) {
    void refreshGaplessNext(state.currentTrackId)
  }
}

function setGaplessPlaybackEnabled(enabled: boolean): void {
  if (gaplessPlaybackEnabled.value === enabled) return

  gaplessPlaybackEnabled.value = enabled
  localStorage.setItem(GAPLESS_PLAYBACK_KEY, String(enabled))

  if (!enabled) {
    // Keep the current Web Audio source playing, but remove its prepared hand-off.
    // The following track will start through HTMLAudio without interrupting this one.
    invalidateGaplessTransition()
    return
  }

  if (gaplessEngine.isActive && state.currentTrackId && state.isPlaying) {
    void refreshGaplessNext(state.currentTrackId)
  }
}

async function playTrackFromQueue(
  queue: PlaybackTrack[],
  trackId: number,
  options?: { shufflePool?: PlaybackTrack[] },
): Promise<void> {
  queuedNextTrackId = null
  const nextShuffleTrackPool = options?.shufflePool ?? null
  const playRequest = playTrackFromResolvedQueue(queue, trackId, { recordHistory: true })
  albumShuffleContext = null
  shuffleTrackPool = nextShuffleTrackPool
  await playRequest
}

function insertTrackAfterCurrent(track: PlaybackTrack): void {
  if (!state.currentTrack || state.currentIndex < 0) return
  const currentQueue = state.queue.length > 0 ? state.queue : [state.currentTrack]
  const insertion = buildSingleTrackInsertion(currentQueue, state.currentTrack.id, track)
  if (!insertion) return

  state.queue = insertion.queue
  state.currentIndex = insertion.currentIndex
  queuedNextTrackId = insertion.queuedTrackId
  if (gaplessEngine.isActive && state.currentTrackId) {
    void refreshGaplessNext(state.currentTrackId)
  }
}

function insertTracksAfterCurrent(tracks: PlaybackTrack[]): void {
  if (!state.currentTrack || state.currentIndex < 0) return
  const currentQueue = state.queue.length > 0 ? state.queue : [state.currentTrack]
  const insertion = buildMultiTrackInsertion(currentQueue, state.currentTrack.id, tracks)
  if (!insertion) return

  state.queue = insertion.queue
  state.currentIndex = insertion.currentIndex
  queuedNextTrackId = insertion.queuedTrackId
  if (gaplessEngine.isActive && state.currentTrackId) {
    void refreshGaplessNext(state.currentTrackId)
  }
}

async function togglePlayPause(): Promise<void> {
  if (!state.currentTrack || playbackPending.value) return

  if (state.isPlaying) {
    if (gaplessEngine.isActive) {
      invalidateGaplessTransition()
      gaplessEngine.pause()
    } else audio.pause()
    return
  }

  const track = state.currentTrack
  if (!gaplessEngine.isActive && !hasCurrentHtmlAudioSource(track.id)) {
    await playTrackFromResolvedQueue(getQueueContainingCurrentTrack(track), track.id, {
      recordHistory: false,
    })
    return
  }

  const requestId = playbackRequestId
  const pendingToken = beginPlaybackRequest()
  try {
    if (gaplessEngine.isActive) {
      await gaplessEngine.play()
      if (!isCurrentPlaybackRequest(pendingToken, requestId)) return
      if (state.currentTrackId) void refreshGaplessNext(state.currentTrackId)
    } else {
      await audio.play()
    }

    if (!isCurrentPlaybackRequest(pendingToken, requestId) || state.currentTrackId !== track.id) {
      return
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

async function play(): Promise<void> {
  if (!state.currentTrack || state.isPlaying || playbackPending.value) return

  const track = state.currentTrack
  if (!gaplessEngine.isActive && !hasCurrentHtmlAudioSource(track.id)) {
    await playTrackFromResolvedQueue(getQueueContainingCurrentTrack(track), track.id, {
      recordHistory: false,
    })
    return
  }

  const requestId = playbackRequestId
  const pendingToken = beginPlaybackRequest()
  try {
    if (gaplessEngine.isActive) {
      await gaplessEngine.play()
      if (!isCurrentPlaybackRequest(pendingToken, requestId)) return
      if (state.currentTrackId) void refreshGaplessNext(state.currentTrackId)
    } else await audio.play()

    if (!isCurrentPlaybackRequest(pendingToken, requestId) || state.currentTrackId !== track.id) {
      return
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

function pause(): void {
  if (gaplessEngine.isActive) {
    invalidateGaplessTransition()
    gaplessEngine.pause()
  } else audio.pause()
}

async function playPrevious(): Promise<void> {
  queuedNextTrackId = null

  if (state.playbackMode === 'shuffle' || state.playbackMode === 'album-shuffle') {
    const entry = playbackHistory.pop()
    if (entry) {
      albumShuffleContext = entry.albumShuffleContext
      shuffleTrackPool = entry.shuffleTrackPool
      await playTrackFromResolvedQueue(entry.queue, entry.track.id, { recordHistory: false })
      return
    }
  }

  const shouldWrap = state.playbackMode === 'repeat-all'
  await playPreviousInQueue({ wrap: shouldWrap })
}

async function playNext(): Promise<void> {
  if (await playQueuedNextTrack()) {
    return
  }

  switch (state.playbackMode) {
    case 'repeat-all':
      await playNextInQueue({ wrap: true })
      return
    case 'shuffle':
      await playRandomTrack()
      return
    case 'album-shuffle':
      await playNextAlbumShuffleTrack()
      return
    case 'repeat-one':
    case 'sequential':
    default:
      await playNextInQueue({ wrap: false })
      return
  }
}

function seekByRatio(ratio: number): void {
  if (!state.currentTrack || !Number.isFinite(ratio)) return

  const snapshot = gaplessEngine.isActive ? gaplessEngine.getSnapshot() : null
  const duration =
    snapshot?.duration ??
    (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0)

  if (!duration) return

  const clampedRatio = Math.min(1, Math.max(0, ratio))
  const nextTime = duration * clampedRatio
  effectivePlayTracker.beginSeekingWithFallback()
  if (gaplessEngine.isActive) {
    invalidateGaplessTransition()
    void gaplessEngine.seek(nextTime).then(() => {
      if (state.currentTrackId) void refreshGaplessNext(state.currentTrackId)
    })
  } else audio.currentTime = nextTime
  state.currentTime = nextTime
}

function seekTo(time: number): void {
  if (!state.currentTrack || !Number.isFinite(time)) return

  const snapshot = gaplessEngine.isActive ? gaplessEngine.getSnapshot() : null
  const duration =
    snapshot?.duration ??
    (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0)

  if (!duration) return

  const nextTime = Math.min(duration, Math.max(0, time))
  effectivePlayTracker.beginSeekingWithFallback()
  if (gaplessEngine.isActive) {
    invalidateGaplessTransition()
    void gaplessEngine.seek(nextTime).then(() => {
      if (state.currentTrackId) void refreshGaplessNext(state.currentTrackId)
    })
  } else audio.currentTime = nextTime
  state.currentTime = nextTime
}

function setVolume(volume: number): void {
  const clamped = clampVolume(volume)
  state.volume = clamped
  audio.volume = clamped
  gaplessEngine.setVolume(clamped, state.isMuted)
  if (clamped > 0) {
    lastAudibleVolume = clamped
  }
  if (state.isMuted) {
    state.isMuted = false
    audio.muted = false
    gaplessEngine.setVolume(state.volume, false)
  }
  localStorage.setItem(VOLUME_KEY, String(clamped))
}

function toggleMute(): void {
  if (state.isMuted) {
    state.isMuted = false
    audio.muted = false

    if (state.volume <= 0) {
      setVolume(lastAudibleVolume)
    }

    return
  }

  if (state.volume > 0) {
    lastAudibleVolume = state.volume
  }

  state.isMuted = true
  audio.muted = true
  gaplessEngine.setVolume(state.volume, true)
}

function removeMissingTracksFromPlayback(trackIds: number[]): void {
  const missingIds = new Set(trackIds)
  if (missingIds.size === 0) return

  const currentTrackMissing = state.currentTrackId !== null && missingIds.has(state.currentTrackId)
  state.queue = state.queue.filter((track) => !missingIds.has(track.id))
  shuffleTrackPool = shuffleTrackPool?.filter((track) => !missingIds.has(track.id)) ?? null
  if (albumShuffleContext) {
    const tracks = albumShuffleContext.tracks.filter((track) => !missingIds.has(track.id))
    albumShuffleContext = tracks.length > 0 ? { ...albumShuffleContext, tracks } : null
  }
  playbackHistory.removeTracks(missingIds)

  if (queuedNextTrackId !== null && missingIds.has(queuedNextTrackId)) {
    queuedNextTrackId = null
  }

  if (currentTrackMissing) {
    playbackRequestId += 1
    invalidatePlaybackRequest()
    invalidateGaplessTransition()
    gaplessEngine.cancel()
    clearHtmlAudioSource()
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
  if (gaplessEngine.isActive && state.currentTrackId && state.isPlaying) {
    void refreshGaplessNext(state.currentTrackId)
  }
}

const unsubscribeLibraryChanged = auralis.library.onChanged((event) => {
  if (event.reason === 'track-missing') removeMissingTracksFromPlayback(event.trackIds)
})

function disposePlayback(): void {
  playbackRequestId += 1
  invalidatePlaybackRequest()
  invalidateGaplessTransition()
  effectivePlayTracker.end()
  clearHtmlAudioSource()
  gaplessEngine.destroy()
  unsubscribeLibraryChanged()
}

window.addEventListener('beforeunload', disposePlayback, { once: true })

export function usePlayback() {
  return {
    state,
    gaplessPlaybackEnabled,
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
  }
}
