import { createRenderer, nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFullscreenArtworkBackground } from './useFullscreenArtworkBackground'

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

function mount() {
  const state = reactive({ active: true, target: {} as HTMLElement | null })
  let background!: ReturnType<typeof useFullscreenArtworkBackground>
  const app = host.createApp({
    setup() {
      background = useFullscreenArtworkBackground(state)
      return () => null
    },
  })
  app.mount({})
  const unmount = () => app.unmount()
  cleanups.push(unmount)
  return { state, background, unmount }
}

describe('fullscreen background coordination', () => {
  it('activates flow directly', () => {
    const { background } = mount()
    expect(background.fluidEnabled.value).toBe(true)
    expect(background.fluidActive.value).toBe(true)
    expect(background.fluidVisible.value).toBe(true)
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

  it('hides failed flow and prevents retry loops across re-entry and visibility changes', () => {
    const { state, background } = mount()
    background.onFluidUnavailable()
    expect(background.fluidEnabled.value).toBe(false)
    expect(background.fluidActive.value).toBe(false)
    expect(background.fluidVisible.value).toBe(false)
    background.onFluidUnavailable()
    state.active = false
    state.target = null
    Object.assign(document, { hidden: true })
    document.dispatchEvent(new Event('visibilitychange'))
    state.active = true
    state.target = {} as HTMLElement
    Object.assign(document, { hidden: false })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(background.fluidEnabled.value).toBe(false)
    expect(background.fluidActive.value).toBe(false)
    expect(background.fluidVisible.value).toBe(false)
  })
})
