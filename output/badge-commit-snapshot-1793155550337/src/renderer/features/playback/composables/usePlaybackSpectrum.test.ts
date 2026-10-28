import { createRenderer, defineComponent, nextTick, reactive, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlaybackSpectrumFrame, SpectrumSubscription } from '@shared/types/playbackSpectrum'
import { usePlaybackSpectrum } from './usePlaybackSpectrum'

const api = vi.hoisted(() => ({
  subscribeSpectrum: vi.fn<(request: SpectrumSubscription) => Promise<{ accepted: boolean }>>(
    async () => ({ accepted: true }),
  ),
  onSpectrumFrame: vi.fn<(callback: (frame: PlaybackSpectrumFrame) => void) => () => void>(),
  off: vi.fn(),
}))
vi.mock('@renderer/shared/ipc/client', () => ({ auralis: { playback: api } }))
const state = reactive({ currentTrackId: 1 as number | null, currentTime: 1, isPlaying: true })
vi.mock('./usePlayback', () => ({ usePlayback: () => ({ state }) }))
const renderer = createRenderer<object, object>({
  patchProp() {},
  insert() {},
  remove() {},
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText() {},
  setElementText() {},
  parentNode: () => null,
  nextSibling: () => null,
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('spectrum subscription lifetime', () => {
  it('ignores stale frames and unsubscribes on pause, hiding, leaving focus and unmount', async () => {
    vi.useFakeTimers()
    const document = Object.assign(new EventTarget(), { hidden: false })
    vi.stubGlobal('document', document)
    Object.assign(state, { currentTrackId: 1, currentTime: 1, isPlaying: true })
    const active = ref(true),
      frames: PlaybackSpectrumFrame[] = []
    let receive!: (frame: PlaybackSpectrumFrame) => void
    api.onSpectrumFrame.mockImplementation((callback) => {
      receive = callback
      return api.off
    })
    const app = renderer.createApp(
      defineComponent({
        setup() {
          usePlaybackSpectrum({ enabled: active, onFrame: (frame) => frames.push(frame) })
          return () => null
        },
      }),
    )
    app.mount({})
    const subscriptionId = api.subscribeSpectrum.mock.calls.at(-1)![0].subscriptionId
    const frame: PlaybackSpectrumFrame = {
      subscriptionId,
      epoch: 2,
      sequence: 1,
      trackId: 1,
      currentTime: 1,
      status: 'ready',
      bands: Array(32).fill(0.7),
      rms: 0.2,
      bass: 0.1,
    }
    receive(frame)
    expect(frames.at(-1)?.status).toBe('ready')
    const count = frames.length
    for (const patch of [
      { epoch: 1 },
      { sequence: 0 },
      { trackId: 2 },
      { currentTime: 10 },
      { subscriptionId: 0 },
      { bands: [NaN] },
      { bass: NaN },
      { bass: -1 },
      { bass: 2 },
    ])
      receive({ ...frame, ...patch })
    expect(frames).toHaveLength(count)
    state.isPlaying = false
    expect(api.subscribeSpectrum.mock.calls.at(-1)![0].isPlaying).toBe(false)
    receive({ ...frame, sequence: 2 })
    expect(frames.at(-1)?.status).toBe('paused')
    state.isPlaying = true
    document.hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(api.subscribeSpectrum.mock.calls.at(-1)![0].enabled).toBe(false)
    const calls = api.subscribeSpectrum.mock.calls.length
    await vi.advanceTimersByTimeAsync(500)
    expect(api.subscribeSpectrum.mock.calls).toHaveLength(calls)
    document.hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    expect(api.subscribeSpectrum.mock.calls.at(-1)![0].enabled).toBe(true)
    active.value = false
    expect(api.subscribeSpectrum.mock.calls.at(-1)![0].enabled).toBe(false)
    app.unmount()
    await nextTick()
    expect(api.off).toHaveBeenCalledOnce()
    expect(api.subscribeSpectrum.mock.calls.at(-1)![0].enabled).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
