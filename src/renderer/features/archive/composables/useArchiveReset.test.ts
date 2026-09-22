import { effectScope, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useArchiveReset } from './useArchiveReset'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { error: vi.fn() },
}))

describe('useArchiveReset', () => {
  let scope: EffectScope

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('requires a full hold and waits for refresh before leaving the busy state', async () => {
    const reset = vi.fn(async () => {})
    let finishRefresh!: () => void
    const afterReset = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve
        }),
    )
    const state = scope.run(() => useArchiveReset(reset, afterReset))!
    state.openResetConfirmation()
    state.startResetHold()
    state.startResetHold()
    await vi.advanceTimersByTimeAsync(2999)
    expect(reset).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(reset).toHaveBeenCalledTimes(1)
    expect(afterReset).toHaveBeenCalledTimes(1)
    expect(state.showResetConfirmation.value).toBe(false)
    expect(state.isResetting.value).toBe(true)
    state.startResetHold()
    await vi.advanceTimersByTimeAsync(3000)
    expect(reset).toHaveBeenCalledTimes(1)
    finishRefresh()
    await vi.advanceTimersByTimeAsync(0)
    expect(state.isResetting.value).toBe(false)
  })

  it.each(['release', 'close', 'dispose'] as const)(
    'cancels the pending reset on %s',
    async (action) => {
      const reset = vi.fn(async () => {})
      const state = scope.run(() =>
        useArchiveReset(
          reset,
          vi.fn(async () => {}),
        ),
      )!
      state.openResetConfirmation()
      state.startResetHold()
      await vi.advanceTimersByTimeAsync(2000)
      if (action === 'release') state.cancelResetHold()
      else if (action === 'close') state.closeResetConfirmation()
      else scope.stop()
      await vi.advanceTimersByTimeAsync(3000)
      expect(reset).not.toHaveBeenCalled()
      expect(state.isHoldingReset.value).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('keeps the dialog available when reset fails and does not refresh', async () => {
    const reset = vi.fn().mockRejectedValue(new Error('reset failed'))
    const afterReset = vi.fn(async () => {})
    const state = scope.run(() => useArchiveReset(reset, afterReset))!
    state.openResetConfirmation()
    state.startResetHold()
    await vi.advanceTimersByTimeAsync(3000)
    expect(state.resetError.value).toBeTruthy()
    expect(state.showResetConfirmation.value).toBe(true)
    expect(state.isResetting.value).toBe(false)
    expect(afterReset).not.toHaveBeenCalled()
  })

  it('does not restart the timer on repeated keyboard events and cancels on keyup', async () => {
    const reset = vi.fn(async () => {})
    const state = scope.run(() =>
      useArchiveReset(
        reset,
        vi.fn(async () => {}),
      ),
    )!
    const event = { key: ' ', preventDefault: vi.fn() } as unknown as KeyboardEvent
    state.handleResetKeyDown(event)
    await vi.advanceTimersByTimeAsync(1000)
    state.handleResetKeyDown(event)
    expect(vi.getTimerCount()).toBe(1)
    state.handleResetKeyUp(event)
    await vi.advanceTimersByTimeAsync(3000)
    expect(reset).not.toHaveBeenCalled()
  })
})
