import { afterEach, expect, it, vi } from 'vitest'
import { createRendererShutdownBarrier } from './rendererShutdown'
import { createValidatedIpcRegistrar } from '@main/ipc/validatedIpcRegistrar'
import type { IpcMainInvokeEvent } from 'electron'
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
it('fails shutdown for unresponsive renderers and skips destroyed targets', async () => {
  vi.useFakeTimers()
  const warn = vi.fn(),
    send = vi.fn()
  const barrier = createRendererShutdownBarrier(warn)
  const pending = barrier.prepare([
    { id: 1, isDestroyed: () => false, send },
    { id: 2, isDestroyed: () => true, send },
  ])
  const failure = expect(pending).rejects.toThrow('Renderer did not finish shutdown')
  await vi.advanceTimersByTimeAsync(3000)
  await failure
  expect(send).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledTimes(1)
})
it('fails shutdown when a renderer reports an unsuccessful drain', async () => {
  const warn = vi.fn()
  const barrier = createRendererShutdownBarrier(warn)
  await expect(
    barrier.prepare([
      { id: 1, isDestroyed: () => false, send: () => barrier.acknowledge(1, false) },
    ]),
  ).rejects.toThrow('Renderer did not finish shutdown')
  expect(warn).toHaveBeenCalledTimes(1)
})

it('reuses a completed renderer drain when a later shutdown phase fails after IPC stops', async () => {
  const barrier = createRendererShutdownBarrier(vi.fn())
  let invoke!: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
  const registrar = createValidatedIpcRegistrar({
    register: (_channel, listener) => {
      invoke = listener
    },
    isTrustedSender: () => true,
  })
  registrar.handle('app:shutdown-ready', (event, payload) => {
    barrier.acknowledge(event.sender.id, payload.ok)
  })
  const event = { sender: { id: 1 } } as IpcMainInvokeEvent
  const target = {
    id: 1,
    isDestroyed: () => false,
    send: vi.fn(() => invoke(event, { ok: true })),
  }
  const dispose = vi
    .fn()
    .mockRejectedValueOnce(new Error('dispose failed'))
    .mockResolvedValue(undefined)
  const shutdown = async () => {
    await barrier.prepare([target])
    await registrar.shutdown()
    await dispose()
  }
  await expect(shutdown()).rejects.toThrow('dispose failed')
  expect(() => invoke(event, { ok: true })).toThrow('shutting down')
  await expect(shutdown()).resolves.toBeUndefined()
  expect(target.send).toHaveBeenCalledOnce()
  expect(dispose).toHaveBeenCalledTimes(2)
})

it('retries an unsuccessful renderer and still prepares a newly added target', async () => {
  const barrier = createRendererShutdownBarrier(vi.fn())
  let ok = false
  const first = { id: 1, isDestroyed: () => false, send: vi.fn(() => barrier.acknowledge(1, ok)) }
  await expect(barrier.prepare([first])).rejects.toThrow('Renderer did not finish shutdown')
  ok = true
  await barrier.prepare([first])
  const second = {
    id: 2,
    isDestroyed: () => false,
    send: vi.fn(() => barrier.acknowledge(2, true)),
  }
  await barrier.prepare([first, second])
  expect(first.send).toHaveBeenCalledTimes(2)
  expect(second.send).toHaveBeenCalledOnce()
})
