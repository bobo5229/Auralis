import { describe, expect, it, vi } from 'vitest'
import { createSeasonMeshSession } from './seasonMeshSession'

function snapshot(elapsed: number) {
  return {
    bitmap: { close: vi.fn() } as unknown as ImageBitmap,
    elapsed,
    appearance: 'rgb(18 18 18 / 12%)',
  }
}

describe('season mesh frame cache', () => {
  it('retains only the latest frame and releases the previous bitmap', () => {
    const session = createSeasonMeshSession()
    const owner = session.begin()
    const first = snapshot(1)
    const last = snapshot(2)
    session.save(owner, first)
    session.save(owner, last)
    expect(session.read()).toBe(last)
    expect(first.bitmap.close).toHaveBeenCalledOnce()
    expect(last.bitmap.close).not.toHaveBeenCalled()
  })

  it('cannot overwrite a newer visit with a delayed frame from an old worker', () => {
    const session = createSeasonMeshSession()
    const previousOwner = session.begin()
    const currentOwner = session.begin()
    const current = snapshot(4)
    const stale = snapshot(3)
    session.save(currentOwner, current)
    session.save(previousOwner, stale)
    expect(session.read()).toBe(current)
    expect(stale.bitmap.close).toHaveBeenCalledOnce()
    expect(current.bitmap.close).not.toHaveBeenCalled()
  })

  it('lets the next mount await the final frame without retaining an unresolved capture', async () => {
    const session = createSeasonMeshSession()
    const owner = session.begin()
    const finish = session.beginCapture(owner)
    let restored = false
    const restoredFrame = session.whenCaptured().then(() => {
      restored = true
      return session.read()
    })
    await Promise.resolve()
    expect(restored).toBe(false)
    const last = snapshot(8)
    session.save(owner, last)
    finish()
    expect(await restoredFrame).toBe(last)
    await session.whenCaptured()
  })

  it('does not clear a newer capture when an old request finishes late', async () => {
    const session = createSeasonMeshSession()
    const oldFinish = session.beginCapture(session.begin())
    const finish = session.beginCapture(session.begin())
    let restored = false
    const restoredFrame = session.whenCaptured().then(() => {
      restored = true
    })
    oldFinish()
    await Promise.resolve()
    expect(restored).toBe(false)
    finish()
    await restoredFrame
    expect(restored).toBe(true)
  })
})
