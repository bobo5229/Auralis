import { reactive } from 'vue'
import type { PlaybackMode, PlaybackState, PlaybackTrack } from '../types'
import { auralis } from '@renderer/shared/ipc/client'

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
  startedAt: number
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

// Album shuffle context
type AlbumShuffleContext = {
  albumArtist: string
  album: string
  tracks: PlaybackTrack[]
} | null

// History entry stores full context for correct restoration
type HistoryEntry = {
  track: PlaybackTrack
  queue: PlaybackTrack[]
  albumShuffleContext: AlbumShuffleContext
}

let playbackHistory: HistoryEntry[] = []
let albumShuffleContext: AlbumShuffleContext = null

audio.volume = state.volume
audio.muted = state.isMuted

// --- Play count helpers ---

function isAudioCountable(): boolean {
  if (!playCountSession) return false
  if (playCountSession.counted) return false
  if (playCountSession.trackId !== state.currentTrackId) return false
  if (audio.paused) return false
  if (audio.ended) return false
  if (isPlayCountBuffering) return false
  if (isPlayCountSeeking) return false
  if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false
  return true
}

function getEffectiveDuration(): number | null {
  const audioDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
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
    startedAt: now,
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
  session.counted = true
  session.countInFlight = true

  const payload = {
    trackId: session.trackId,
    sessionId: session.sessionId,
    playedAtIso: new Date().toISOString(),
  }

  auralis.playback
    .recordEffectivePlay(payload)
    .catch((err) => {
      console.warn('[Auralis playback] Failed to record play count', err)
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
  })
  if (playbackHistory.length > HISTORY_LIMIT) {
    playbackHistory = playbackHistory.slice(-HISTORY_LIMIT)
  }
}

function popHistory(): HistoryEntry | null {
  return playbackHistory.pop() ?? null
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
      audio.pause()
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
  state.playbackMode = mode
  if (mode !== 'album-shuffle') {
    albumShuffleContext = null
  }
  if (mode !== 'shuffle' && mode !== 'album-shuffle') {
    playbackHistory = []
  }
}

async function playTrackFromQueue(queue: PlaybackTrack[], trackId: number): Promise<void> {
  queuedNextTrackId = null
  await playTrackFromResolvedQueue(queue, trackId, { recordHistory: true })
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
}

async function togglePlayPause(): Promise<void> {
  if (!state.currentTrack) return

  try {
    if (state.isPlaying) {
      audio.pause()
    } else {
      await audio.play()
    }
  } catch (err) {
    state.isPlaying = false
    state.error = err instanceof Error ? err.message : String(err)
  }
}

async function play(): Promise<void> {
  if (!state.currentTrack) return

  try {
    await audio.play()
  } catch (err) {
    state.isPlaying = false
    state.error = err instanceof Error ? err.message : String(err)
  }
}

function pause(): void {
  audio.pause()
}

async function playPrevious(): Promise<void> {
  queuedNextTrackId = null

  if (state.playbackMode === 'shuffle' || state.playbackMode === 'album-shuffle') {
    const entry = popHistory()
    if (entry) {
      albumShuffleContext = entry.albumShuffleContext
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

  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0

  if (!duration) return

  const clampedRatio = Math.min(1, Math.max(0, ratio))
  const nextTime = duration * clampedRatio
  setSeekingWithFallback()
  resetPlayCountSample()
  audio.currentTime = nextTime
  state.currentTime = nextTime
}

function seekTo(time: number): void {
  if (!state.currentTrack || !Number.isFinite(time)) return

  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0

  if (!duration) return

  const nextTime = Math.min(duration, Math.max(0, time))
  setSeekingWithFallback()
  resetPlayCountSample()
  audio.currentTime = nextTime
  state.currentTime = nextTime
}

function setVolume(volume: number): void {
  const clamped = clampVolume(volume)
  state.volume = clamped
  audio.volume = clamped
  if (clamped > 0) {
    lastAudibleVolume = clamped
  }
  if (state.isMuted) {
    state.isMuted = false
    audio.muted = false
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
}

export function usePlayback() {
  return {
    state,
    selectTrack,
    playTrackFromQueue,
    insertTrackAfterCurrent,
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
