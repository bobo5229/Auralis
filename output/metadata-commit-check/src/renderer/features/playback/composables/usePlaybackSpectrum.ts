import { onBeforeUnmount, onMounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import { usePlayback } from './usePlayback'
import { SPECTRUM_BANDS, type PlaybackSpectrumFrame } from '@shared/types/playbackSpectrum'

let revision = Date.now()

/** Shared playback clock + explicit subscription; UI never opens a music file. */
export function usePlaybackSpectrum(options: {
  enabled: MaybeRefOrGetter<boolean>
  onFrame: (frame: PlaybackSpectrumFrame) => void
}) {
  const playback = usePlayback()
  const subscriptionId = ++revision
  const status = ref<PlaybackSpectrumFrame['status']>('waiting')
  let timer: ReturnType<typeof setInterval> | null = null
  let unsubscribe: (() => void) | null = null
  let mounted = false
  let epoch = -1
  let sequence = -1
  let lastTime = playback.state.currentTime
  let lastClockAt = performance.now()
  let lastPublishedRevision = 0
  const zeros = Array<number>(SPECTRUM_BANDS).fill(0)
  const onVisibilityChange = (): void => publish()

  function clear(next: PlaybackSpectrumFrame['status']): void {
    status.value = next
    options.onFrame({
      subscriptionId,
      epoch,
      sequence,
      trackId: playback.state.currentTrackId,
      currentTime: playback.state.currentTime,
      status: next,
      bands: zeros,
      rms: 0,
      bass: 0,
    })
  }

  function enabled(): boolean {
    return toValue(options.enabled) && !document.hidden && playback.state.currentTrackId !== null
  }

  function publish(forceOff = false): void {
    if (!mounted) return
    const active = !forceOff && enabled()
    const currentTime = Number.isFinite(playback.state.currentTime)
      ? Math.max(0, playback.state.currentTime)
      : 0
    const requestRevision = ++revision
    lastPublishedRevision = requestRevision
    void auralis.playback
      .subscribeSpectrum({
        subscriptionId,
        revision: requestRevision,
        enabled: active,
        trackId: playback.state.currentTrackId,
        currentTime: Math.min(604800, currentTime),
        isPlaying: active && playback.state.isPlaying,
      })
      .catch(() => {
        if (mounted && lastPublishedRevision === requestRevision) clear('unavailable')
      })
    if (!active || !playback.state.isPlaying) clear('paused')
    if (active && playback.state.isPlaying && !timer) timer = setInterval(publish, 100)
    if ((!active || !playback.state.isPlaying) && timer) {
      clearInterval(timer)
      timer = null
    }
  }

  onMounted(() => {
    mounted = true
    unsubscribe = auralis.playback.onSpectrumFrame((frame) => {
      if (
        !mounted ||
        !enabled() ||
        frame.subscriptionId !== subscriptionId ||
        frame.trackId !== playback.state.currentTrackId
      )
        return
      if (frame.epoch < epoch || (frame.epoch === epoch && frame.sequence <= sequence)) return
      if (
        frame.status === 'ready' &&
        (!playback.state.isPlaying ||
          Math.abs(frame.currentTime - playback.state.currentTime) > 0.3)
      )
        return
      if (
        frame.bands.length !== SPECTRUM_BANDS ||
        !Number.isFinite(frame.bass) ||
        frame.bass < 0 ||
        frame.bass > 1 ||
        frame.bands.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
      )
        return
      epoch = frame.epoch
      sequence = frame.sequence
      status.value = frame.status
      options.onFrame(frame)
    })
    document.addEventListener('visibilitychange', onVisibilityChange)
    publish()
  })
  watch(
    [
      () => toValue(options.enabled),
      () => playback.state.currentTrackId,
      () => playback.state.isPlaying,
    ],
    () => {
      clear('waiting')
      publish()
    },
    { flush: 'sync' },
  )
  watch(
    () => playback.state.currentTime,
    (time) => {
      const now = performance.now()
      if (time < lastTime - 0.02 || Math.abs(time - lastTime - (now - lastClockAt) / 1000) > 0.3) {
        clear('waiting')
        publish()
      }
      lastTime = time
      lastClockAt = now
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(() => {
    publish(true)
    mounted = false
    if (timer) clearInterval(timer)
    timer = null
    unsubscribe?.()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })
  return { status }
}
