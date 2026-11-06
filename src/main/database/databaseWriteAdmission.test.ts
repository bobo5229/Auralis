import { describe, expect, it, vi } from 'vitest'
import { DatabaseWriteAdmission, DatabaseWriteAdmissionError } from './databaseWriteAdmission'

describe('database write admission', () => {
  it('holds writes behind an exclusive owner and resumes them in order', async () => {
    const gate = new DatabaseWriteAdmission()
    const lease = await gate.acquireExclusive()
    const calls: number[] = []
    const first = gate.runWrite(() => calls.push(1))
    const second = gate.runWrite(() => calls.push(2))
    expect(calls).toEqual([])
    lease.release()
    lease.release()
    await Promise.all([first, second])
    expect(calls).toEqual([1, 2])
  })

  it('rejects excess and expired work without executing it', async () => {
    vi.useFakeTimers()
    try {
      const gate = new DatabaseWriteAdmission(1, 30_000)
      const lease = await gate.acquireExclusive()
      const operation = vi.fn()
      const waiting = gate.runWrite(operation)
      const timeout = expect(waiting).rejects.toMatchObject({ reason: 'timeout' })
      await expect(gate.runWrite(operation)).rejects.toMatchObject({ reason: 'full' })
      await vi.advanceTimersByTimeAsync(30_000)
      await timeout
      lease.release()
      expect(operation).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects reentrant writes and drains after release', async () => {
    const gate = new DatabaseWriteAdmission()
    let nested: Promise<unknown> | undefined
    await gate.runWrite(() => {
      nested = gate.runWrite(() => 1)
    })
    await expect(nested).rejects.toBeInstanceOf(DatabaseWriteAdmissionError)
    const lease = await gate.acquireExclusive()
    const pending = gate.runWrite(() => 1)
    gate.stopAccepting()
    await expect(gate.runWrite(() => 2)).rejects.toMatchObject({ reason: 'closed' })
    const drained = gate.drain()
    lease.release()
    await expect(pending).resolves.toBe(1)
    await drained
  })

  it('notifies once after the exclusive and queued writes have drained', async () => {
    const gate = new DatabaseWriteAdmission()
    const lease = await gate.acquireExclusive()
    const order: string[] = []
    const pending = gate.runWrite(() => order.push('write'))
    gate.onAvailable(() => order.push('available'))
    expect(order).toEqual([])
    lease.release()
    await pending
    await Promise.resolve()
    expect(order).toEqual(['write', 'available'])
    await gate.runWrite(() => order.push('later'))
    await Promise.resolve()
    expect(order).toEqual(['write', 'available', 'later'])
  })
})
