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
    querySelectorAll: () => [],
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
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: () => '',
    backgroundColor: 'rgb(20, 20, 20)',
  }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('first album detail entry', () => {
  it('holds the list during a cold frame gap and starts the dissolve after frames stabilize', async () => {
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
    for (const time of [0, 16, 220, 236]) frame(time)
    expect(detail.animate).not.toHaveBeenCalled()
    expect(left).not.toHaveBeenCalled()
    frame(252)
    expect(prepared).toHaveBeenCalledOnce()
    expect(detail.animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], {
      duration: 650,
      easing: 'ease-in-out',
      fill: 'both',
    })
    expect(list.animate).not.toHaveBeenCalled()
    expect(entered).not.toHaveBeenCalled()
    detail.resolveAnimation()
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

  it('reverses the same dissolve when returning to the album list', async () => {
    const transition = createAlbumDetailEntryTransition()
    transition.configure(true)
    const detail = element()
    const list = element()
    const left = vi.fn()
    const entered = vi.fn()
    transition.leave(detail.node, left)
    transition.beforeEnter(list.node)
    transition.enter(list.node, entered)
    expect(detail.node.style.getPropertyValue('z-index')).toBe('20')
    expect(list.node.style.getPropertyValue('z-index')).toBe('10')
    for (const time of [0, 16, 32]) frame(time)
    expect(list.animate).not.toHaveBeenCalled()
    expect(detail.animate).toHaveBeenCalledWith([{ opacity: 1 }, { opacity: 0 }], {
      duration: 650,
      easing: 'ease-in-out',
      fill: 'both',
    })
    detail.resolveAnimation()
    await vi.waitFor(() => expect(entered).toHaveBeenCalledOnce())
    expect(left).toHaveBeenCalledOnce()
  })

  it('releases the returning list after detail content fades, without ending the dissolve', async () => {
    const ready = vi.fn()
    const transition = createAlbumDetailEntryTransition(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ready,
    )
    transition.configure(true)
    const detail = element()
    const content = element()
    const list = element()
    const entered = vi.fn()
    Object.assign(detail.node, { querySelectorAll: () => [content.node] })
    list.node.style.setProperty('pointer-events', 'auto', 'important')
    transition.leave(detail.node, vi.fn())
    transition.beforeEnter(list.node)
    transition.enter(list.node, entered)
    for (const time of [0, 16, 32]) frame(time)
    expect(list.node.style.getPropertyValue('pointer-events')).toBe('none')
    content.resolveAnimation()
    await Promise.resolve()
    await Promise.resolve()
    expect(ready).toHaveBeenCalledOnce()
    expect(list.node.style.getPropertyValue('pointer-events')).toBe('auto')
    expect(list.node.style.getPropertyPriority('pointer-events')).toBe('important')
    expect(entered).not.toHaveBeenCalled()
    expect(detail.animation.cancel).not.toHaveBeenCalled()
    detail.resolveAnimation()
    await vi.waitFor(() => expect(entered).toHaveBeenCalledOnce())
  })

  it('does not release interaction from a cancelled return', async () => {
    const ready = vi.fn()
    const transition = createAlbumDetailEntryTransition(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ready,
    )
    transition.configure(true)
    const detail = element()
    const content = element()
    Object.assign(detail.node, { querySelectorAll: () => [content.node] })
    transition.leave(detail.node, vi.fn())
    const list = element()
    transition.beforeEnter(list.node)
    transition.enter(list.node, vi.fn())
    for (const time of [0, 16, 32]) frame(time)
    transition.cancel()
    content.resolveAnimation()
    await Promise.resolve()
    await Promise.resolve()
    expect(ready).not.toHaveBeenCalled()
    expect(list.node.style.getPropertyValue('pointer-events')).toBe('')
  })

  it.each([false, true])(
    'reverses the delayed detail content with the page (reverse: %s)',
    (reverse) => {
      const transition = createAlbumDetailEntryTransition()
      transition.configure(reverse)
      const detail = element()
      const list = element()
      const content = element()
      Object.assign(detail.node, { querySelectorAll: () => [content.node] })
      transition.leave(reverse ? detail.node : list.node, vi.fn())
      const incoming = reverse ? list.node : detail.node
      transition.beforeEnter(incoming)
      transition.enter(incoming, vi.fn())
      for (const time of [0, 16, 32]) frame(time)
      expect(content.animate).toHaveBeenCalledWith(
        reverse ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }],
        { duration: 570, delay: reverse ? 0 : 80, easing: 'ease-in-out', fill: 'both' },
      )
      transition.cancel()
      expect(content.animation.cancel).toHaveBeenCalledOnce()
    },
  )

  it('keeps the list colors fixed while the detail uses its target colors', () => {
    const transition = createAlbumDetailEntryTransition()
    const list = element()
    const detail = element()
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) => (name === '--auralis-text' ? 'rgb(240, 240, 240)' : ''),
      backgroundColor: 'rgb(20, 20, 20)',
    }))
    transition.leave(list.node, vi.fn())
    transition.beforeEnter(detail.node)
    expect(list.node.style.getPropertyValue('--auralis-text')).toBe('rgb(240, 240, 240)')
    expect(detail.node.style.getPropertyValue('--auralis-text')).toBe('rgb(240, 240, 240)')
    expect(detail.node.style.getPropertyValue('background-color')).toBe('inherit')
    transition.cancel()
    expect(list.node.style.getPropertyValue('--auralis-text')).toBe('')
    expect(detail.node.style.getPropertyValue('--auralis-text')).toBe('')
  })

  it('freezes the selected detail colors for the entire dissolve', () => {
    let target = {
      '--album-detail-main': 'rgb(10, 20, 30)',
      '--album-detail-main-text': 'rgb(240, 240, 240)',
    }
    const transition = createAlbumDetailEntryTransition(undefined, () => ({ ...target }))
    const list = element()
    const detail = element()
    transition.leave(list.node, vi.fn())
    transition.beforeEnter(detail.node)
    transition.enter(detail.node, vi.fn())
    for (const time of [0, 16, 32]) frame(time)
    expect(detail.node.style.getPropertyValue('background-color')).toBe('rgb(10, 20, 30)')
    expect(detail.node.style.getPropertyValue('--auralis-text')).toBe('rgb(240, 240, 240)')
    target = {
      '--album-detail-main': 'rgb(220, 220, 220)',
      '--album-detail-main-text': 'rgb(20, 20, 20)',
    }
    expect(detail.node.style.getPropertyValue('background-color')).toBe('rgb(10, 20, 30)')
    expect(detail.node.style.getPropertyValue('--auralis-text')).toBe('rgb(240, 240, 240)')
    transition.cancel()
  })

  it('uses the current theme for the returning list instead of the old snapshot', () => {
    const transition = createAlbumDetailEntryTransition()
    const oldList = element()
    const firstDetail = element()
    let theme = 'rgb(240, 240, 240)'
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) => (name === '--auralis-text' ? theme : ''),
      backgroundColor: 'rgb(20, 20, 20)',
    }))
    transition.leave(oldList.node, vi.fn())
    transition.beforeEnter(firstDetail.node)
    transition.cancel()
    theme = 'rgb(30, 30, 30)'
    transition.configure(true)
    const nextDetail = element()
    const nextList = element()
    transition.leave(nextDetail.node, vi.fn())
    transition.beforeEnter(nextList.node)
    expect(nextList.node.style.getPropertyValue('--auralis-text')).toBe('rgb(30, 30, 30)')
    transition.cancel()
  })

  it('waits for detail content rather than animating a skeleton that can be replaced mid-transition', async () => {
    let loading = true
    let notify: (() => void) | undefined
    const disconnect = vi.fn()
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor(callback: () => void) {
          notify = callback
        }
        observe() {}
        disconnect() {
          disconnect()
        }
      },
    )
    const transition = createAlbumDetailEntryTransition()
    const list = element()
    const detail = element()
    Object.assign(detail.node, {
      querySelector: (selector: string) =>
        selector === '.album-detail-skeleton' && loading ? {} : null,
    })
    transition.leave(list.node, vi.fn())
    transition.beforeEnter(detail.node)
    transition.enter(detail.node, vi.fn())
    for (const time of [0, 16, 32]) frame(time)
    expect(detail.animate).not.toHaveBeenCalled()
    loading = false
    notify?.()
    await Promise.resolve()
    for (const time of [0, 16, 32]) frame(time)
    expect(detail.animate).toHaveBeenCalledOnce()
    expect(disconnect).toHaveBeenCalledOnce()
    transition.cancel()

    loading = true
    const nextDetail = element()
    Object.assign(nextDetail.node, {
      querySelector: (selector: string) =>
        selector === '.album-detail-skeleton' && loading ? {} : null,
    })
    transition.leave(element().node, vi.fn())
    transition.beforeEnter(nextDetail.node)
    transition.enter(nextDetail.node, vi.fn())
    expect(nextDetail.animate).not.toHaveBeenCalled()
    loading = false
    notify?.()
    await Promise.resolve()
    expect(nextDetail.animate).toHaveBeenCalledOnce()
    transition.cancel()
  })

  it('waits for the album palette before dissolving and aborts the wait on cancellation', async () => {
    let release: () => void = () => {}
    let signal: AbortSignal | undefined
    const wait = vi.fn((value: AbortSignal) => {
      signal = value
      return new Promise<void>((resolve) => {
        release = resolve
      })
    })
    const started = vi.fn(() => ({ '--album-detail-main': 'rgb(20, 30, 40)' }))
    const transition = createAlbumDetailEntryTransition(undefined, started, undefined, wait)
    const detail = element()
    transition.leave(element().node, vi.fn())
    transition.beforeEnter(detail.node)
    transition.enter(detail.node, vi.fn())
    for (const time of [0, 16, 32]) frame(time)
    expect(detail.animate).not.toHaveBeenCalled()
    expect(started).not.toHaveBeenCalled()
    release()
    await Promise.resolve()
    for (const time of [0, 16, 32]) frame(time)
    expect(detail.animate).toHaveBeenCalledOnce()
    transition.cancel()
    expect(signal?.aborted).toBe(true)
  })

  it('waits for cover decoding even on a subsequent entry', async () => {
    const transition = createAlbumDetailEntryTransition()
    const first = element()
    transition.beforeEnter(first.node)
    transition.enter(first.node, vi.fn())
    for (const time of [0, 16, 32]) frame(time)
    expect(first.animate).toHaveBeenCalledOnce()
    transition.cancel()
    let release: () => void = () => {}
    const decode = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const second = element()
    Object.assign(second.node, {
      querySelector: (selector: string) =>
        selector === '.album-hero-cover img' ? { decode } : null,
    })
    transition.beforeEnter(second.node)
    transition.enter(second.node, vi.fn())
    expect(second.animate).not.toHaveBeenCalled()
    expect(decode).toHaveBeenCalledOnce()
    release()
    await Promise.resolve()
    expect(second.animate).toHaveBeenCalledOnce()
    transition.cancel()
  })

  it('does not stall navigation when the album palette never arrives', async () => {
    const wait = vi.fn(() => new Promise<void>(() => {}))
    const timedOut = vi.fn()
    const transition = createAlbumDetailEntryTransition(
      undefined,
      undefined,
      undefined,
      wait,
      timedOut,
    )
    const detail = element()
    const done = vi.fn()
    transition.beforeEnter(detail.node)
    transition.enter(detail.node, done)
    await vi.advanceTimersByTimeAsync(1000)
    expect(done).toHaveBeenCalledOnce()
    expect(timedOut).toHaveBeenCalledOnce()
    expect(detail.animate).not.toHaveBeenCalled()
  })

  it('freezes the fallback album surface tokens when palette colors are unavailable', () => {
    let surface = 'rgb(20, 20, 20)'
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) => (name === '--album-detail-main' ? surface : ''),
      backgroundColor: surface,
    }))
    const transition = createAlbumDetailEntryTransition(undefined, () => ({}))
    const detail = element()
    transition.leave(element().node, vi.fn())
    transition.beforeEnter(detail.node)
    transition.enter(detail.node, vi.fn())
    for (const time of [0, 16, 32]) frame(time)
    surface = 'rgb(220, 220, 220)'
    expect(detail.node.style.getPropertyValue('--album-detail-main')).toBe('rgb(20, 20, 20)')
    expect(detail.node.style.getPropertyValue('background-color')).toBe('rgb(20, 20, 20)')
    transition.cancel()
  })

  it('keeps detail colors on the outgoing layer when returning', () => {
    const transition = createAlbumDetailEntryTransition()
    transition.configure(true)
    const detail = element()
    const list = element()
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) =>
        ({
          '--auralis-text': 'rgb(10, 10, 10)',
          '--album-detail-main': 'rgb(200, 220, 200)',
        })[name] ?? '',
      backgroundColor: 'rgb(30, 30, 30)',
    }))
    transition.leave(detail.node, vi.fn())
    transition.beforeEnter(list.node)
    expect(detail.node.style.getPropertyValue('--auralis-text')).toBe('rgb(10, 10, 10)')
    expect(detail.node.style.getPropertyValue('background-color')).toBe('rgb(200, 220, 200)')
    transition.cancel()
    expect(detail.node.style.getPropertyValue('background-color')).toBe('')
  })

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
    Object.assign(detail.node, {
      querySelector: (selector: string) =>
        selector === '.album-hero-cover img' ? { decode: () => pendingDecode } : null,
    })
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
    expect(list.animation.cancel).not.toHaveBeenCalled()
    expect(entered).toHaveBeenCalledOnce()
    expect(left).toHaveBeenCalledOnce()
    expect(detail.node.style.getPropertyValue('opacity')).toBe('')
  })
})
