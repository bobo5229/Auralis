import { afterEach, expect, it, vi } from 'vitest'
import { playCdStartup, type CdStartupDisc } from './cdStartup'
import { cdPose, cdSlots } from './cdGeometry'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('samples real elapsed time across long frames and finishes at 4500ms', () => {
  vi.spyOn(performance, 'now').mockReturnValue(0)
  const pending = new Map<number, FrameRequestCallback>()
  let id = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending.set(++id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => pending.delete(frame))
  const element = (): HTMLElement => ({ style: {} }) as HTMLElement
  const pool = new Map<number, CdStartupDisc>(
    Array.from({ length: 13 }, (_, layer) => [
      layer - 11,
      { slot: element(), disc: element(), vinyl: element() },
    ]),
  )
  const complete = vi.fn()
  const prepare = vi.fn()
  playCdStartup(pool, 30, () => ({ width: 1200, height: 700 }), complete, prepare)
  const frame = (time: number): void => {
    const callbacks = [...pending.values()]
    pending.clear()
    callbacks.forEach((callback) => callback(time))
  }
  frame(16)
  // Jump across stalled frames to the midpoint of the slide (position -4.5).
  frame(2975)
  expect(prepare).toHaveBeenLastCalledWith({ visible: cdSlots(-4.5, 30) })
  expect(complete).not.toHaveBeenCalled()
  frame(4500)
  const pose = cdPose(0, 1200, 700)
  expect(pool.get(0)!.slot.style.transform).toBe(
    `translate3d(${pose.cx - pose.size / 2}px, ${pose.cy - pose.size / 2}px, 0) scale(${pose.size / 400})`,
  )
  expect(complete).toHaveBeenCalledOnce()
  expect(pending.size).toBe(0)
})
