import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, markRaw, nextTick, ref } from 'vue'
import { animateFullscreenPlayerTransition } from '@renderer/shared/animation/motion'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'
import { useFullscreenOverlayLifecycle } from './useFullscreenOverlayLifecycle'

vi.mock('@renderer/shared/animation/motion', () => ({ animateFullscreenPlayerTransition: vi.fn() }))
vi.mock('@renderer/shared/focus/useOverlayFocusTrap', () => ({ useOverlayFocusTrap: vi.fn() }))
class ElementStub {
  inert = false
  isConnected = true
  focus = vi.fn()
  contains = vi.fn(() => false)
  hasAttribute = vi.fn(() => false)
  closest = vi.fn(() => null)
  querySelector = vi.fn(() => null)
}
const cleanups: (() => void)[] = []
function fixture() {
  const trigger = markRaw(new ElementStub()),
    element = markRaw(new ElementStub())
  vi.stubGlobal('HTMLElement', ElementStub)
  vi.stubGlobal('document', { activeElement: trigger, querySelector: () => trigger })
  const frames = new Map<number, FrameRequestCallback>()
  let frameId = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(++frameId, cb)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  const snapshot = { overlayOpacity: 0.4 } as unknown as NonNullable<
    ReturnType<ReturnType<typeof animateFullscreenPlayerTransition>['cancel']>
  >
  const motions: { cancel: ReturnType<typeof vi.fn>; finish: ReturnType<typeof vi.fn> }[] = []
  vi.mocked(animateFullscreenPlayerTransition)
    .mockClear()
    .mockImplementation(() => {
      const motion = { cancel: vi.fn(() => snapshot), finish: vi.fn() }
      motions.push(motion)
      return motion
    })
  const isOpen = ref(false),
    reducedMotion = ref(false),
    artworkCacheKey = ref<string | null>('one')
  const onEntered = vi.fn(),
    onEscape = vi.fn()
  const scope = effectScope()
  const session = scope.run(() =>
    useFullscreenOverlayLifecycle({ isOpen, reducedMotion, artworkCacheKey, onEntered, onEscape }),
  )!
  cleanups.push(() => {
    session.dispose()
    scope.stop()
  })
  const flushFrame = () => {
    const pending = [...frames]
    frames.clear()
    for (const [, cb] of pending) cb(0)
  }
  const transition = () => vi.mocked(animateFullscreenPlayerTransition).mock.calls.at(-1)![0]
  const focus = () => vi.mocked(useOverlayFocusTrap).mock.calls.at(-1)![0]
  return {
    session,
    trigger,
    element,
    isOpen,
    reducedMotion,
    artworkCacheKey,
    onEntered,
    onEscape,
    motions,
    snapshot,
    frames,
    flushFrame,
    transition,
    focus,
  }
}
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.unstubAllGlobals()
})

describe('useFullscreenOverlayLifecycle', () => {
  it('gates cold background initialization synchronously and releases it after two frames', () => {
    const f = fixture(),
      done = vi.fn()
    f.isOpen.value = true
    expect(f.session.deferBackgroundInitialization.value).toBe(true)
    f.session.handleEnter(f.element as unknown as Element, done)
    expect(f.session.backgroundTarget.value).toBe(f.element)
    expect(f.transition()).toMatchObject({ entering: true, reducedMotion: false })
    f.transition().onComplete()
    expect(done).toHaveBeenCalledOnce()
    expect(f.onEntered).toHaveBeenCalledOnce()
    f.flushFrame()
    expect(f.session.deferBackgroundInitialization.value).toBe(true)
    f.flushFrame()
    expect(f.session.deferBackgroundInitialization.value).toBe(false)
  })
  it('carries interrupted geometry into reversals and keeps a newer background target', () => {
    const f = fixture()
    f.session.handleEnter(f.element as unknown as Element, vi.fn())
    f.session.handleTransitionCancelled()
    f.session.handleLeave(f.element as unknown as Element, vi.fn())
    expect(f.transition().interrupted).toBe(f.snapshot)
    expect(f.element.inert).toBe(true)
    expect(f.frames.size).toBe(0)
    const newer = markRaw(new ElementStub())
    f.session.handleEnter(newer as unknown as Element, vi.fn())
    expect(f.motions[1].cancel).toHaveBeenCalledOnce()
    f.session.handleAfterLeave(f.element as unknown as Element)
    expect(f.session.backgroundTarget.value).toBe(newer)
    f.session.handleAfterLeave(newer as unknown as Element)
    expect(f.session.backgroundTarget.value).toBeNull()
  })
  it('finishes transitions on artwork or motion changes and cancels pending work on disposal', async () => {
    const f = fixture()
    f.session.handleEnter(f.element as unknown as Element, vi.fn())
    f.artworkCacheKey.value = 'two'
    await nextTick()
    f.reducedMotion.value = true
    await nextTick()
    expect(f.motions[0].finish).toHaveBeenCalledTimes(2)
    f.session.handleTransitionCancelled()
    expect(f.frames.size).toBe(1)
    f.session.dispose()
    expect(f.frames.size).toBe(0)
  })
  it('captures only external focus, delegates Escape and restores only a usable trigger', () => {
    const f = fixture()
    f.session.keyboardNavigation.value = true
    f.isOpen.value = true
    expect(f.session.keyboardNavigation.value).toBe(false)
    f.focus().onEscape()
    expect(f.onEscape).toHaveBeenCalledOnce()
    f.focus().restoreFocus!(null)
    expect(f.trigger.focus).toHaveBeenCalledWith({ preventScroll: true })
    f.trigger.focus.mockClear()
    f.isOpen.value = false
    f.isOpen.value = true
    f.trigger.isConnected = false
    f.focus().restoreFocus!(null)
    expect(f.trigger.focus).not.toHaveBeenCalled()
  })
})
