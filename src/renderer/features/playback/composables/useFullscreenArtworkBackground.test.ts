import { createRenderer, nextTick, reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFullscreenArtworkBackground } from './useFullscreenArtworkBackground'
import type { FullscreenBackgroundMode } from './useFullscreenBackground'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))
const host = createRenderer<object, object>({
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
const cleanups: Array<() => void> = []
let media: EventTarget & { matches: boolean }
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }))
  media = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('matchMedia', () => media)
})
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function mount(mode: FullscreenBackgroundMode = 'metal') {
  const state = reactive({
    mode,
    active: true,
    target: {} as HTMLElement,
    artworkUrl: 'cover:a',
    artworkKey: 'a',
    palette: { key: 'a' },
  })
  const style = { setProperty: vi.fn() },
    dataset: Record<string, string> = {}
  const metal = reactive({ ready: true, uploadFlowFrame: vi.fn(() => true), transitionTo: vi.fn() })
  const fluid = { requestFrame: vi.fn() }
  const fallback = vi.fn((next: FullscreenBackgroundMode) => {
    state.mode = next
  })
  let background!: ReturnType<typeof useFullscreenArtworkBackground>
  const app = host.createApp({
    setup() {
      background = useFullscreenArtworkBackground(
        state,
        ref({ style, dataset } as unknown as HTMLElement),
        ref(metal),
        ref(fluid),
        fallback,
      )
      return () => null
    },
  })
  app.mount({})
  cleanups.push(() => app.unmount())
  const capture = (url = state.artworkUrl) =>
    background.onFlowFrame({ canvas: {} as HTMLCanvasElement, artworkUrl: url, settled: true })
  return { state, metal, fluid, fallback, background, dataset, capture }
}
async function flush() {
  await nextTick()
  await nextTick()
}

describe('fullscreen background coordination', () => {
  it('opens directly in the selected material and activates only that background', () => {
    const { background } = mount()
    expect(background.presentationMode.value).toBe('metal')
    expect(background.transitioning.value).toBe(false)
    expect(background.metalActive.value).toBe(true)
    expect(background.fluidActive.value).toBe(false)
    expect(background.captureFrames.value).toBe(false)
  })
  it('keeps native flow while preparing and waits for matching palette and a GPU source frame', async () => {
    const { state, metal, background, capture } = mount('fluid')
    metal.ready = false
    state.palette.key = 'old'
    state.mode = 'metal'
    await flush()
    background.onFluidReady('cover:a')
    capture('cover:old')
    await flush()
    expect(background.presentationMode.value).toBe('fluid')
    expect(metal.transitionTo).not.toHaveBeenCalled()
    metal.ready = true
    await flush()
    capture()
    await flush()
    expect(background.transitioning.value).toBe(false)
    state.palette.key = 'a'
    await flush()
    expect(metal.transitionTo.mock.calls).toEqual([
      [0, false],
      [1, true],
    ])
    expect(background.presentationMode.value).toBe('metal')
    background.onMorphComplete(1)
    await flush()
    expect(background.fluidActive.value).toBe(false)
    expect(background.captureFrames.value).toBe(false)
  })
  it('reverses an active morph without first submitting an endpoint', async () => {
    const { state, metal, background, capture, dataset } = mount()
    background.onFluidReady('cover:a')
    state.mode = 'fluid'
    await flush()
    capture()
    await flush()
    background.onMorphFrame(0.6)
    expect(dataset.backgroundPhase).toBe('0.6')
    metal.transitionTo.mockClear()
    state.mode = 'metal'
    await flush()
    expect(metal.transitionTo.mock.calls).toEqual([[1, true]])
    expect(dataset.backgroundPhase).toBe('0.6')
    background.onMorphComplete(0)
    expect(background.transitioning.value).toBe(true)
    background.onMorphComplete(1)
    expect(background.transitioning.value).toBe(false)
  })
  it('cancels a pending selection and rejects artwork frames from an older track', async () => {
    const { state, metal, background, capture } = mount()
    state.mode = 'fluid'
    await flush()
    state.artworkUrl = 'cover:b'
    state.artworkKey = 'b'
    state.palette.key = 'b'
    capture('cover:a')
    expect(metal.uploadFlowFrame).not.toHaveBeenCalled()
    state.mode = 'metal'
    await flush()
    capture('cover:b')
    await flush()
    expect(background.preparing.value).toBe(false)
    expect(background.transitioning.value).toBe(false)
    expect(metal.transitionTo).not.toHaveBeenCalled()
  })
  it.each(['exit', 'hidden'] as const)(
    'settles the latest target on %s and does not replay on return',
    async (reason) => {
      const { state, metal, background, capture } = mount()
      state.mode = 'fluid'
      await flush()
      capture()
      await flush()
      expect(background.transitioning.value).toBe(true)
      if (reason === 'exit') state.active = false
      else {
        Object.assign(document, { hidden: true })
        document.dispatchEvent(new Event('visibilitychange'))
      }
      expect(background.captureFrames.value).toBe(false)
      expect(background.metalActive.value).toBe(false)
      expect(background.fluidActive.value).toBe(false)
      expect(background.presentationMode.value).toBe('fluid')
      metal.transitionTo.mockClear()
      if (reason === 'exit') state.active = true
      else {
        Object.assign(document, { hidden: false })
        document.dispatchEvent(new Event('visibilitychange'))
      }
      await flush()
      expect(metal.transitionTo).toHaveBeenCalledWith(0, false)
      expect(background.transitioning.value).toBe(false)
    },
  )
  it('settles immediately when reduced motion is enabled during a morph', async () => {
    const { state, metal, background, capture } = mount()
    state.mode = 'fluid'
    await flush()
    capture()
    await flush()
    media.matches = true
    media.dispatchEvent(Object.assign(new Event('change'), { matches: true }))
    expect(metal.transitionTo).toHaveBeenLastCalledWith(0, false)
    expect(background.transitioning.value).toBe(false)
    expect(background.presentationMode.value).toBe('fluid')
  })
  it('uses native endpoints if frame capture becomes unavailable', async () => {
    const { state, metal, background } = mount()
    background.onCaptureUnavailable()
    state.mode = 'fluid'
    await flush()
    background.onFluidReady('cover:a')
    await flush()
    expect(background.presentationMode.value).toBe('fluid')
    expect(background.captureFrames.value).toBe(false)
    expect(metal.transitionTo.mock.calls.every(([, animated]) => !animated)).toBe(true)
  })
  it('bounds bridge preparation and preserves healthy native backgrounds', async () => {
    const { state, background, fallback } = mount()
    background.onFluidReady('cover:a')
    state.mode = 'fluid'
    await flush()
    await vi.advanceTimersByTimeAsync(10_000)
    await flush()
    expect(background.preparing.value).toBe(false)
    expect(background.presentationMode.value).toBe('fluid')
    expect(fallback).not.toHaveBeenCalled()
  })
  it('disables failed renderers and avoids a fallback loop when both are unavailable', async () => {
    const { state, background, fallback } = mount()
    background.onMetalUnavailable()
    await flush()
    expect(state.mode).toBe('fluid')
    expect(background.metalEnabled.value).toBe(false)
    background.onFluidUnavailable()
    await flush()
    expect(background.fluidEnabled.value).toBe(false)
    expect(fallback).toHaveBeenCalledOnce()
    expect(background.metalVisible.value).toBe(false)
    expect(background.fluidVisible.value).toBe(false)
  })
  it('settles a reversed morph if its flow source fails while metal is selected', async () => {
    const { state, metal, background, capture, dataset, fallback } = mount()
    state.mode = 'fluid'
    await flush()
    capture()
    await flush()
    background.onMorphFrame(0.4)
    state.mode = 'metal'
    await flush()
    background.onFluidUnavailable()
    expect(background.transitioning.value).toBe(false)
    expect(metal.transitionTo).toHaveBeenLastCalledWith(1, false)
    expect(dataset.backgroundPhase).toBe('1')
    expect(fallback).not.toHaveBeenCalled()
  })
})
