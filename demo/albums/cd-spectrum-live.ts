import { createApp, defineComponent, h, onBeforeUnmount, ref } from 'vue'
import { usePlayback } from '../../src/renderer/features/playback/composables/usePlayback'
import { usePlaybackSpectrum } from '../../src/renderer/features/playback/composables/usePlaybackSpectrum'
import { SpectrumEnvelope } from '../../src/renderer/features/playback/utils/spectrumEnvelope'
import type { PlaybackTrack } from '../../src/renderer/features/playback/types'
import type { PlaybackSpectrumFrame } from '../../src/shared/types/playbackSpectrum'
import { createCdVibrationMotion } from '../../src/renderer/features/albums/utils/cdVibrationMotion'
import './cd-spectrum-live.css'
import {
  createReducedMotionQuery,
  setMotionPreference,
} from '../../src/renderer/shared/animation/motionPreference'

// These two IDs are resolved by the isolated host, never by renderer filesystem access.
const tracks: PlaybackTrack[] = [
  {
    id: 1,
    title: 'RUDE!',
    artist: 'Hearts2Hearts',
    album: 'RUDE! - Single',
    albumArtist: 'Hearts2Hearts',
    artworkCacheKey: null,
    durationSeconds: null,
  },
  {
    id: 2,
    title: 'LEMONADE',
    artist: 'aespa',
    album: 'LEMONADE',
    albumArtist: 'aespa',
    artworkCacheKey: null,
    durationSeconds: null,
  },
]

declare global {
  interface Window {
    spectrumProbe: {
      play: (trackId: number) => Promise<void>
      pause: () => void
      resume: () => Promise<void>
      seek: (time: number) => void
      enable: (active: boolean) => void
      enableVibration: (active: boolean) => void
      nativeForTest: (native: boolean) => void
      muteForTest: () => void
      motionForTest: (reduce: boolean) => void
      snapshot: () => {
        trackId: number | null
        time: number
        duration: number
        playing: boolean
        volume: number
        muted: boolean
        status: string
        frames: PlaybackSpectrumFrame[]
        vibration: { enabled: boolean; offset: number; paints: number; maxPaintMs: number }
      }
    }
  }
}

createApp(
  defineComponent({
    setup() {
      const playback = usePlayback()
      const enabled = ref(true),
        barsRef = ref<HTMLElement | null>(null)
      const vibrationEnabled = ref(true),
        squareRef = ref<HTMLElement | null>(null)
      let offset = 0,
        paints = 0,
        maxPaintMs = 0
      const vibration = createCdVibrationMotion((value) => {
        const started = performance.now()
        offset = value
        if (squareRef.value) squareRef.value.style.translate = `0 ${value}px`
        paints++
        maxPaintMs = Math.max(maxPaintMs, performance.now() - started)
      })
      const envelope = new SpectrumEnvelope()
      const motion = createReducedMotionQuery()
      const reducedMotion = ref(motion.matches)
      const onMotionChange = (): void => {
        reducedMotion.value = motion.matches
      }
      motion.addEventListener('change', onMotionChange)
      const frames: PlaybackSpectrumFrame[] = []
      let target: readonly number[] = Array(32).fill(0),
        animation = 0,
        last = 0,
        disposed = false
      function paint(now: number) {
        animation = 0
        if (disposed || !barsRef.value) return
        if (reducedMotion.value) envelope.reset()
        const values = reducedMotion.value
          ? envelope.values
          : envelope.update(target, last ? (now - last) / 1000 : 1 / 30)
        last = now
        Array.from(barsRef.value.children).forEach((bar, index) => {
          ;(bar as HTMLElement).style.transform = `scaleY(${Math.max(0.015, values[index])})`
        })
        if (values.some((value, index) => Math.abs(value - target[index]) > 0.002))
          animation = requestAnimationFrame(paint)
      }
      const { status } = usePlaybackSpectrum({
        enabled: () => enabled.value && !reducedMotion.value,
        onFrame(frame) {
          frames.push(frame)
          if (frames.length > 2000) frames.shift()
          target = frame.bands
          if (vibrationEnabled.value) vibration.receive(frame)
          else vibration.stop()
          if (!animation && !disposed) animation = requestAnimationFrame(paint)
        },
      })
      const labels = {
        ready: '跟随音乐',
        waiting: '等待音频',
        paused: '已暂停',
        unavailable: '暂不可用',
      }
      async function play(trackId: number) {
        await playback.playTrackFromQueue(
          tracks.filter((track) => track.id === trackId),
          trackId,
        )
      }
      window.spectrumProbe = {
        play,
        pause: () => playback.pause(),
        resume: () => playback.play(),
        seek: (time) => playback.seekTo(time),
        enable: (active) => {
          enabled.value = active
        },
        enableVibration: (active) => {
          vibrationEnabled.value = active
          if (!active) vibration.stop()
        },
        nativeForTest: (native) => playback.setGaplessPlaybackEnabled(native),
        muteForTest: () => playback.setVolume(0),
        motionForTest: (reduce) => setMotionPreference(reduce ? 'reduce' : 'system'),
        snapshot: () => ({
          trackId: playback.state.currentTrackId,
          time: playback.state.currentTime,
          duration: playback.state.duration,
          playing: playback.state.isPlaying,
          volume: playback.state.volume,
          muted: playback.state.isMuted,
          status: status.value,
          frames: [...frames],
          vibration: { enabled: vibrationEnabled.value, offset, paints, maxPaintMs },
        }),
      }
      onBeforeUnmount(() => {
        disposed = true
        vibration.stop()
        cancelAnimationFrame(animation)
        motion.removeEventListener('change', onMotionChange)
      })
      return () =>
        h('main', [
          h('h1', '低频振动试听'),
          h(
            'p',
            { class: 'intro' },
            '方块用上下位移展示共享的低频幅度响应，最多 6 px；正式碟片沿自身法线运动。',
          ),
          h(
            'div',
            { class: 'tracks' },
            tracks.map((track) =>
              h(
                'button',
                {
                  class: playback.state.currentTrackId === track.id ? 'selected' : '',
                  onClick: () => play(track.id),
                },
                `${track.artist} · ${track.title}`,
              ),
            ),
          ),
          h('div', { class: 'bass-square-area' }, [
            h('div', { class: 'bass-square', ref: squareRef, 'aria-hidden': 'true' }),
          ]),
          h(
            'div',
            { class: 'spectrum', ref: barsRef, 'aria-label': '音乐频谱' },
            Array.from({ length: 32 }, () => h('span')),
          ),
          h('div', { class: 'labels' }, [
            h('span', '40 Hz'),
            h('span', reducedMotion.value ? '动效已关闭' : labels[status.value]),
            h('span', '11 kHz'),
          ]),
          h('input', {
            type: 'range',
            min: 0,
            max: Math.max(1, playback.state.duration),
            step: 0.1,
            value: playback.state.currentTime,
            'aria-label': '播放进度',
            onInput: (event: Event) =>
              playback.seekTo(Number((event.target as HTMLInputElement).value)),
          }),
          h('div', { class: 'controls' }, [
            h(
              'button',
              {
                'aria-pressed': vibrationEnabled.value,
                onClick: () => window.spectrumProbe.enableVibration(!vibrationEnabled.value),
              },
              vibrationEnabled.value ? '关闭振动' : '开启振动',
            ),
            h(
              'button',
              {
                disabled: playback.state.currentTrackId === null,
                onClick: () => playback.togglePlayPause(),
              },
              playback.state.isPlaying ? '暂停' : '继续',
            ),
            h(
              'button',
              {
                'aria-pressed': enabled.value,
                onClick: () => {
                  enabled.value = !enabled.value
                },
              },
              enabled.value ? '关闭频谱' : '开启频谱',
            ),
            h(
              'span',
              `${Math.floor(playback.state.currentTime)} / ${Math.floor(playback.state.duration)} 秒`,
            ),
          ]),
          playback.state.error ? h('p', { role: 'alert' }, playback.state.error) : null,
        ])
    },
  }),
).mount('#app')
