import { watch } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MetadataRootWatchers } from './metadataRootWatchers'

vi.mock('node:fs', () => ({ watch: vi.fn() }))
vi.mock('@main/logging/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }))

const root = 'C:\\isolated-retry'
function nativeWatcher() {
  let error!: (error: Error) => void
  const close = vi.fn()
  vi.mocked(watch).mockImplementation(
    () =>
      ({
        on: (_event: string, callback: typeof error) => {
          error = callback
        },
        close,
      }) as unknown as ReturnType<typeof watch>,
  )
  return { close, fail: () => error(new Error('Disconnected')) }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(watch).mockReset()
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

it('backs off failed starts up to 30 seconds, recovers once, and resets after another error', async () => {
  const native = nativeWatcher()
  const start = vi.mocked(watch).getMockImplementation()!
  vi.mocked(watch).mockImplementation(() => {
    throw new Error('Offline')
  })
  const recovered = vi.fn()
  const roots = new MetadataRootWatchers(() => false, vi.fn(), recovered)
  roots.sync([root])
  let calls = 1
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    await vi.advanceTimersByTimeAsync(delay - 1)
    expect(watch).toHaveBeenCalledTimes(calls)
    await vi.advanceTimersByTimeAsync(1)
    expect(watch).toHaveBeenCalledTimes(++calls)
  }
  vi.mocked(watch).mockImplementation(start)
  await vi.advanceTimersByTimeAsync(30000)
  expect(recovered).toHaveBeenCalledOnce()
  const isCurrent = recovered.mock.calls[0][1] as () => boolean
  expect(isCurrent()).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  native.fail()
  expect(isCurrent()).toBe(false)
  await vi.advanceTimersByTimeAsync(1000)
  expect(recovered).toHaveBeenCalledTimes(2)
  roots.close()
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['remove', 'close'] as const)('cancels a failed-root retry on %s', async (action) => {
  vi.mocked(watch).mockImplementation(() => {
    throw new Error('Offline')
  })
  const recovered = vi.fn()
  const roots = new MetadataRootWatchers(() => false, vi.fn(), recovered)
  roots.sync([root])
  if (action === 'remove') roots.sync([])
  else roots.close()
  await vi.advanceTimersByTimeAsync(60000)
  expect(watch).toHaveBeenCalledOnce()
  expect(recovered).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('cancels scheduled retries when an explicit sync succeeds, and ignores errors from old watchers', async () => {
  const first = nativeWatcher()
  const recovered = vi.fn()
  const roots = new MetadataRootWatchers(() => false, vi.fn(), recovered)
  roots.sync([root])
  first.fail()
  const second = nativeWatcher()
  roots.sync([root])
  expect(recovered).toHaveBeenCalledOnce()
  first.fail()
  await vi.advanceTimersByTimeAsync(60000)
  expect(watch).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
  roots.close()
  second.fail()
  expect(vi.getTimerCount()).toBe(0)
})
