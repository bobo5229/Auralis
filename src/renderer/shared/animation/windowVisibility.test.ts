import { describe, expect, it, vi } from 'vitest'
import { observeWindowVisibility } from './windowVisibility'

function setup() {
  let resolve!: (state: { isVisible: boolean }) => void
  let reject!: (error: Error) => void
  let event!: (state: { isVisible: boolean }) => void
  const unsubscribe = vi.fn()
  const update = vi.fn()
  const stop = observeWindowVisibility(update, {
    getVisibility: () =>
      new Promise((yes, no) => {
        resolve = yes
        reject = no
      }),
    onVisibilityChanged: (callback) => {
      event = callback
      return unsubscribe
    },
  })
  return {
    resolve,
    reject,
    event: (visible: boolean) => event({ isVisible: visible }),
    unsubscribe,
    update,
    stop,
  }
}

describe('window visibility subscription', () => {
  it('waits for initial state and stays suspended when mounted into a minimized window', async () => {
    const t = setup()
    expect(t.update).toHaveBeenLastCalledWith(false)
    t.resolve({ isVisible: false })
    await Promise.resolve()
    expect(t.update.mock.calls.every(([value]) => value === false)).toBe(true)
    t.event(true)
    expect(t.update).toHaveBeenLastCalledWith(true)
    t.stop()
  })
  it.each([true, false])(
    'does not let a stale snapshot override the newest event (%s)',
    async (visible) => {
      const t = setup()
      t.event(visible)
      t.resolve({ isVisible: !visible })
      await Promise.resolve()
      expect(t.update).toHaveBeenCalledTimes(2)
      expect(t.update).toHaveBeenLastCalledWith(visible)
      t.stop()
    },
  )
  it('ignores pending replies and events after disposal and unsubscribes', async () => {
    const t = setup()
    t.stop()
    t.resolve({ isVisible: true })
    t.event(true)
    await Promise.resolve()
    expect(t.update).toHaveBeenCalledTimes(1)
    expect(t.unsubscribe).toHaveBeenCalledOnce()
  })
  it('recovers from query failure while continuing to honor subsequent events', async () => {
    const t = setup()
    t.reject(new Error('unavailable'))
    await Promise.resolve()
    expect(t.update).toHaveBeenLastCalledWith(true)
    t.event(false)
    expect(t.update).toHaveBeenLastCalledWith(false)
    t.stop()
  })
})
