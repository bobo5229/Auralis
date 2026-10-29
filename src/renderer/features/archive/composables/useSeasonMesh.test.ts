import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ShellTestElement, shellTestRenderer } from '@renderer/testUtils/rendererTestHost'
import { useSeasonMesh } from './useSeasonMesh'

const runtime = vi.hoisted(() => ({
  create: vi.fn(),
  setPlaying: vi.fn(),
  dispose: vi.fn(),
  isReady: vi.fn(() => true),
}))
vi.mock('../runtime/seasonMesh', () => ({ createSeasonMesh: runtime.create }))
vi.mock('../runtime/seasonMeshSession', () => ({
  seasonMeshSession: { read: () => null, whenCaptured: () => Promise.resolve() },
}))
vi.mock('@renderer/shared/animation/useWindowVisibility', async () => {
  const { ref } = await import('vue')
  return { useWindowVisibility: () => ref(true) }
})
vi.mock('@renderer/shared/animation/motionPreference', () => ({
  createReducedMotionQuery: () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }),
}))

let intersect: IntersectionObserverCallback
let unmount: (() => void) | undefined
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
beforeEach(() => {
  vi.clearAllMocks()
  runtime.create.mockReturnValue({
    setPlaying: runtime.setPlaying,
    dispose: runtime.dispose,
    isReady: runtime.isReady,
    resize: vi.fn(),
    refreshAppearance: vi.fn(),
  })
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', { documentElement: {} })
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  for (const name of ['ResizeObserver', 'MutationObserver']) {
    vi.stubGlobal(
      name,
      class {
        observe() {}
        disconnect() {}
      },
    )
  }
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})
afterEach(() => {
  unmount?.()
  unmount = undefined
  frames.clear()
  vi.unstubAllGlobals()
})

function mount(active = ref(true)) {
  const host = ref(new ShellTestElement('div') as unknown as HTMLElement)
  const canvas = ref(new ShellTestElement('div') as unknown as HTMLElement)
  const app = shellTestRenderer.createApp({
    setup() {
      useSeasonMesh(host, canvas, ref(null), active)
      return () => null
    },
  })
  app.mount(new ShellTestElement('main'))
  unmount = () => app.unmount()
  intersect(
    [
      {
        target: host.value,
        isIntersecting: true,
        time: 0,
        intersectionRatio: 1,
        rootBounds: null,
        boundingClientRect: host.value.getBoundingClientRect(),
        intersectionRect: host.value.getBoundingClientRect(),
      },
    ],
    {} as IntersectionObserver,
  )
  return active
}
async function settle() {
  await nextTick()
  await vi.dynamicImportSettled()
  await nextTick()
}

it('pauses an intersecting banner while covered and resumes the same renderer on return', async () => {
  const active = mount()
  await settle()
  expect(runtime.create).toHaveBeenCalledOnce()
  expect(runtime.setPlaying).toHaveBeenLastCalledWith(true)
  active.value = false
  expect(runtime.setPlaying).toHaveBeenLastCalledWith(false)
  expect(frames.size).toBe(0)
  expect(runtime.dispose).not.toHaveBeenCalled()
  active.value = true
  expect(runtime.setPlaying).toHaveBeenLastCalledWith(true)
  expect(runtime.create).toHaveBeenCalledOnce()
  unmount?.()
  unmount = undefined
  expect(runtime.dispose).toHaveBeenCalledOnce()
})

it('does not create a renderer until the covered page becomes visible', async () => {
  const active = mount(ref(false))
  await settle()
  expect(runtime.create).not.toHaveBeenCalled()
  active.value = true
  await settle()
  expect(runtime.create).toHaveBeenCalledOnce()
})

it('does not finish deferred initialization after the page is covered', async () => {
  const active = mount()
  await nextTick()
  active.value = false
  await settle()
  expect(runtime.setPlaying.mock.calls.at(-1)?.[0] ?? false).toBe(false)
  active.value = true
  await settle()
  expect(runtime.setPlaying).toHaveBeenLastCalledWith(true)
})
