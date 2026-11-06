import { afterEach, expect, it, vi } from 'vitest'
import { ListeningProgressTracker } from '../../renderer/features/playback/core/listeningProgressTracker'
import { createRendererShutdownBarrier } from './rendererShutdown'

afterEach(() => vi.useRealTimers())

it('retries the same listening batch before allowing a previously blocked exit', async () => {
  vi.useFakeTimers()
  let position = 0
  const record = vi
    .fn()
    .mockRejectedValueOnce(new Error('database temporarily busy'))
    .mockResolvedValue({ ok: true, epoch: 0 })
  const tracker = new ListeningProgressTracker({
    getEpoch: async () => 0,
    record,
    snapshot: () => ({ trackId: 1, position, duration: 100, playing: true, hasData: true }),
    now: () => position * 1000,
    epochNow: () => Date.UTC(2026, 0, 1) + position * 1000,
    onError: vi.fn(),
  })
  const barrier = createRendererShutdownBarrier(vi.fn())
  const acknowledgements: boolean[] = []
  const acknowledge = (ok: boolean) => {
    acknowledgements.push(ok)
    barrier.acknowledge(1, ok)
  }
  const target = {
    id: 1,
    isDestroyed: () => false,
    send: vi.fn(() => {
      void tracker.shutdown().then(
        () => acknowledge(true),
        () => acknowledge(false),
      )
    }),
  }
  try {
    await Promise.resolve()
    tracker.start(1)
    position = 1
    tracker.sample()
    await expect(barrier.prepare([target])).rejects.toThrow('Renderer did not finish shutdown')
    await expect(barrier.prepare([target])).resolves.toBeUndefined()
    await expect(barrier.prepare([target])).resolves.toBeUndefined()
    expect(acknowledgements).toEqual([false, true])
    expect(record).toHaveBeenCalledTimes(2)
    expect(record.mock.calls[1][0]).toEqual(record.mock.calls[0][0])
    expect(target.send).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    tracker.dispose()
  }
})
