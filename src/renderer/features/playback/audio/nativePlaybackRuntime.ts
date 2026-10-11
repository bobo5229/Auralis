import type { AuralisApi } from '@shared/ipc/api'
import type { NativePlaybackCommand, NativePlaybackEvent } from '@shared/ipc/contracts'
import {
  createPlaybackAudioRuntime,
  type PlaybackAudioCallbacks,
  type PlaybackAudioRuntime,
  type PlaybackAudioSnapshot,
} from './playbackAudioRuntime'

let nextSession = Date.now()

export function createNativePlaybackRuntime(
  callbacks: PlaybackAudioCallbacks,
  api: AuralisApi['playback'],
  warn: (error: unknown) => void,
  createFallback = createPlaybackAudioRuntime,
): PlaybackAudioRuntime {
  const fallback = createFallback(callbacks)
  let native = false
  let starting = false
  let retainedSession: number | null = null
  let disposed = false
  let session = ++nextSession
  let volume = 0.8
  let muted = false
  let snapshot: PlaybackAudioSnapshot = idle()
  function idle(): PlaybackAudioSnapshot {
    return {
      kind: 'idle',
      trackId: null,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      hasCurrentData: false,
    }
  }
  function failure(error: unknown): void {
    if (!native || disposed) return
    callbacks.onError({ detail: String(error), errorCode: null })
  }
  function fire(command: NativePlaybackCommand): void {
    void api.nativeCommand(command).catch((error: unknown) => {
      if (command.session === session) failure(error)
    })
  }
  function receive(event: NativePlaybackEvent): void {
    if (!native || disposed || event.session !== session) return
    if (event.kind === 'error') {
      failure(event.detail)
      return
    }
    snapshot = {
      kind: event.kind === 'ended' ? 'idle' : 'mpv',
      trackId: event.kind === 'ended' ? null : event.trackId,
      currentTime: event.currentTime,
      duration: event.duration,
      isPlaying: event.isPlaying,
      hasCurrentData: event.kind !== 'ended' && !event.buffering,
    }
    if (event.kind === 'boundary') callbacks.onEnded(event.trackId)
    // Boundary adoption may clear playback (for example a just-missing track).
    // Do not publish the rest of that old event into the replacement lifetime.
    if (!native || disposed || event.session !== session) return
    callbacks.onDurationChange(event.duration)
    callbacks.onTimeUpdate(event)
    callbacks.onPlayingChange(event.isPlaying)
    callbacks.onBufferingChange?.(event.buffering)
    if (event.kind === 'ended') callbacks.onEnded(null)
  }
  const unsubscribe = api.onNativeEvent(receive)
  function clear(options?: { replacing?: boolean }): void {
    const replacing = options?.replacing === true
    const cancelPendingNative = native && starting
    if (replacing && native && !cancelPendingNative) {
      retainedSession = session
      // Silence the old song while its replacement URL is resolved, keeping the
      // decoder and output alive. Main owns the eventual file-unload barrier.
      void api.nativeCommand({ action: 'pause', session }).catch(warn)
      void api.nativeCommand({ action: 'cancel-next', session }).catch(warn)
    }
    session = ++nextSession
    native = false
    starting = false
    snapshot = idle()
    fallback.clear()
    if (!replacing || cancelPendingNative) {
      retainedSession = null
      void api.nativeCommand({ action: 'stop', session }).catch(warn)
    }
  }
  return {
    async start(trackId, url, options) {
      clear({ replacing: true })
      const requestSession = session
      let availability: { available: boolean }
      try {
        availability = options.preferGapless ? await api.nativeAvailability() : { available: false }
      } catch (error) {
        if (session !== requestSession || disposed) return
        clear()
        throw error
      }
      if (session !== requestSession || disposed) return
      if (!availability.available) {
        clear()
        if (options.preferGapless) warn(new Error('mpv unavailable; using Web Audio'))
        return fallback.start(trackId, url, options)
      }
      native = true
      starting = true
      retainedSession = null
      session = ++nextSession
      const startSession = session
      try {
        const result = await api.nativeCommand({ action: 'start', session, trackId, volume, muted })
        if (session !== startSession || disposed) return
        if (!result.accepted) throw new Error('Native playback start was rejected')
        starting = false
        await api.nativeCommand({ action: 'volume', session, volume, muted })
      } catch (error) {
        if (session !== startSession || disposed) return
        clear()
        throw error
      }
    },
    async resume() {
      if (!native) return fallback.resume()
      await api.nativeCommand({ action: 'resume', session })
    },
    pause() {
      if (!native) {
        if (retainedSession !== null) clear()
        fallback.pause()
        session = ++nextSession
        return
      }
      if (snapshot.kind === 'idle') {
        clear()
        return
      }
      fire({ action: 'pause', session })
    },
    async seek(time) {
      if (!native) return fallback.seek(time)
      callbacks.onSeeking?.()
      try {
        await api.nativeCommand({ action: 'seek', session, time })
      } finally {
        callbacks.onSeeked?.()
      }
    },
    setVolume(value, isMuted) {
      volume = value
      muted = isMuted
      fallback.setVolume(value, isMuted)
      if (native) fire({ action: 'volume', session, volume, muted })
    },
    async scheduleNext(trackId, url, options) {
      if (!native)
        return fallback.scheduleNext(trackId, url, { ...options, trimBoundarySilence: false })
      const requestSession = session
      const result = await api.nativeCommand({
        action: 'next',
        session,
        trackId,
        trimDigitalSilence: options.trimBoundarySilence,
        softTransition: options.softTransition === true,
      })
      return session === requestSession && result.accepted
    },
    cancelScheduledNext() {
      fallback.cancelScheduledNext()
      if (native) fire({ action: 'cancel-next', session })
    },
    clear,
    getSnapshot: () => (native ? snapshot : fallback.getSnapshot()),
    dispose() {
      if (disposed) return
      disposed = true
      clear()
      unsubscribe()
      fallback.dispose()
    },
  }
}
