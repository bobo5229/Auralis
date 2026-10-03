import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAlbumDetailEntryTransition } from './albumDetailEntryTransition'

const motion = vi.hoisted(() => ({ matches: false, listener: null as (() => void) | null }))
vi.mock('@renderer/shared/animation/motionPreference', () => ({
  createReducedMotionQuery: () => ({
    get matches() {
      return motion.matches
    },
    addEventListener: (_type: string, listener: () => void) => (motion.listener = listener),
    removeEventListener: () => (motion.listener = null),
  }),
}))

function element() {
  const styles = new Map<string, { value: string; priority: string }>()
  let resolveAnimation: () => void = () => {}
  const animation = {
    finished: new Promise<void>((resolve) => (resolveAnimation = resolve)),
    cancel: vi.fn(),
  }
  const node = {
    style: {
      getPropertyValue: (key: string) => styles.get(key)?.value ?? '',
      getPropertyPriority: (key: string) => styles.get(key)?.priority ?? '',
      setProperty: (key: string, value: string, priority = '') =>
        styles.set(key, { value, priority }),
      removeProperty: (key: string) => styles.delete(key),
    },
    querySelector: () => null,
    animate: vi.fn(() => animation),
  }
  return {
    node: node as unknown as HTMLElement,
    animate: node.animate,
    animation,
    resolveAnimation,
  }
}

let frameCallback: FrameRequestCallback | null = null
function frame(time: number): void {
  const callback = frameCallback
  frameCallback = null
  callback?.(time)
}

beforeEach(() => {
  vi.useFakeTimers()
  motion.matches = false
  motion.listener = null
  frameCallback = null
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frameCallback = callback
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => (frameCallback = null))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('first album detail entry', () => {
  it('holds the list during a cold frame gap and starts both animations after frames stabilize', async () => {
    const prepared = vi.fn()
    const transition = createAlbumDetailEntryTransition(prepared)
    const list = element()
    const detail = element()
    const left = vi.fn()
    const entered = vi.fn()
    detail.node.style.setProperty('opacity', '0.8', 'important')
    detail.node.style.setProperty('--album-accent', 'red')
    transition.leave(list.node, left)
    transition.beforeEnter(detail.node)
    transition.enter(detail.node, entered)
    expect(list.node.style.getPropertyValue('opacity')).toBe('1')
    expect(detail.node.style.getPropertyValue('opacity')).toBe('0.01')
    for (const time of [0, 16, 32, 220, 236, 252, 268]) frame(time)
    expect(detail.animate).not.toHaveBeenCalled()
    expect(left).not.toHaveBeenCalled()
    frame(284)
    expect(prepared).toHaveBeenCalledOnce()
    expect(detail.animate).toHaveBeenCalledOnce()
    expect(list.animate).toHaveBeenCalledOnce()
    expect(entered).not.toHaveBeenCalled()
    detail.resolveAnimation()
    list.resolveAnimation()
    await vi.waitFor(() => expect(entered).toHaveBeenCalledOnce())
    expect(left).toHaveBeenCalledOnce()
    expect(detail.node.style.getPropertyValue('opacity')).toBe('0.8')
    expect(detail.node.style.getPropertyPriority('opacity')).toBe('important')
    expect(detail.node.style.getPropertyValue('--album-accent')).toBe('red')
    expect(list.node.style.getPropertyValue('position')).toBe('')
    expect(motion.listener).toBeNull()
  })

  it.each(['navigation', 'motion preference', 'deadline'] as const)(
    'releases navigation and temporary styles when interrupted by %s',
    async (cause) => {
      const prepared = vi.fn()
      const transition = createAlbumDetailEntryTransition(prepared)
      const list = element()
      const detail = element()
      const left = vi.fn()
      const entered = vi.fn()
      transition.leave(list.node, left)
      transition.beforeEnter(detail.node)
      transition.enter(detail.node, entered)
      if (cause === 'navigation') transition.cancel()
      else if (cause === 'motion preference') motion.listener?.()
      else await vi.advanceTimersByTimeAsync(1000)
      transition.cancel()
      for (const time of [0, 16, 32, 48, 64]) frame(time)
      expect(prepared).not.toHaveBeenCalled()
      expect(detail.animate).not.toHaveBeenCalled()
      expect(left).toHaveBeenCalledOnce()
      expect(entered).toHaveBeenCalledOnce()
      expect(detail.node.style.getPropertyValue('opacity')).toBe('')
      expect(list.node.style.getPropertyValue('pointer-events')).toBe('')
      expect(frameCallback).toBeNull()
    },
  )

  it('completes immediately when reduced motion is enabled', () => {
    motion.matches = true
    const transition = createAlbumDetailEntryTransition(vi.fn())
    const detail = element()
    const done = vi.fn()
    transition.beforeEnter(detail.node)
    transition.enter(detail.node, done)
    expect(done).toHaveBeenCalledOnce()
    expect(detail.animate).not.toHaveBeenCalled()
    expect(frameCallback).toBeNull()
  })

  it('bounds a stalled cover decode and ignores its completion after cancellation', async () => {
    let resolveDecode: () => void = () => {}
    const pendingDecode = new Promise<void>((resolve) => (resolveDecode = resolve))
    const prepared = vi.fn()
    const transition = createAlbumDetailEntryTransition(prepared)
    const detail = element()
    Object.assign(detail.node, { querySelector: () => ({ decode: () => pendingDecode }) })
    const done = vi.fn()
    transition.beforeEnter(detail.node)
    transition.enter(detail.node, done)
    await vi.advanceTimersByTimeAsync(1000)
    expect(done).toHaveBeenCalledOnce()

    const nextDetail = element()
    transition.beforeEnter(nextDetail.node)
    transition.enter(nextDetail.node, vi.fn())
    resolveDecode()
    await Promise.resolve()
    for (const time of [0, 16, 32, 48, 64]) frame(time)
    expect(detail.animate).not.toHaveBeenCalled()
    expect(nextDetail.animate).toHaveBeenCalledOnce()
    expect(prepared).toHaveBeenCalledOnce()
    transition.cancel()
  })

  it('cancels active animations and completes both participants once', () => {
    const transition = createAlbumDetailEntryTransition(vi.fn())
    const list = element()
    const detail = element()
    const left = vi.fn()
    const entered = vi.fn()
    transition.leave(list.node, left)
    transition.beforeEnter(detail.node)
    transition.enter(detail.node, entered)
    for (const time of [0, 16, 32, 48, 64]) frame(time)
    transition.cancel()
    transition.cancel()
    expect(detail.animation.cancel).toHaveBeenCalledOnce()
    expect(list.animation.cancel).toHaveBeenCalledOnce()
    expect(entered).toHaveBeenCalledOnce()
    expect(left).toHaveBeenCalledOnce()
    expect(detail.node.style.getPropertyValue('opacity')).toBe('')
  })
})
