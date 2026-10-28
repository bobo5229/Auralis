import { describe, expect, it, vi } from 'vitest'
import { createAppShutdownHandler } from './appShutdown'

describe('application shutdown', () => {
  it('drains once before closing resources and allows the final quit event', async () => {
    let finish!: () => void
    const work = new Promise<void>((resolve) => {
      finish = resolve
    })
    const order: string[] = []
    const shutdownServices = vi.fn(() => work)
    const handler = createAppShutdownHandler({
      shutdownServices,
      closeResources: () => {
        order.push('close')
      },
      quit: () => {
        order.push('quit')
      },
      reportError: vi.fn(),
    })
    const event = { preventDefault: vi.fn() }
    handler(event)
    handler(event)
    await Promise.resolve()
    expect(shutdownServices).toHaveBeenCalledOnce()
    expect(order).toEqual([])
    expect(event.preventDefault).toHaveBeenCalledTimes(2)
    finish()
    await vi.waitFor(() => expect(order).toEqual(['close', 'quit']))
    handler(event)
    expect(event.preventDefault).toHaveBeenCalledTimes(2)
  })

  it('keeps resources open on shutdown failure and retries on another quit request', async () => {
    const failure = new Error('Worker could not stop')
    const shutdownServices = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined)
    const closeResources = vi.fn()
    const quit = vi.fn()
    const reportError = vi.fn()
    const handler = createAppShutdownHandler({
      shutdownServices,
      closeResources,
      quit,
      reportError,
    })
    const event = { preventDefault: vi.fn() }
    handler(event)
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(failure))
    expect(closeResources).not.toHaveBeenCalled()
    expect(quit).not.toHaveBeenCalled()
    handler(event)
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce())
    expect(closeResources).toHaveBeenCalledOnce()
  })
})
