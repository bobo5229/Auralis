import { reactive } from 'vue'
import type { PlaybackMode, PlaybackState, PlaybackTrack } from '../types'
import { auralis } from '@renderer/shared/ipc/client'
import { GaplessAudioEngine } from '../audio/gaplessAudioEngine'

const VOLUME_KEY = 'auralis-volume'
const HISTORY_LIMIT = 100

// Play count tracking
const PLAY_COUNT_THRESHOLD_RATIO = 0.55
const PLAY_COUNT_TICK_MS = 1000
const MAX_REALTIME_DELTA_SECONDS = 2.5
const MIN_COUNTABLE_DURATION_SECONDS = 5
const MAX_COUNTABLE_DURATION_SECONDS = 24 * 60 * 60

type PlayCountSession = {
  sessionId: string
  trackId: number
  lastSampleAt: number
  realPlayedSeconds: number
  counted: boolean
  countInFlight: boolean
}

let playCountSession: PlayCountSession | null = null
let playCountTimer: ReturnType<typeof setInterval> | null = null
let isPlayCountBuffering = false
let isPlayCountSeeking = false
let seekFallbackTimer: ReturnType<typeof setTimeout> | null = null

const SEEK_FALLBACK_MS = 300

function setSeekingWithFallback(): void {
  isPlayCountSeeking = true
  if (seekFallbackTimer) clearTimeout(seekFallbackTimer)
  seekFallbackTimer = setTimeout(() => {
    isPlayCountSeeking = false
    resetPlayCountSample()
    seekFallbackTimer = null
  }, SEEK_FALLBACK_MS)
}

function clearSeekFallback(): void {
  if (seekFallbackTimer) {
    clearTimeout(seekFallbackTimer)
    seekFallbackTimer = null
  }
}

function readPersistedVolume(): number {
  const raw = localStorage.getItem(VOLUME_KEY)
  if (!raw) return 0.8
  const num = Number(raw)
  return Number.isFinite(num) && num >= 0 && num <= 1 ? num : 0.8
}

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value))
}

const audio = new Audio()

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
let queuedNextTrackId: number | null = null
let transitionGeneration = 0

// Album shuffle context
type AlbumShuffleContext = {
  albumArtist: string
  album: string
  tracks: PlaybackTrack[]
} | null

type TransitionPlan = {
  queue: PlaybackTrack[]
  track: PlaybackTrack
  recordHistory: boolean
  consumeQueued: boolean
  nextAlbumShuffleContext?: AlbumShuffleContext
}

let scheduledPlan: TransitionPlan | null = null

// History entry stores full context for correct restoration
type HistoryEntry = {
  track: PlaybackTrack
  queue: PlaybackTrack[]
  albumShuffleContext: AlbumShuffleContext
  shuffleTrackPool: PlaybackTrack[] | null
}

let playbackHistory: HistoryEntry[] = []
let albumShuffleContext: AlbumShuffleContext = null
let shuffleTrackPool: PlaybackTrack[] | null = null

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

// --- Play count helpers ---

function isAudioCountable(): boolean {
  if (!playCountSession) return false
  if (playCountSession.counted) return false
  if (playCountSession.trackId !== state.currentTrackId) return false
  if (gaplessEngine.isActive) return gaplessEngine.getSnapshot().isPlaying
  if (audio.paused || audio.ended) return false
  if (isPlayCountBuffering) return false
  if (isPlayCountSeeking) return false
  if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false
  return true
}

function getEffectiveDuration(): number | null {
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

  const duration = audioDuration || trackDuration
  if (duration < MIN_COUNTABLE_DURATION_SECONDS || duration > MAX_COUNTABLE_DURATION_SECONDS) {
    return null
  }

  return duration
}

function startPlayCountSession(trackId: number): void {
  if (playCountTimer) {
    clearInterval(playCountTimer)
    playCountTimer = null
  }

  isPlayCountBuffering = false
  isPlayCountSeeking = false

  const now = performance.now()
  playCountSession = {
    sessionId: `${trackId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    trackId,
    lastSampleAt: now,
    realPlayedSeconds: 0,
    counted: false,
    countInFlight: false,
  }

  playCountTimer = setInterval(tickPlayCountSession, PLAY_COUNT_TICK_MS)
}

function endPlayCountSession(): void {
  if (playCountTimer) {
    clearInterval(playCountTimer)
    playCountTimer = null
  }
  clearSeekFallback()
  isPlayCountSeeking = false
  isPlayCountBuffering = false
  playCountSession = null
}

function resetPlayCountSample(): void {
  if (playCountSession) {
    playCountSession.lastSampleAt = performance.now()
  }
}

function tickPlayCountSession(): void {
  const session = playCountSession
  if (!session || session.counted || session.countInFlight) return

  const now = performance.now()

  if (isAudioCountable()) {
    const deltaSeconds = Math.min((now - session.lastSampleAt) / 1000, MAX_REALTIME_DELTA_SECONDS)
    session.realPlayedSeconds += deltaSeconds
  }

  session.lastSampleAt = now

  const effectiveDuration = getEffectiveDuration()
  if (!effectiveDuration) return

  if (session.realPlayedSeconds >= effectiveDuration * PLAY_COUNT_THRESHOLD_RATIO) {
    tryRecordEffectivePlay(session)
  }
}

function tryRecordEffectivePlay(session: PlayCountSession): void {
  if (session.counted || session.countInFlight) return
  session.countInFlight = true

  const payload = {
    trackId: session.trackId,
    sessionId: session.sessionId,
    playedAtIso: new Date().toISOString(),
  }

  auralis.playback
    .recordEffectivePlay(payload)
    .then((result) => {
      // Only mark counted after successful persistence
      if (result.ok) {
        session.counted = true
      }
    })
    .catch((err) => {
      console.warn('[Auralis playback] Failed to record play count', err)
      // counted stays false — the next tick will retry
    })
    .finally(() => {
      session.countInFlight = false
    })
}

// --- History helpers ---

function pushHistory(previousTrack: PlaybackTrack | null, nextTrackId: number): void {
  if (!previousTrack) return
  if (previousTrack.id === nextTrackId) return
  playbackHistory.push({
    track: previousTrack,
    queue: state.queue,
    albumShuffleContext,
    shuffleTrackPool,
  })
  if (playbackHistory.length > HISTORY_LIMIT) {
    playbackHistory = playbackHistory.slice(-HISTORY_LIMIT)
  }
}

function popHistory(): HistoryEntry | null {
  return playbackHistory.pop() ?? null
}

function applyTransitionPlan(plan: TransitionPlan): void {
  if (plan.recordHistory) pushHistory(state.currentTrack, plan.track.id)
  if (plan.consumeQueued) queuedNextTrackId = null
  if (plan.nextAlbumShuffleContext !== undefined) {
    albumShuffleContext = plan.nextAlbumShuffleContext
  }
  endPlayCountSession()
  state.queue = plan.queue
  state.currentIndex = plan.queue.findIndex((track) => track.id === plan.track.id)
  state.currentTrack = plan.track
  state.currentTrackId = plan.track.id
  state.selectedTrackId = plan.track.id
  state.currentTime = 0
  state.duration = gaplessEngine.getSnapshot().duration
  state.error = null
  startPlayCountSession(plan.track.id)
}

async function resolveTransitionPlan(fromTrackId: number): Promise<TransitionPlan | null> {
  if (state.currentTrackId !== fromTrackId) return null
  const queue = state.queue
  const index = state.currentIndex
  const queued = queuedNextTrackId
  if (state.playbackMode !== 'repeat-one' && queued !== null) {
    const next = queue[index + 1]
    if (next?.id === queued) return { queue, track: next, recordHistory: true, consumeQueued: true }
  }
  if (state.playbackMode === 'repeat-one' && state.currentTrack) {
    return { queue, track: state.currentTrack, recordHistory: false, consumeQueued: false }
  }
  if (state.playbackMode === 'sequential' || state.playbackMode === 'repeat-all') {
    const next = queue[index + 1] ?? (state.playbackMode === 'repeat-all' ? queue[0] : undefined)
    return next ? { queue, track: next, recordHistory: true, consumeQueued: false } : null
  }
  if (state.playbackMode === 'shuffle') {
    if (shuffleTrackPool?.length) {
      const candidates = shuffleTrackPool.filter((track) => track.id !== fromTrackId)
      const track = candidates[Math.floor(Math.random() * candidates.length)]
      return track
        ? { queue: shuffleTrackPool, track, recordHistory: true, consumeQueued: false }
        : null
    }
    const track = (await auralis.playback.getRandomTrack(fromTrackId)) as PlaybackTrack | null
    return track ? { queue: [track], track, recordHistory: true, consumeQueued: false } : null
  }
  if (state.playbackMode === 'album-shuffle') {
    let context = albumShuffleContext
    if (!context) {
      const currentAlbumKey = getCurrentAlbumKey()
      if (currentAlbumKey) {
        const currentAlbum = await auralis.playback.getAlbumTracks(currentAlbumKey)
        const candidate = currentAlbum as AlbumShuffleContext
        if (candidate?.tracks.some((track) => track.id === fromTrackId)) context = candidate
      }
    }

    if (context) {
      const albumIndex = context.tracks.findIndex((track) => track.id === fromTrackId)
      const track = context.tracks[albumIndex + 1]
      if (track) {
        return {
          queue: context.tracks,
          track,
          recordHistory: true,
          consumeQueued: false,
          nextAlbumShuffleContext: context,
        }
      }
    }

    const nextAlbum = await auralis.playback.getRandomAlbumTracks(getCurrentAlbumKey())
    const nextContext = nextAlbum as AlbumShuffleContext
    const track = nextContext?.tracks[0]
    return track
      ? {
          queue: nextContext!.tracks,
          track,
          recordHistory: true,
          consumeQueued: false,
          nextAlbumShuffleContext: nextContext,
        }
      : null
  }
  return null
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
  audio.pause()

  if (options?.recordHistory !== false) {
    pushHistory(state.currentTrack, trackId)
  }

  endPlayCountSession()

  state.queue = queue
  state.currentIndex = index
  state.currentTrack = queue[index]
  state.currentTrackId = trackId
  state.selectedTrackId = trackId
  state.currentTime = 0
  state.duration = 0
  state.error = null

  try {
    const audioUrl = await resolveAudioUrl(trackId)

    if (requestId !== playbackRequestId) {
      return
    }

    const startedGapless = await gaplessEngine.start(trackId, audioUrl)

    if (requestId !== playbackRequestId) return

    if (startedGapless) {
      const snapshot = gaplessEngine.getSnapshot()
      state.duration = snapshot.duration
      state.currentTime = snapshot.currentTime
      startPlayCountSession(trackId)
      void refreshGaplessNext(trackId)
      return
    }

    audio.src = audioUrl
    audio.currentTime = 0
    await audio.play()

    if (requestId !== playbackRequestId) {
      return
    }

    startPlayCountSession(trackId)
  } catch (err) {
    if (requestId !== playbackRequestId) {
      return
    }

    state.isPlaying = false
    state.error = err instanceof Error ? err.message : String(err)
  }
}

function setPlaybackError(err: unknown): void {
  state.isPlaying = false
  state.error = err instanceof Error ? err.message : String(err)
}

// --- Audio events ---

audio.addEventListener('loadedmetadata', () => {
  state.duration = audio.duration
})

audio.addEventListener('durationchange', () => {
  state.duration = audio.duration
})

audio.addEventListener('timeupdate', () => {
  state.currentTime = audio.currentTime
})

audio.addEventListener('play', () => {
  state.isPlaying = true
})

audio.addEventListener('pause', () => {
  state.isPlaying = false
})

audio.addEventListener('seeking', () => {
  setSeekingWithFallback()
  resetPlayCountSample()
})

audio.addEventListener('seeked', () => {
  clearSeekFallback()
  isPlayCountSeeking = false
  resetPlayCountSample()
})

audio.addEventListener('waiting', () => {
  isPlayCountBuffering = true
  resetPlayCountSample()
})

audio.addEventListener('stalled', () => {
  isPlayCountBuffering = true
  resetPlayCountSample()
})

audio.addEventListener('playing', () => {
  isPlayCountBuffering = false
  resetPlayCountSample()
})

audio.addEventListener('canplay', () => {
  isPlayCountBuffering = false
})

audio.addEventListener('ended', () => {
  void handleTrackEnded().catch(setPlaybackError)
})

audio.addEventListener('error', () => {
  endPlayCountSession()
  state.isPlaying = false
  const mediaError = audio.error
  const detail = mediaError
    ? `${describeMediaError(mediaError.code)} (${mediaError.code})`
    : 'unknown media error'
  state.error = `Audio error: ${detail}`
  console.error('[Auralis playback] Audio failed', {
    trackId: state.currentTrackId,
    title: state.currentTrack?.title,
    artist: state.currentTrack?.artist,
    src: audio.currentSrc || audio.src,
    errorCode: mediaError?.code ?? null,
    errorMessage: mediaError?.message ?? null,
    networkState: audio.networkState,
    readyState: audio.readyState,
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
      startPlayCountSession(state.currentTrackId!)
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
      endPlayCountSession()
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
  const currentAlbumKey = getCurrentAlbumKey()
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

  const excludeAlbumKey = getCurrentAlbumKey()
  const nextAlbum = await auralis.playback.getRandomAlbumTracks(excludeAlbumKey)
  if (!nextAlbum) return

  const context = nextAlbum as { albumArtist: string; album: string; tracks: PlaybackTrack[] }
  if (context.tracks.length === 0) return

  albumShuffleContext = context
  await playTrackFromResolvedQueue(context.tracks, context.tracks[0].id, {
    recordHistory: true,
  })
}

function getCurrentAlbumKey(): { albumArtist: string; album: string } | undefined {
  const track = state.currentTrack
  if (!track?.album) return undefined
  return {
    albumArtist: track.albumArtist || track.artist || '',
    album: track.album,
  }
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
    playbackHistory = []
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
  shuffleTrackPool = nextShuffleTrackPool
  await playRequest
}

function insertTrackAfterCurrent(track: PlaybackTrack): void {
  if (!state.currentTrack || state.currentIndex < 0) return
  if (track.id === state.currentTrackId) return

  const currentQueue = state.queue.length > 0 ? state.queue : [state.currentTrack]
  const withoutInsertedTrack = currentQueue.filter((queueTrack) => queueTrack.id !== track.id)
  const currentIndex = withoutInsertedTrack.findIndex(
    (queueTrack) => queueTrack.id === state.currentTrackId,
  )

  if (currentIndex < 0) return

  const nextQueue = [...withoutInsertedTrack]
  nextQueue.splice(currentIndex + 1, 0, track)

  state.queue = nextQueue
  state.currentIndex = currentIndex
  queuedNextTrackId = track.id
  if (gaplessEngine.isActive && state.currentTrackId) {
    void refreshGaplessNext(state.currentTrackId)
  }
}

function insertTracksAfterCurrent(tracks: PlaybackTrack[]): void {
  if (!state.currentTrack || state.currentIndex < 0) return

  const insertIds = new Set(tracks.map((t) => t.id))
  insertIds.delete(state.currentTrackId!)

  const filtered = tracks.filter((t) => insertIds.has(t.id))
  if (filtered.length === 0) return

  const currentQueue = state.queue.length > 0 ? state.queue : [state.currentTrack]
  const withoutInserted = currentQueue.filter((t) => !insertIds.has(t.id))
  const currentIndex = withoutInserted.findIndex((t) => t.id === state.currentTrackId)

  if (currentIndex < 0) return

  const nextQueue = [...withoutInserted]
  nextQueue.splice(currentIndex + 1, 0, ...filtered)

  state.queue = nextQueue
  state.currentIndex = currentIndex
  queuedNextTrackId = filtered[0].id
  if (gaplessEngine.isActive && state.currentTrackId) {
    void refreshGaplessNext(state.currentTrackId)
  }
}

async function togglePlayPause(): Promise<void> {
  if (!state.currentTrack) return

  try {
    if (state.isPlaying) {
      if (gaplessEngine.isActive) {
        invalidateGaplessTransition()
        gaplessEngine.pause()
      } else audio.pause()
    } else {
      if (gaplessEngine.isActive) {
        await gaplessEngine.play()
        if (state.currentTrackId) void refreshGaplessNext(state.currentTrackId)
      } else await audio.play()
    }
  } catch (err) {
    state.isPlaying = false
    state.error = err instanceof Error ? err.message : String(err)
  }
}

async function play(): Promise<void> {
  if (!state.currentTrack) return

  try {
    if (gaplessEngine.isActive) {
      await gaplessEngine.play()
      if (state.currentTrackId) void refreshGaplessNext(state.currentTrackId)
    } else await audio.play()
  } catch (err) {
    state.isPlaying = false
    state.error = err instanceof Error ? err.message : String(err)
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
    const entry = popHistory()
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
  setSeekingWithFallback()
  resetPlayCountSample()
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
  setSeekingWithFallback()
  resetPlayCountSample()
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
  playbackHistory = playbackHistory
    .filter((entry) => !missingIds.has(entry.track.id))
    .map((entry) => ({
      ...entry,
      queue: entry.queue.filter((track) => !missingIds.has(track.id)),
      shuffleTrackPool:
        entry.shuffleTrackPool?.filter((track) => !missingIds.has(track.id)) ?? null,
      albumShuffleContext: entry.albumShuffleContext
        ? {
            ...entry.albumShuffleContext,
            tracks: entry.albumShuffleContext.tracks.filter((track) => !missingIds.has(track.id)),
          }
        : null,
    }))

  if (queuedNextTrackId !== null && missingIds.has(queuedNextTrackId)) {
    queuedNextTrackId = null
  }

  if (currentTrackMissing) {
    playbackRequestId += 1
    invalidateGaplessTransition()
    gaplessEngine.cancel()
    audio.pause()
    endPlayCountSession()
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
  invalidateGaplessTransition()
  endPlayCountSession()
  if (seekFallbackTimer) {
    clearTimeout(seekFallbackTimer)
    seekFallbackTimer = null
  }
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
  gaplessEngine.destroy()
  unsubscribeLibraryChanged()
}

window.addEventListener('beforeunload', disposePlayback, { once: true })

export function usePlayback() {
  return {
    state,
    selectTrack,
    playTrackFromQueue,
    insertTrackAfterCurrent,
    insertTracksAfterCurrent,
    setPlaybackMode,
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
