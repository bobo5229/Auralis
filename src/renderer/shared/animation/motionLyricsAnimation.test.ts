import { beforeEach, describe, expect, it, vi } from 'vitest'
import { animateLyricsPanelExpansion } from './motion'

describe('animateLyricsPanelExpansion', () => {
  let rAFCallbacks: Map<number, (time: number) => void>
  let nextRafId: number

  beforeEach(() => {
    rAFCallbacks = new Map()
    nextRafId = 1
    vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
      const id = nextRafId++
      rAFCallbacks.set(id, cb)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rAFCallbacks.delete(id)
    })
  })

  function stepAnimationFrame(time: number): void {
    const current = Array.from(rAFCallbacks.values())
    rAFCallbacks.clear()
    current.forEach((cb) => cb(time))
  }

  it('instantly settles and calls onComplete when reduced motion is preferred', () => {
    const onProgress = vi.fn()
    const onComplete = vi.fn()

    const cancel = animateLyricsPanelExpansion(0, 1, true, onProgress, onComplete)

    expect(onProgress).toHaveBeenCalledWith(1)
    expect(onComplete).toHaveBeenCalled()
    cancel()
  })

  it('instantly settles if from and to are equal', () => {
    const onProgress = vi.fn()
    const onComplete = vi.fn()

    const cancel = animateLyricsPanelExpansion(1, 1, false, onProgress, onComplete)

    expect(onProgress).toHaveBeenCalledWith(1)
    expect(onComplete).toHaveBeenCalled()
    cancel()
  })

  it('runs animation frames over time when reduced motion is disabled', () => {
    const start = performance.now()
    const onProgress = vi.fn()
    const onComplete = vi.fn()

    animateLyricsPanelExpansion(0, 1, false, onProgress, onComplete)

    // First frame scheduled but not complete
    expect(onComplete).not.toHaveBeenCalled()

    // Step halfway (100ms)
    stepAnimationFrame(start + 100)
    expect(onProgress).toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()

    // Step to completion (past 200ms)
    stepAnimationFrame(start + 250)
    expect(onProgress).toHaveBeenLastCalledWith(1)
    expect(onComplete).toHaveBeenCalled()
  })

  it('cancellation stops further progress updates and prevents onComplete', () => {
    const start = performance.now()
    const onProgress = vi.fn()
    const onComplete = vi.fn()

    const cancel = animateLyricsPanelExpansion(0, 1, false, onProgress, onComplete)
    cancel()

    stepAnimationFrame(start + 200)

    expect(onComplete).not.toHaveBeenCalled()
  })

  it('reversing direction cancels old animation so its complete callback cannot unmount', () => {
    const start = performance.now()
    const collapseComplete = vi.fn()
    const expandComplete = vi.fn()
    let currentProgress = 1

    // User starts collapsing
    const cancelCollapse = animateLyricsPanelExpansion(
      1,
      0,
      false,
      (p) => {
        currentProgress = p
      },
      collapseComplete,
    )

    // Advance 50ms into collapsing
    stepAnimationFrame(start + 50)
    expect(collapseComplete).not.toHaveBeenCalled()
    expect(currentProgress).toBeLessThan(1)

    // User rapidly reverses: cancel collapse, start expand from current visible progress
    cancelCollapse()
    animateLyricsPanelExpansion(
      currentProgress,
      1,
      false,
      (p) => {
        currentProgress = p
      },
      expandComplete,
    )

    // Step animation until expand completes
    stepAnimationFrame(start + 250)

    expect(collapseComplete).not.toHaveBeenCalled()
    expect(expandComplete).toHaveBeenCalled()
    expect(currentProgress).toBe(1)
  })
})
