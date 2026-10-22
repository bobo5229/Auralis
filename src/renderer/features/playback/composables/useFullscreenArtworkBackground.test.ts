import { createRenderer, nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFullscreenArtworkBackground } from './useFullscreenArtworkBackground'
import type { FullscreenBackgroundMode } from './useFullscreenBackground'

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
beforeEach(() => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }))
})
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
})

function mount(mode: FullscreenBackgroundMode = 'fluid') {
  const state = reactive({ mode, active: true, target: {} as HTMLElement | null })
  const fallback = vi.fn((next: FullscreenBackgroundMode) => {
    state.mode = next
  })
  let background!: ReturnType<typeof useFullscreenArtworkBackground>
  const app = host.createApp({
    setup() {
      background = useFullscreenArtworkBackground(state, fallback)
      return () => null
    },
  })
  app.mount({})
  const unmount = () => app.unmount()
  cleanups.push(unmount)
  return { state, fallback, background, unmount }
}

describe('fullscreen background coordination', () => {
  it('activates flow directly and disables it immediately on solid selection', () => {
    const { state, background } = mount()
    expect(background.fluidEnabled.value).toBe(true)
    expect(background.fluidActive.value).toBe(true)
    expect(background.fluidVisible.value).toBe(true)
    state.mode = 'solid'
    expect(background.fluidEnabled.value).toBe(false)
    expect(background.fluidActive.value).toBe(false)
    expect(background.fluidVisible.value).toBe(false)
    state.mode = 'fluid'
    expect(background.fluidActive.value).toBe(true)
  })

  it('opens solid without enabling a GPU renderer and ignores stale renderer events', () => {
    const { background, fallback } = mount('solid')
    expect(background.fluidEnabled.value).toBe(false)
    expect(background.fluidActive.value).toBe(false)
    background.onFluidUnavailable()
    background.onFluidLost()
    expect(fallback).not.toHaveBeenCalled()
  })

  it.each(['exit', 'document-hidden'] as const)('pauses on %s and resumes on return', (reason) => {
    const { state, background } = mount()
    if (reason === 'exit') state.active = false
    else {
      Object.assign(document, { hidden: true })
      document.dispatchEvent(new Event('visibilitychange'))
    }
    expect(background.fluidEnabled.value).toBe(true)
    expect(background.fluidActive.value).toBe(false)
    if (reason === 'exit') state.active = true
    else {
      Object.assign(document, { hidden: false })
      document.dispatchEvent(new Event('visibilitychange'))
    }
    expect(background.fluidActive.value).toBe(true)
    state.target = null
    expect(background.fluidVisible.value).toBe(false)
  })

  it('observes window visibility and unsubscribes on unmount', async () => {
    let update!: (event: { isVisible: boolean }) => void
    const unsubscribe = vi.fn()
    Object.assign(window, {
      auralis: {
        window: {
          getVisibility: vi.fn(async () => ({ isVisible: true })),
          onVisibilityChanged: vi.fn((listener) => {
            update = listener
            return unsubscribe
          }),
        },
      },
    })
    const { background, unmount } = mount()
    expect(background.fluidActive.value).toBe(false)
    await nextTick()
    expect(background.fluidActive.value).toBe(true)
    update({ isVisible: false })
    expect(background.fluidActive.value).toBe(false)
    update({ isVisible: true })
    expect(background.fluidActive.value).toBe(true)
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
    cleanups.pop()
  })

  it('falls back to solid on initialization failure and prevents a retry loop', () => {
    const { state, background, fallback } = mount()
    background.onFluidUnavailable()
    expect(state.mode).toBe('solid')
    expect(background.fluidEnabled.value).toBe(false)
    background.onFluidUnavailable()
    expect(fallback).toHaveBeenCalledOnce()
    state.mode = 'fluid'
    expect(state.mode).toBe('solid')
    expect(background.fluidActive.value).toBe(false)
  })

  it('stays solid after context loss until the user explicitly selects flow again', async () => {
    const { state, background, fallback } = mount()
    background.onFluidLost()
    expect(state.mode).toBe('solid')
    await nextTick()
    expect(state.mode).toBe('solid')
    state.active = false
    state.active = true
    expect(state.mode).toBe('solid')
    expect(fallback).toHaveBeenCalledOnce()
    state.mode = 'fluid'
    expect(background.fluidActive.value).toBe(true)
  })
})
