import { afterEach, expect, it, vi } from 'vitest'
import { createRendererShutdownBarrier } from './rendererShutdown'
afterEach(() => vi.useRealTimers())
it('waits for each target and ignores acknowledgements from other senders', async () => {
  const warn = vi.fn()
  const barrier = createRendererShutdownBarrier(warn)
  let done = false
  const pending = barrier.prepare([{ id: 1, isDestroyed: () => false, send: vi.fn() }]).then(() => {
    done = true
  })
  barrier.acknowledge(2, true)
  await Promise.resolve()
  expect(done).toBe(false)
  barrier.acknowledge(1, true)
  await pending
  expect(warn).not.toHaveBeenCalled()
})
it('times out unresponsive renderers and skips destroyed targets', async () => {
  vi.useFakeTimers()
  const warn = vi.fn(),
    send = vi.fn()
  const barrier = createRendererShutdownBarrier(warn)
  const pending = barrier.prepare([
    { id: 1, isDestroyed: () => false, send },
    { id: 2, isDestroyed: () => true, send },
  ])
  await vi.advanceTimersByTimeAsync(3000)
  await pending
  expect(send).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledTimes(1)
})
it('reports failed drains without preventing exit', async () => {
  const warn = vi.fn()
  const barrier = createRendererShutdownBarrier(warn)
  await barrier.prepare([
    { id: 1, isDestroyed: () => false, send: () => barrier.acknowledge(1, false) },
  ])
  expect(warn).toHaveBeenCalledTimes(1)
})
