import { createApp, defineComponent, h, onBeforeUnmount, ref, watch } from 'vue'
import { usePlayback } from '../../src/renderer/features/playback/composables/usePlayback'
import { usePlaybackSpectrum } from '../../src/renderer/features/playback/composables/usePlaybackSpectrum'
import { BassEnvelope } from '../../src/shared/audio/bassEnvelope'
import type { PlaybackSpectrumFrame } from '../../src/shared/types/playbackSpectrum'
import type { PlaybackTrack } from '../../src/renderer/features/playback/types'
import {
  createReducedMotionQuery,
  setMotionPreference,
} from '../../src/renderer/shared/animation/motionPreference'
import './cd-normal-motion.css'

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
const variants = [
  { name: '柔和起伏', description: '低频推起盘面，平滑回到原位。' },
  { name: '弹性回落', description: '盘面带一点惯性，回落时轻微反弹。' },
]
// Fixed contour geometry is shared by every variant; the complete disc moves.
const contour =
  Array.from({ length: 361 }, (_, i) => {
    const angle = (i * Math.PI) / 180
    const radius = 116 + 2 * Math.sin(angle * 40)
    return `${i ? 'L' : 'M'}${120 + radius * Math.cos(angle)},${120 + radius * Math.sin(angle)}`
  }).join(' ') + 'Z'

createApp(
  defineComponent({
    setup() {
      const playback = usePlayback()
      const depth = ref(6),
        enabled = ref(true),
        reference = ref(true)
      const motion = createReducedMotionQuery(),
        reduced = ref(motion.matches)
      const discs: (HTMLElement | null)[] = [null, null]
      const envelope = new BassEnvelope()
      let amplitude = 0,
        frameAt = 0,
        last = 0,
        animation = 0
      let epoch = -1,
        trackId: number | null = null,
        observedTime: number | null = null,
        spring = 0,
        velocity = 0
      let offsets = [0, 0],
        frameCount = 0,
        lastBass = 0
      function paint(values: number[]) {
        offsets = values
        discs.forEach((disc, index) => {
          if (disc) disc.style.transform = `translateZ(${values[index]}px)`
        })
      }
      function reset() {
        cancelAnimationFrame(animation)
        animation = last = amplitude = spring = velocity = 0
        envelope.reset()
        paint([0, 0])
      }
      function tick(now: number) {
        animation = 0
        if (!enabled.value || reduced.value || document.hidden || now - frameAt > 300) {
          reset()
          return
        }
        const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60)
        last = now
        const value = envelope.update(amplitude, dt)
        // Bounded spring, integrated in small steps. This is visual response,
        // not a second audio analyzer or a kick/beat detector.
        const steps = Math.max(1, Math.ceil(dt * 120)),
          step = dt / steps
        for (let i = 0; i < steps; i++) {
          velocity += ((value - spring) * 625 - 30 * velocity) * step
          spring += velocity * step
        }
        paint([
          depth.value * value,
          // Rebound is limited to 12% of the available travel behind the rest plane.
          depth.value * Math.max(-0.12, Math.min(1, spring)),
        ])
        if (amplitude > 0 || value > 0 || Math.abs(spring) > 0.001)
          animation = requestAnimationFrame(tick)
        else paint([0, 0])
      }
      function receive(frame: PlaybackSpectrumFrame) {
        frameCount++
        lastBass = frame.bass
        if (frame.status !== 'ready') {
          reset()
          return
        }
        if (epoch !== frame.epoch || trackId !== frame.trackId) {
          reset()
          observedTime = null
        }
        if (trackId !== frame.trackId && frame.trackId !== null) envelope.useTrack(frame.trackId)
        epoch = frame.epoch
        trackId = frame.trackId
        amplitude = frame.bass > 0.00025 ? frame.bass : 0
        frameAt = performance.now()
        if (observedTime !== frame.currentTime) {
          envelope.observe(
            amplitude,
            observedTime === null ? 1 / 30 : Math.abs(frame.currentTime - observedTime),
          )
          observedTime = frame.currentTime
        }
        if (!animation && (amplitude > 0 || envelope.value > 0))
          animation = requestAnimationFrame(tick)
      }
      const { status } = usePlaybackSpectrum({
        enabled: () => enabled.value && !reduced.value,
        onFrame: receive,
      })
      const onMotionChange = () => {
        reduced.value = motion.matches
        reset()
      }
      motion.addEventListener('change', onMotionChange)
      watch(enabled, reset, { flush: 'sync' })
      async function play(id: number) {
        await playback.playTrackFromQueue(
          tracks.filter((track) => track.id === id),
          id,
        )
      }
      const probe = {
        play,
        pause: () => playback.pause(),
        resume: () => playback.play(),
        seek: (time: number) => playback.seekTo(time),
        enable: (value: boolean) => {
          enabled.value = value
        },
        setDepth: (value: number) => {
          depth.value = Math.max(1, Math.min(14, value))
        },
        motionForTest: (value: boolean) => setMotionPreference(value ? 'reduce' : 'system'),
        snapshot: () => ({
          playing: playback.state.isPlaying,
          volume: playback.state.volume,
          muted: playback.state.isMuted,
          time: playback.state.currentTime,
          status: status.value,
          frameCount,
          bass: lastBass,
          level: envelope.value,
          offsets: [...offsets],
          depth: depth.value,
        }),
      }
      Object.assign(window, { normalMotionProbe: probe })
      onBeforeUnmount(() => {
        reset()
        motion.removeEventListener('change', onMotionChange)
      })
      const labels = {
        ready: '跟随低频',
        waiting: '等待音频',
        paused: '已暂停',
        unavailable: '音频分析暂不可用',
      }
      function disc(index: number) {
        return h('div', { class: 'scene', 'aria-hidden': 'true' }, [
          h('div', { class: 'pose' }, [
            reference.value ? h('div', { class: 'rest-outline' }) : null,
            h(
              'div',
              {
                class: 'disc',
                ref: (el) => {
                  discs[index] = el as HTMLElement | null
                },
              },
              [
                h('svg', { class: 'rim', viewBox: '0 0 240 240' }, [h('path', { d: contour })]),
                h('div', { class: 'face' }),
                h('svg', { class: 'disc-title', viewBox: '0 0 240 240' }, [
                  h('defs', [
                    h('path', { id: `title-${index}`, d: 'M 33 120 A 87 87 0 0 1 207 120' }),
                  ]),
                  h('text', [
                    h(
                      'textPath',
                      { href: `#title-${index}`, startOffset: '50%', 'text-anchor': 'middle' },
                      'AURALIS · LOW FREQUENCY',
                    ),
                  ]),
                ]),
                h('div', { class: 'hub' }, [h('div', { class: 'hole' })]),
              ],
            ),
          ]),
        ])
      }
      return () =>
        h('main', [
          h('header', [
            h('h1', '碟片法线振动'),
            h('p', '同一段音乐，两种回落手感。弱低频轻抬，强低频明显抬起。'),
          ]),
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
          h(
            'div',
            { class: 'comparison' },
            variants.map((variant, index) =>
              h('section', [disc(index), h('h2', variant.name), h('p', variant.description)]),
            ),
          ),
          h('div', { class: 'settings' }, [
            h('label', { class: 'strength' }, [
              '法线位移上限',
              h('input', {
                type: 'range',
                min: 1,
                max: 14,
                step: 1,
                value: depth.value,
                onInput: (event: Event) =>
                  probe.setDepth(Number((event.target as HTMLInputElement).value)),
              }),
              h('output', `${depth.value} px`),
            ]),
            h('label', [
              h('input', {
                type: 'checkbox',
                checked: reference.value,
                onChange: (event: Event) => {
                  reference.value = (event.target as HTMLInputElement).checked
                },
              }),
              '显示静止轮廓',
            ]),
          ]),
          h(
            'p',
            { class: 'note' },
            '虚线是原位。低频增强时向你抬起，减弱时回落；持续低频保持相应位置。滑块控制最大位移，每次实际幅度随音乐强弱变化。',
          ),
          h('label', { class: 'progress' }, [
            '播放进度',
            h('input', {
              type: 'range',
              min: 0,
              max: Math.max(1, playback.state.duration),
              step: 0.1,
              value: playback.state.currentTime,
              onInput: (event: Event) =>
                playback.seekTo(Number((event.target as HTMLInputElement).value)),
            }),
          ]),
          h('div', { class: 'controls' }, [
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
              { 'aria-pressed': enabled.value, onClick: () => probe.enable(!enabled.value) },
              enabled.value ? '关闭振动' : '开启振动',
            ),
            h('span', { role: 'status' }, reduced.value ? '动效已关闭' : labels[status.value]),
            h(
              'span',
              { class: 'time' },
              `${Math.floor(playback.state.currentTime)} / ${Math.floor(playback.state.duration)} 秒`,
            ),
          ]),
          playback.state.error ? h('p', { role: 'alert' }, playback.state.error) : null,
        ])
    },
  }),
).mount('#app')
