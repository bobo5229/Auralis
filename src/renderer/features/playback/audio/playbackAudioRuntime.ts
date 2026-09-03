import { GaplessAudioEngine } from './gaplessAudioEngine'

export interface PlaybackAudioSnapshot {
  kind: 'html-audio' | 'gapless' | 'idle'
  trackId: number | null
  currentTime: number
  duration: number
  isPlaying: boolean
  hasCurrentData: boolean
}

export interface PlaybackAudioCallbacks {
  onTimeUpdate: (snapshot: { currentTime: number; duration: number }) => void
  onDurationChange: (duration: number) => void
  onPlayingChange: (isPlaying: boolean) => void
  onEnded: (nextTrackId: number | null) => void
  onError: (error: {
    detail: string
    errorCode: number | null
    networkState?: number
    readyState?: number
    error?: Error | MediaError | null
  }) => void
  onSeeking?: () => void
  onSeeked?: () => void
  onBufferingChange?: (buffering: boolean) => void
}

export interface PlaybackAudioRuntimeOptions {
  audio?: HTMLAudioElement
  gaplessEngine?: GaplessAudioEngine
}

export interface PlaybackAudioRuntime {
  start(trackId: number, url: string, options: { preferGapless: boolean }): Promise<void>
  resume(): Promise<void>
  pause(): void
  seek(time: number): Promise<void>
  setVolume(volume: number, muted: boolean): void
  scheduleNext(
    trackId: number,
    url: string,
    options: { trimBoundarySilence: boolean },
  ): Promise<boolean>
  cancelScheduledNext(): void
  clear(): void
  getSnapshot(): PlaybackAudioSnapshot
  dispose(): void
}

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

export function createPlaybackAudioRuntime(
  callbacks: PlaybackAudioCallbacks,
  options?: PlaybackAudioRuntimeOptions,
): PlaybackAudioRuntime {
  const audio = options?.audio ?? new Audio()
  let activeBackend: 'html-audio' | 'gapless' | 'idle' = 'idle'
  let currentTrackId: number | null = null
  let isDisposed = false

  const gaplessEngine =
    options?.gaplessEngine ??
    new GaplessAudioEngine({
      onCurrentEnded: (nextTrackId) => {
        if (activeBackend === 'gapless') {
          if (nextTrackId !== null) {
            currentTrackId = nextTrackId
          } else {
            currentTrackId = null
            activeBackend = 'idle'
          }
          callbacks.onEnded(nextTrackId)
        }
      },
      onPlaybackStateChange: (isPlaying) => {
        if (activeBackend === 'gapless') {
          callbacks.onPlayingChange(isPlaying)
        }
      },
      onTimeUpdate: ({ currentTime, duration }) => {
        if (activeBackend === 'gapless') {
          callbacks.onTimeUpdate({ currentTime, duration })
        }
      },
    })

  // --- HTMLAudio Event Listeners ---

  const onLoadedMetadata = () => {
    if (activeBackend !== 'html-audio') return
    callbacks.onDurationChange(audio.duration)
  }

  const onDurationChange = () => {
    if (activeBackend !== 'html-audio') return
    callbacks.onDurationChange(audio.duration)
  }

  const onTimeUpdate = () => {
    if (activeBackend !== 'html-audio') return
    callbacks.onTimeUpdate({ currentTime: audio.currentTime, duration: audio.duration })
  }

  const onPlay = () => {
    if (activeBackend !== 'html-audio') return
    callbacks.onPlayingChange(true)
  }

  const onPause = () => {
    if (activeBackend !== 'html-audio') return
    callbacks.onPlayingChange(false)
  }

  const onSeeking = () => {
    if (activeBackend !== 'html-audio') return
    callbacks.onSeeking?.()
  }

  const onSeeked = () => {
    if (activeBackend !== 'html-audio') return
    callbacks.onSeeked?.()
  }

  const onWaiting = () => {
    if (activeBackend !== 'html-audio') return
    callbacks.onBufferingChange?.(true)
  }

  const onStalled = () => {
    if (activeBackend !== 'html-audio') return
    callbacks.onBufferingChange?.(true)
  }

  const onPlaying = () => {
    if (activeBackend !== 'html-audio') return
    callbacks.onBufferingChange?.(false)
  }

  const onCanPlay = () => {
    if (activeBackend !== 'html-audio') return
    callbacks.onBufferingChange?.(false)
  }

  const onEnded = () => {
    if (activeBackend !== 'html-audio') return
    callbacks.onEnded(null)
  }

  const onError = () => {
    if (activeBackend !== 'html-audio') return
    const mediaError = audio.error
    const detail = mediaError
      ? `${describeMediaError(mediaError.code)} (${mediaError.code})`
      : 'unknown media error'
    callbacks.onError({
      detail,
      errorCode: mediaError?.code ?? null,
      networkState: audio.networkState,
      readyState: audio.readyState,
      error: mediaError,
    })
  }

  audio.addEventListener('loadedmetadata', onLoadedMetadata)
  audio.addEventListener('durationchange', onDurationChange)
  audio.addEventListener('timeupdate', onTimeUpdate)
  audio.addEventListener('play', onPlay)
  audio.addEventListener('pause', onPause)
  audio.addEventListener('seeking', onSeeking)
  audio.addEventListener('seeked', onSeeked)
  audio.addEventListener('waiting', onWaiting)
  audio.addEventListener('stalled', onStalled)
  audio.addEventListener('playing', onPlaying)
  audio.addEventListener('canplay', onCanPlay)
  audio.addEventListener('ended', onEnded)
  audio.addEventListener('error', onError)

  let activeSessionId = 0

  function clearHtmlAudio(): void {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }

  function clear(): void {
    activeSessionId += 1
    currentTrackId = null
    activeBackend = 'idle'
    gaplessEngine.cancel()
    clearHtmlAudio()
  }

  async function start(
    trackId: number,
    url: string,
    startOptions: { preferGapless: boolean },
  ): Promise<void> {
    clear()
    const startSessionId = ++activeSessionId
    currentTrackId = trackId

    if (startOptions.preferGapless) {
      const started = await gaplessEngine.start(trackId, url)
      // If a newer start() or clear() occurred while gapless was starting, abort immediately.
      if (startSessionId !== activeSessionId) {
        return
      }

      if (started) {
        activeBackend = 'gapless'
        const snapshot = gaplessEngine.getSnapshot()
        callbacks.onDurationChange(snapshot.duration)
        callbacks.onTimeUpdate({
          currentTime: snapshot.currentTime,
          duration: snapshot.duration,
        })
        callbacks.onPlayingChange(snapshot.isPlaying)
        return
      }
    }

    // Guard against race conditions before HTMLAudio fallback.
    if (startSessionId !== activeSessionId) {
      return
    }

    activeBackend = 'html-audio'
    audio.src = url
    audio.currentTime = 0
    try {
      await audio.play()
    } catch (error) {
      if (startSessionId !== activeSessionId) return
      throw error
    }
  }

  async function resume(): Promise<void> {
    if (activeBackend === 'gapless') {
      await gaplessEngine.play()
      return
    }
    if (activeBackend === 'html-audio') {
      await audio.play()
      return
    }
  }

  function pause(): void {
    if (activeBackend === 'gapless') {
      gaplessEngine.pause()
      return
    }
    if (activeBackend === 'html-audio') {
      audio.pause()
      return
    }
  }

  async function seek(time: number): Promise<void> {
    if (activeBackend === 'gapless') {
      await gaplessEngine.seek(time)
      return
    }
    if (activeBackend === 'html-audio') {
      audio.currentTime = time
      return
    }
  }

  function setVolume(volume: number, muted: boolean): void {
    audio.volume = volume
    audio.muted = muted
    gaplessEngine.setVolume(volume, muted)
  }

  async function scheduleNext(
    trackId: number,
    url: string,
    scheduleOptions: { trimBoundarySilence: boolean },
  ): Promise<boolean> {
    return gaplessEngine.scheduleNext(trackId, url, scheduleOptions)
  }

  function cancelScheduledNext(): void {
    gaplessEngine.cancelScheduledNext()
  }

  function getSnapshot(): PlaybackAudioSnapshot {
    if (activeBackend === 'gapless') {
      const gSnapshot = gaplessEngine.getSnapshot()
      return {
        kind: 'gapless',
        trackId: currentTrackId,
        currentTime: gSnapshot.currentTime,
        duration: gSnapshot.duration,
        isPlaying: gSnapshot.isPlaying,
        hasCurrentData: true,
      }
    }

    if (activeBackend === 'html-audio') {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
      const isPlaying = !audio.paused && !audio.ended
      const hasCurrentData = audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      return {
        kind: 'html-audio',
        trackId: currentTrackId,
        currentTime: audio.currentTime,
        duration: dur,
        isPlaying,
        hasCurrentData,
      }
    }

    return {
      kind: 'idle',
      trackId: null,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      hasCurrentData: false,
    }
  }

  function dispose(): void {
    if (isDisposed) return
    isDisposed = true
    clear()
    gaplessEngine.destroy()

    audio.removeEventListener('loadedmetadata', onLoadedMetadata)
    audio.removeEventListener('durationchange', onDurationChange)
    audio.removeEventListener('timeupdate', onTimeUpdate)
    audio.removeEventListener('play', onPlay)
    audio.removeEventListener('pause', onPause)
    audio.removeEventListener('seeking', onSeeking)
    audio.removeEventListener('seeked', onSeeked)
    audio.removeEventListener('waiting', onWaiting)
    audio.removeEventListener('stalled', onStalled)
    audio.removeEventListener('playing', onPlaying)
    audio.removeEventListener('canplay', onCanPlay)
    audio.removeEventListener('ended', onEnded)
    audio.removeEventListener('error', onError)
  }

  return {
    start,
    resume,
    pause,
    seek,
    setVolume,
    scheduleNext,
    cancelScheduledNext,
    clear,
    getSnapshot,
    dispose,
  }
}
