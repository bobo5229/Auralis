import { effectScope } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { getDefaultMiniPlayerBodySize } from '@shared/constants/miniPlayer'
import type { MiniPlayerWindowState } from '@shared/ipc/contracts'
import { useMiniPlayerWindowSync } from './useMiniPlayerWindowSync'

vi.mock('@renderer/shared/ipc/client', () => ({ auralis: { window: {} } }))

function windowState(overrides: Partial<MiniPlayerWindowState> = {}): MiniPlayerWindowState {
  return {
    mode: 'mini',
    body: { coverSize: 240, width: 296, height: 504 },
    popover: { open: false, direction: 'below', height: 0 },
    suggestedPopoverDirection: 'below',
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function setup(initialState = Promise.resolve(windowState())) {
  let stateChanged: ((state: MiniPlayerWindowState) => void) | null = null
  const unsubscribe = vi.fn()
  const api = {
    getMiniPlayerState: vi.fn(() => initialState),
    onMiniPlayerStateChanged: vi.fn((callback: (state: MiniPlayerWindowState) => void) => {
      stateChanged = callback
      return unsubscribe
    }),
    restoreFromMiniPlayer: vi.fn(() => Promise.resolve(windowState({ mode: 'normal' }))),
    setMiniPlayerPopover: vi.fn(() => Promise.resolve(windowState())),
  }
  const scope = effectScope()
  const sync = scope.run(() => useMiniPlayerWindowSync(api))!

  return {
    api,
    emitState: (state: MiniPlayerWindowState) => stateChanged?.(state),
    scope,
    sync,
    unsubscribe,
  }
}

describe('useMiniPlayerWindowSync', () => {
  it('loads initial geometry and applies later typed window-state events', async () => {
    const { emitState, sync } = setup()
    sync.start()
    await Promise.resolve()

    expect(sync.bodySize.value).toEqual({ coverSize: 240, width: 296, height: 504 })

    emitState(
      windowState({
        body: { coverSize: 260, width: 316, height: 524 },
        popover: { open: true, direction: 'above', height: 230 },
      }),
    )
    expect(sync.bodySize.value).toEqual({ coverSize: 260, width: 316, height: 524 })
    expect(sync.popoverDirection.value).toBe('above')
    expect(sync.popoverRegionHeight.value).toBe(230)
  })

  it('keeps the last valid body size while still synchronizing popover state', async () => {
    const { emitState, sync } = setup()
    sync.start()
    await Promise.resolve()
    const validBody = { ...sync.bodySize.value }

    emitState(
      windowState({
        body: { coverSize: 0, width: 0, height: 0 },
        popover: { open: true, direction: 'above', height: 180 },
      }),
    )

    expect(sync.bodySize.value).toEqual(validBody)
    expect(sync.popoverDirection.value).toBe('above')
    expect(sync.popoverRegionHeight.value).toBe(180)
  })

  it('uses the synchronized direction for popover resize and applies the response', async () => {
    const { api, emitState, sync } = setup()
    sync.start()
    await Promise.resolve()
    emitState(windowState({ popover: { open: false, direction: 'above', height: 0 } }))
    api.setMiniPlayerPopover.mockResolvedValueOnce(
      windowState({ popover: { open: true, direction: 'below', height: 210 } }),
    )

    await sync.setPopover(true, 230)

    expect(api.setMiniPlayerPopover).toHaveBeenCalledWith({
      open: true,
      direction: 'above',
      height: 230,
    })
    expect(sync.popoverDirection.value).toBe('below')
    expect(sync.popoverRegionHeight.value).toBe(210)
  })

  it('unsubscribes once and ignores initialization that resolves after stop', async () => {
    const pending = deferred<MiniPlayerWindowState>()
    const { scope, sync, unsubscribe } = setup(pending.promise)
    sync.start()
    sync.start()
    sync.stop()
    sync.stop()
    pending.resolve(windowState({ body: { coverSize: 260, width: 316, height: 524 } }))
    await Promise.resolve()

    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(sync.bodySize.value).toEqual(getDefaultMiniPlayerBodySize())

    sync.start()
    expect(unsubscribe).toHaveBeenCalledOnce()
    scope.stop()
    expect(unsubscribe).toHaveBeenCalledTimes(2)
  })
})
