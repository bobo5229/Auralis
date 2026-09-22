import { effectScope, nextTick, ref, shallowRef, type EffectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAlbumCoverTracking } from './useAlbumCoverTracking'

const scopes: EffectScope[] = []

function setup(active = true) {
  const documentTarget = new EventTarget()
  const media = Object.assign(new EventTarget(), { matches: false })
  const frames = new Map<number, FrameRequestCallback>()
  let frameId = 0
  const windowTarget = Object.assign(new EventTarget(), {
    innerWidth: 1000,
    innerHeight: 800,
    matchMedia: () => media,
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      frames.set(++frameId, callback)
      return frameId
    }),
    cancelAnimationFrame: vi.fn((id: number) => frames.delete(id)),
  })
  vi.stubGlobal('document', documentTarget)
  vi.stubGlobal('window', windowTarget)
  const properties = new Map<string, string>()
  const stage = {
    style: {
      setProperty: (name: string, value: string) => properties.set(name, value),
      removeProperty: (name: string) => properties.delete(name),
    },
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 200, height: 200 }),
  } as unknown as HTMLElement
  const root = shallowRef(new EventTarget() as HTMLElement)
  const enabled = ref(active)
  const scope = effectScope()
  scopes.push(scope)
  scope.run(() => useAlbumCoverTracking(root, shallowRef(stage), enabled))
  const move = (pointerType = 'mouse') => {
    documentTarget.dispatchEvent(
      Object.assign(new Event('pointermove'), { pointerType, clientX: 1000, clientY: 800 }),
    )
  }
  const flushFrames = () => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach((callback) => callback(0))
  }
  return { scope, root, enabled, media, frames, properties, move, flushFrames, windowTarget }
}

afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.unstubAllGlobals()
})

describe('useAlbumCoverTracking', () => {
  it('gates entry effects, batches pointer updates and clears transforms when disabled', async () => {
    const state = setup(false)
    state.move()
    expect(state.frames.size).toBe(0)
    state.enabled.value = true
    await nextTick()
    await nextTick()
    state.move()
    state.move()
    expect(state.frames.size).toBe(1)
    state.flushFrames()
    expect(state.properties.get('--detail-cover-rotate-x')).toBe('-12deg')
    expect(state.properties.get('--detail-cover-rotate-y')).toBe('12deg')
    state.move()
    state.enabled.value = false
    await nextTick()
    expect(state.frames.size).toBe(0)
    expect(state.properties.size).toBe(0)
    state.move()
    state.root.value.dispatchEvent(new Event('scroll'))
    expect(state.frames.size).toBe(0)
  })

  it('ignores touch and clears pending work when reduced motion is enabled', async () => {
    const state = setup()
    await nextTick()
    state.move('touch')
    expect(state.frames.size).toBe(0)
    state.move()
    state.flushFrames()
    state.move()
    state.media.matches = true
    state.media.dispatchEvent(new Event('change'))
    expect(state.properties.size).toBe(0)
    expect(state.frames.size).toBe(0)
    state.move()
    expect(state.frames.size).toBe(0)
  })

  it('rebinds scrolling when the detail DOM changes and removes it on disposal', async () => {
    const state = setup()
    await nextTick()
    const previousRoot = state.root.value
    state.root.value = new EventTarget() as HTMLElement
    await nextTick()
    await nextTick()
    previousRoot.dispatchEvent(new Event('scroll'))
    expect(state.frames.size).toBe(0)
    state.root.value.dispatchEvent(new Event('scroll'))
    expect(state.frames.size).toBe(1)
    state.scope.stop()
    expect(state.frames.size).toBe(0)
    state.move()
    state.root.value.dispatchEvent(new Event('scroll'))
    expect(state.frames.size).toBe(0)
  })

  it('does not bind deferred listeners after disposal during activation', async () => {
    const state = setup()
    state.scope.stop()
    await nextTick()
    state.root.value.dispatchEvent(new Event('scroll'))
    state.move()
    expect(state.frames.size).toBe(0)
  })

  it('cancels a scheduled frame and resets the cover on window blur', async () => {
    const state = setup()
    await nextTick()
    state.move()
    state.flushFrames()
    state.move()
    state.windowTarget.dispatchEvent(new Event('blur'))
    expect(state.frames.size).toBe(0)
    expect(state.properties.size).toBe(0)
  })
})
