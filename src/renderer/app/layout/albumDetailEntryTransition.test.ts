import { describe, expect, it, vi } from 'vitest'
import { createAlbumDetailEntryTransition } from './albumDetailEntryTransition'

describe('album navigation', () => {
  it.each([false, true])('completes immediately without animation (return: %s)', (reverse) => {
    const started = vi.fn()
    const finished = vi.fn()
    const waitForColors = vi.fn()
    const transition = createAlbumDetailEntryTransition(undefined, started, finished, waitForColors)
    const element = { animate: vi.fn() } as unknown as HTMLElement
    const left = vi.fn()
    const entered = vi.fn()
    transition.configure(reverse)
    transition.leave(element, left)
    transition.beforeEnter(element)
    transition.enter(element, entered)
    expect(left).toHaveBeenCalledOnce()
    expect(entered).toHaveBeenCalledOnce()
    expect(started).toHaveBeenCalledOnce()
    expect(finished).toHaveBeenCalledOnce()
    expect(waitForColors).not.toHaveBeenCalled()
    expect(element.animate).not.toHaveBeenCalled()
  })
})
