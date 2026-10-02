import { describe, expect, it, vi } from 'vitest'
import { createRhineLoop } from './rhineLifecycle'

describe('Rhine render lifecycle', () => {
  it('does not multiply loops, stops when hidden, and resumes without a time jump', () => {
    const callbacks = new Map<number, FrameRequestCallback>()
    let id = 0
    const request = vi.fn((cb: FrameRequestCallback) => {
      callbacks.set(++id, cb)
      return id
    })
    const cancel = vi.fn((key: number) => {
      callbacks.delete(key)
    })
    const frame = vi.fn()
    const loop = createRhineLoop(frame, request, cancel)
    const advance = (ms: number) => {
      const [key, cb] = [...callbacks.entries()][0]
      callbacks.delete(key)
      cb(ms)
    }
    loop.setActive(true)
    loop.setActive(true)
    expect(callbacks.size).toBe(1)
    advance(100)
    advance(116)
    loop.setActive(false)
    expect(callbacks.size).toBe(0)
    loop.setActive(true)
    advance(100000)
    expect(frame.mock.calls.at(-1)?.[0]).toBeCloseTo(0.016)
    loop.dispose()
    loop.setActive(true)
    expect(callbacks.size).toBe(0)
  })

  it('does not reschedule when disposed inside a frame', () => {
    let callback: FrameRequestCallback = () => undefined
    const request = vi.fn((cb: FrameRequestCallback) => {
      callback = cb
      return 1
    })
    const loop = createRhineLoop(() => loop.dispose(), request, vi.fn())
    loop.setActive(true)
    callback(0)
    expect(request).toHaveBeenCalledTimes(1)
  })
})
