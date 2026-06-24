import { reactive } from 'vue'
import type { PlaybackState, PlaybackTrack } from '../types'
import { getAudioUrl } from '../utils/audioUrl'

const VOLUME_KEY = 'auralis-volume'

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

const state = reactive<PlaybackState>({
  queue: [],
  currentIndex: -1,
  currentTrack: null,
  selectedTrackId: null,
  currentTrackId: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: readPersistedVolume(),
  error: null,
})

audio.volume = state.volume

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

audio.addEventListener('ended', () => {
  if (state.currentIndex < state.queue.length - 1) {
    playNext()
  } else {
    state.isPlaying = false
    state.currentTime = 0
  }
})

audio.addEventListener('error', () => {
  state.isPlaying = false
  const mediaError = audio.error
  state.error = mediaError ? `Audio error: ${mediaError.code}` : 'Unknown audio error'
})

// --- Actions ---

function selectTrack(trackId: number): void {
  state.selectedTrackId = trackId
}

async function playTrackFromQueue(queue: PlaybackTrack[], trackId: number): Promise<void> {
  const index = queue.findIndex((t) => t.id === trackId)
  if (index === -1) return

  state.queue = queue
  state.currentIndex = index
  state.currentTrack = queue[index]
  state.currentTrackId = trackId
  state.selectedTrackId = trackId
  state.error = null

  audio.src = getAudioUrl(trackId)
  audio.currentTime = 0

  try {
    await audio.play()
  } catch (err) {
    state.isPlaying = false
    state.error = err instanceof Error ? err.message : String(err)
  }
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
  if (state.currentIndex <= 0) {
    audio.currentTime = 0
    state.currentTime = 0
    return
  }
  const prevTrack = state.queue[state.currentIndex - 1]
  state.currentIndex -= 1
  state.currentTrack = prevTrack
  state.currentTrackId = prevTrack.id
  state.selectedTrackId = prevTrack.id
  state.error = null
  audio.src = getAudioUrl(prevTrack.id)
  audio.currentTime = 0
  try {
    await audio.play()
  } catch (err) {
    state.isPlaying = false
    state.error = err instanceof Error ? err.message : String(err)
  }
}

async function playNext(): Promise<void> {
  if (state.currentIndex >= state.queue.length - 1) {
    audio.pause()
    state.isPlaying = false
    state.currentTime = 0
    return
  }
  const nextTrack = state.queue[state.currentIndex + 1]
  state.currentIndex += 1
  state.currentTrack = nextTrack
  state.currentTrackId = nextTrack.id
  state.selectedTrackId = nextTrack.id
  state.error = null
  audio.src = getAudioUrl(nextTrack.id)
  audio.currentTime = 0
  try {
    await audio.play()
  } catch (err) {
    state.isPlaying = false
    state.error = err instanceof Error ? err.message : String(err)
  }
}

function seekByRatio(ratio: number): void {
  if (!state.currentTrack || !Number.isFinite(ratio)) return

  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0

  if (!duration) return

  const clampedRatio = Math.min(1, Math.max(0, ratio))
  const nextTime = duration * clampedRatio
  audio.currentTime = nextTime
  state.currentTime = nextTime
}

function seekTo(time: number): void {
  if (!state.currentTrack || !Number.isFinite(time)) return

  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0

  if (!duration) return

  const nextTime = Math.min(duration, Math.max(0, time))
  audio.currentTime = nextTime
  state.currentTime = nextTime
}

function setVolume(volume: number): void {
  const clamped = clampVolume(volume)
  state.volume = clamped
  audio.volume = clamped
  localStorage.setItem(VOLUME_KEY, String(clamped))
}

export function usePlayback() {
  return {
    state,
    selectTrack,
    playTrackFromQueue,
    togglePlayPause,
    play,
    pause,
    playPrevious,
    playNext,
    seekByRatio,
    seekTo,
    setVolume,
  }
}
