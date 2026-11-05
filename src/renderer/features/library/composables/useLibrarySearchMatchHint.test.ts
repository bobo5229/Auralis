import { shallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLibrarySearchMatchHint } from './useLibrarySearchMatchHint'

function createHint() {
  const cue = { cancel: vi.fn(), onfinish: null as (() => void) | null }
  const row = {
    getBoundingClientRect: () => ({ top: 100, bottom: 148, height: 48 }),
    closest: vi.fn(() => null as unknown),
    animate: vi.fn<(frames: Keyframe[], options: KeyframeAnimationOptions) => typeof cue>(
      () => cue,
    ),
  }
  const container = {
    getBoundingClientRect: () => ({ top: 0, bottom: 600 }),
    querySelector: vi.fn(() => row as typeof row | null),
  }
  const hint = useLibrarySearchMatchHint(shallowRef(container as unknown as HTMLElement))
  return { hint, container, row, cue }
}

describe('search match hint', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', {
      requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 16),
      cancelAnimationFrame: clearTimeout,
      matchMedia: () => ({ matches: false }),
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('waits for positioning and virtual row mounting before cueing the target ID', async () => {
    const { hint, container, row } = createHint()
    let positioned!: () => void
    const pending = hint.revealAfterPosition(
      42,
      () => new Promise<void>((resolve) => (positioned = resolve)),
      () => true,
    )
    await vi.advanceTimersByTimeAsync(32)
    expect(row.animate).not.toHaveBeenCalled()
    container.querySelector.mockReturnValueOnce(null)
    positioned()
    await vi.advanceTimersByTimeAsync(16)
    expect(row.animate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(16)
    await pending
    expect(container.querySelector).toHaveBeenLastCalledWith('[data-track-id="42"]')
    expect(row.animate).toHaveBeenCalledOnce()
    expect(row.animate.mock.calls[0]?.[1]).toMatchObject({ composite: 'add' })
  })

  it('cancels the previous cue and can replay the same track', async () => {
    const { hint, row, cue } = createHint()
    const first = hint.revealAfterPosition(
      1,
      async () => {},
      () => true,
    )
    await vi.advanceTimersByTimeAsync(16)
    await first
    const second = hint.revealAfterPosition(
      1,
      async () => {},
      () => true,
    )
    expect(cue.cancel).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(16)
    await second
    expect(row.animate).toHaveBeenCalledTimes(2)
  })

  it('ignores an old positioning result after a newer jump starts', async () => {
    const { hint, row } = createHint()
    let release!: () => void
    const old = hint.revealAfterPosition(
      1,
      () => new Promise<void>((resolve) => (release = resolve)),
      () => true,
    )
    const latest = hint.revealAfterPosition(
      2,
      async () => {},
      () => true,
    )
    await vi.advanceTimersByTimeAsync(16)
    await latest
    release()
    await old
    expect(row.animate).toHaveBeenCalledOnce()
  })

  it('cleans pending frames on clear and active animations on disposal', async () => {
    const { hint, row, cue } = createHint()
    const pending = hint.revealAfterPosition(
      1,
      async () => {},
      () => true,
    )
    await vi.advanceTimersByTimeAsync(0)
    hint.clear()
    await pending
    expect(vi.getTimerCount()).toBe(0)
    expect(row.animate).not.toHaveBeenCalled()
    const active = hint.revealAfterPosition(
      1,
      async () => {},
      () => true,
    )
    await vi.advanceTimersByTimeAsync(16)
    await active
    hint.clear()
    expect(cue.cancel).toHaveBeenCalledOnce()
  })

  it('does not cue a cancelled jump or a row outside the viewport', async () => {
    const { hint, row } = createHint()
    let current = true
    const pending = hint.revealAfterPosition(
      1,
      async () => {},
      () => current,
    )
    await vi.advanceTimersByTimeAsync(0)
    current = false
    await vi.advanceTimersByTimeAsync(16)
    await pending
    expect(row.animate).not.toHaveBeenCalled()
    row.getBoundingClientRect = () => ({ top: 700, bottom: 748, height: 48 })
    const offscreen = hint.revealAfterPosition(
      1,
      async () => {},
      () => true,
    )
    await vi.advanceTimersByTimeAsync(64)
    await offscreen
    expect(row.animate).not.toHaveBeenCalled()
  })

  it.each(['app', 'system'])(
    'uses a temporary static tint for %s reduced motion',
    async (source) => {
      const { hint, row } = createHint()
      if (source === 'app') row.closest.mockReturnValue({})
      else window.matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList)
      const pending = hint.revealAfterPosition(
        1,
        async () => {},
        () => true,
      )
      await vi.advanceTimersByTimeAsync(16)
      await pending
      const [frames, timing] = row.animate.mock.calls[0] as unknown as [
        Keyframe[],
        KeyframeAnimationOptions,
      ]
      expect(frames[0]).toEqual(frames[1])
      expect(timing.duration).toBe(750)
      expect(timing.fill).toBeUndefined()
    },
  )
})
