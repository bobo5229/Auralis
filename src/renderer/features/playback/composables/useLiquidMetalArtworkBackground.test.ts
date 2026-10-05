import { createRenderer, nextTick, reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LIQUID_METAL_SETTINGS } from '../runtime/liquidMetalSettings'
import { FALLBACK_PALETTE } from '../utils/artworkPaletteDefaults'
import { createLiquidMetalRenderer } from '../runtime/liquidMetalRenderer'
import { useLiquidMetalArtworkBackground } from './useLiquidMetalArtworkBackground'

vi.mock('../runtime/liquidMetalRenderer', () => ({ createLiquidMetalRenderer: vi.fn() }))
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
const runtime = {
  setState: vi.fn(),
  setPalette: vi.fn(),
  setMaterial: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
}
let idle: IdleRequestCallback | null = null
const cancelIdle = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  idle = null
  vi.mocked(createLiquidMetalRenderer).mockReturnValue(runtime)
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    idle = callback
    return 1
  })
  vi.stubGlobal('cancelIdleCallback', cancelIdle)
  vi.stubGlobal('window', {})
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
})

function mount(enabled = true, active = false) {
  const state = reactive({
    enabled,
    active,
    playing: true,
    motionPaused: false,
    palette: FALLBACK_PALETTE,
    settings: DEFAULT_LIQUID_METAL_SETTINGS,
  })
  const unavailable = vi.fn()
  let background!: ReturnType<typeof useLiquidMetalArtworkBackground>
  const app = host.createApp({
    setup() {
      background = useLiquidMetalArtworkBackground(ref({} as HTMLCanvasElement), state, unavailable)
      return () => null
    },
  })
  app.mount({})
  let unmounted = false
  const unmount = () => {
    if (unmounted) return
    unmounted = true
    app.unmount()
  }
  cleanups.push(unmount)
  return { state, unavailable, background, unmount }
}

function prepare() {
  idle?.({ didTimeout: false, timeRemaining: () => 10 })
}

function nativeVisibility() {
  let event!: (state: { isVisible: boolean }) => void
  let resolve!: (state: { isVisible: boolean }) => void
  const unsubscribe = vi.fn()
  vi.stubGlobal('window', {
    auralis: {
      window: {
        getVisibility: () => new Promise<{ isVisible: boolean }>((yes) => (resolve = yes)),
        onVisibilityChanged: (callback: typeof event) => {
          event = callback
          return unsubscribe
        },
      },
    },
  })
  return {
    event: (isVisible: boolean) => event({ isVisible }),
    resolve: (isVisible: boolean) => resolve({ isVisible }),
    unsubscribe,
  }
}

describe('persistent liquid-metal background', () => {
  it('suspends on native minimize, honors control updates while hidden and resumes the same context', async () => {
    const visibility = nativeVisibility()
    const { state, unmount } = mount(true, true)
    expect(vi.mocked(createLiquidMetalRenderer).mock.calls[0][1].active).toBe(false)
    visibility.resolve(true)
    await Promise.resolve()
    expect(runtime.setState).toHaveBeenLastCalledWith({
      active: true,
      playing: true,
      reducedMotion: false,
    })
    visibility.event(false)
    expect(runtime.setState).toHaveBeenLastCalledWith({
      active: false,
      playing: true,
      reducedMotion: false,
    })
    state.playing = false
    state.motionPaused = true
    await nextTick()
    expect(runtime.setState).toHaveBeenLastCalledWith({
      active: false,
      playing: false,
      reducedMotion: true,
    })
    visibility.event(true)
    expect(runtime.setState).toHaveBeenLastCalledWith({
      active: true,
      playing: false,
      reducedMotion: true,
    })
    state.active = false
    await nextTick()
    visibility.event(false)
    visibility.event(true)
    expect(runtime.setState).toHaveBeenLastCalledWith({
      active: false,
      playing: false,
      reducedMotion: true,
    })
    expect(createLiquidMetalRenderer).toHaveBeenCalledOnce()
    expect(runtime.dispose).not.toHaveBeenCalled()
    unmount()
    expect(visibility.unsubscribe).toHaveBeenCalledOnce()
    const calls = runtime.setState.mock.calls.length
    visibility.event(true)
    expect(runtime.setState).toHaveBeenCalledTimes(calls)
  })

  it('keeps hidden initialization inactive and ignores a stale snapshot after restore', async () => {
    const visibility = nativeVisibility()
    const { state } = mount()
    prepare()
    expect(vi.mocked(createLiquidMetalRenderer).mock.calls[0][1].active).toBe(false)
    // The fullscreen state can change while the native window stays minimized.
    state.active = true
    await nextTick()
    expect(runtime.setState).toHaveBeenLastCalledWith({
      active: false,
      playing: true,
      reducedMotion: false,
    })
    visibility.event(true)
    visibility.resolve(false)
    await Promise.resolve()
    expect(runtime.setState).toHaveBeenLastCalledWith({
      active: true,
      playing: true,
      reducedMotion: false,
    })
    state.enabled = false
    await nextTick()
    visibility.event(true)
    expect(runtime.setState).toHaveBeenLastCalledWith({
      active: false,
      playing: true,
      reducedMotion: false,
    })
  })

  it('waits for eligibility and idle, then prepares an inactive renderer only once', async () => {
    const { state, unmount } = mount(false)
    expect(idle).toBeNull()
    expect(createLiquidMetalRenderer).not.toHaveBeenCalled()
    state.enabled = true
    await nextTick()
    expect(createLiquidMetalRenderer).not.toHaveBeenCalled()
    prepare()
    expect(createLiquidMetalRenderer).toHaveBeenCalledOnce()
    expect(vi.mocked(createLiquidMetalRenderer).mock.calls[0][1].active).toBe(false)

    for (const active of [true, false, true, false]) {
      state.active = active
      await nextTick()
      expect(runtime.setState).toHaveBeenLastCalledWith({
        active,
        playing: true,
        reducedMotion: false,
      })
    }
    expect(createLiquidMetalRenderer).toHaveBeenCalledOnce()
    expect(runtime.dispose).not.toHaveBeenCalled()
    unmount()
    expect(runtime.dispose).toHaveBeenCalledOnce()
  })

  it('cancels stale warmup and initializes immediately when opened before idle', async () => {
    const { state } = mount()
    const staleIdle = idle
    state.active = true
    await nextTick()
    expect(cancelIdle).toHaveBeenCalledWith(1)
    expect(createLiquidMetalRenderer).toHaveBeenCalledOnce()
    expect(vi.mocked(createLiquidMetalRenderer).mock.calls[0][1].active).toBe(true)
    staleIdle?.({ didTimeout: false, timeRemaining: () => 10 })
    expect(createLiquidMetalRenderer).toHaveBeenCalledOnce()
  })

  it('cancels unneeded preparation on fluid selection and on unmount', async () => {
    const { state, unmount } = mount()
    state.enabled = false
    await nextTick()
    expect(cancelIdle).toHaveBeenCalledWith(1)
    prepare()
    expect(createLiquidMetalRenderer).not.toHaveBeenCalled()
    state.enabled = true
    await nextTick()
    unmount()
    prepare()
    expect(createLiquidMetalRenderer).not.toHaveBeenCalled()
    expect(cancelIdle).toHaveBeenCalledTimes(2)
  })

  it('keeps the existing context on mode switches and updates hidden track/material state', async () => {
    const { state } = mount(true, true)
    state.enabled = false
    await nextTick()
    expect(runtime.setState).toHaveBeenLastCalledWith({
      active: false,
      playing: true,
      reducedMotion: false,
    })
    state.active = false
    state.palette = { ...FALLBACK_PALETTE, background: { r: 20, g: 50, b: 90 } }
    state.settings = { ...DEFAULT_LIQUID_METAL_SETTINGS, speed: 0.4 }
    await nextTick()
    expect(runtime.setPalette).toHaveBeenCalledOnce()
    expect(runtime.setMaterial).toHaveBeenCalledWith(state.settings)
    state.enabled = true
    state.active = true
    state.motionPaused = true
    state.playing = false
    await nextTick()
    expect(runtime.setState).toHaveBeenLastCalledWith({
      active: true,
      playing: false,
      reducedMotion: true,
    })
    expect(runtime.dispose).not.toHaveBeenCalled()
    expect(createLiquidMetalRenderer).toHaveBeenCalledOnce()
  })

  it('exposes the canvas only after drawing, hides a lost context and reports fallback failure', () => {
    const { background, unavailable } = mount(true, true)
    const callbacks = vi.mocked(createLiquidMetalRenderer).mock.calls[0][1]
    expect(background.ready.value).toBe(false)
    callbacks.onReady?.()
    expect(background.ready.value).toBe(true)
    callbacks.onFrameInvalidated?.()
    expect(background.ready.value).toBe(false)
    callbacks.onReady?.()
    expect(background.ready.value).toBe(true)
    callbacks.onContextLost?.()
    expect(background.ready.value).toBe(false)
    callbacks.onReady?.()
    expect(background.ready.value).toBe(true)
    callbacks.onError(new Error('Context unavailable'))
    expect(background.ready.value).toBe(false)
    expect(runtime.dispose).toHaveBeenCalledOnce()
    expect(unavailable).toHaveBeenCalledOnce()
  })
})
