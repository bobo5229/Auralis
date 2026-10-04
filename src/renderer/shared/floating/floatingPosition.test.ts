import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computePosition,
  autoUpdate,
  type ComputePositionConfig,
  type ComputePositionReturn,
} from '@floating-ui/dom'
import { pointReference, startFloatingPosition } from './floatingPosition'

vi.mock('@floating-ui/dom', async (original) => ({
  ...(await original<typeof import('@floating-ui/dom')>()),
  computePosition: vi.fn(),
  autoUpdate: vi.fn(),
}))
vi.mock('../diagnostics/rendererDiagnostics', () => ({ rendererDiagnostics: { warn: vi.fn() } }))

describe('open floating positioning sessions', () => {
  let pending: {
    resolve: (result: ComputePositionReturn) => void
    reject: (cause: unknown) => void
    config: ComputePositionConfig
  }[]
  let cleanup: ReturnType<typeof vi.fn>
  let notify: () => void
  let floating: HTMLElement
  const result = (x: number): ComputePositionReturn => ({
    x,
    y: 24,
    placement: 'bottom-start',
    strategy: 'fixed',
    middlewareData: {},
  })
  const begin = (profile: 'point-menu' | 'tooltip' = 'point-menu') => {
    const onPosition = vi.fn()
    const onError = vi.fn()
    const session = startFloatingPosition({
      reference: pointReference(20, 30),
      floating,
      profile,
      onPosition,
      onError,
    })
    return { ...session, onPosition, onError }
  }
  beforeEach(() => {
    pending = []
    cleanup = vi.fn()
    floating = { style: {}, isConnected: true } as unknown as HTMLElement
    vi.mocked(autoUpdate).mockImplementation((_reference, _floating, update) => {
      notify = update
      update()
      return cleanup
    })
    vi.mocked(computePosition).mockImplementation(
      (_reference, _floating, config) =>
        new Promise((resolve, reject) => pending.push({ resolve, reject, config: config! })),
    )
  })
  afterEach(() => vi.clearAllMocks())

  it('uses an unshifted zero-size client-coordinate anchor', () => {
    expect(pointReference(799, 599).getBoundingClientRect()).toEqual({
      x: 799,
      y: 599,
      left: 799,
      right: 799,
      top: 599,
      bottom: 599,
      width: 0,
      height: 0,
    })
  })
  it('stays measurable but invisible until the first successful placement', async () => {
    const session = begin()
    expect(floating.style.visibility).toBe('hidden')
    pending[0].resolve(result(12))
    await Promise.resolve()
    expect(floating.style.left).toBe('12px')
    expect(floating.style.visibility).toBe('visible')
    expect(session.onPosition).toHaveBeenCalledWith(result(12), true)
    notify()
    pending[1].resolve(result(13))
    await Promise.resolve()
    expect(session.onPosition).toHaveBeenLastCalledWith(result(13), false)
    session.dispose()
  })
  it('ignores out-of-order results and their size callbacks', async () => {
    const session = begin()
    notify()
    pending[1].resolve(result(50))
    await Promise.resolve()
    const staleSize = pending[0].config.middleware?.find((m) => m && m.name === 'size')
    if (!staleSize || typeof staleSize.options.apply !== 'function')
      throw new Error('missing size callback')
    staleSize.options.apply({ availableWidth: 2, availableHeight: 3 })
    pending[0].resolve(result(5))
    await Promise.resolve()
    expect(floating.style.left).toBe('50px')
    expect(floating.style.maxHeight).toBe('')
    expect(session.onPosition).toHaveBeenCalledTimes(1)
    session.dispose()
  })
  it('cleans up once and ignores a result after closing', async () => {
    const session = begin()
    session.dispose()
    session.dispose()
    pending[0].resolve(result(90))
    await Promise.resolve()
    notify()
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(pending).toHaveLength(1)
    expect(session.onPosition).not.toHaveBeenCalled()
    expect(floating.style.visibility).toBe('hidden')
  })
  it('cannot overwrite a quickly reopened overlay', async () => {
    const old = begin()
    old.dispose()
    const reopened = begin()
    pending[1].resolve(result(80))
    await Promise.resolve()
    pending[0].resolve(result(8))
    await Promise.resolve()
    expect(floating.style.left).toBe('80px')
    expect(old.onPosition).not.toHaveBeenCalled()
    reopened.dispose()
  })
  it('recomputes after content changes through the active observer', async () => {
    const session = begin()
    pending[0].resolve(result(10))
    await Promise.resolve()
    notify()
    pending[1].resolve(result(30))
    await Promise.resolve()
    expect(floating.style.left).toBe('30px')
    session.dispose()
  })
  it('disables redundant tooltip ancestor listeners and frame polling', () => {
    const session = begin('tooltip')
    expect(vi.mocked(autoUpdate).mock.calls.at(-1)?.[3]).toEqual({
      ancestorScroll: false,
      ancestorResize: false,
      animationFrame: false,
    })
    session.dispose()
  })
  it('closes on an active calculation failure and stops watching', async () => {
    const session = begin()
    pending[0].reject(new Error('layout failed'))
    await Promise.resolve()
    expect(session.onError).toHaveBeenCalledOnce()
    expect(cleanup).toHaveBeenCalledOnce()
    expect(floating.style.visibility).toBe('hidden')
  })
  it('ignores stale failures and detached elements', async () => {
    const session = begin()
    notify()
    pending[0].reject(new Error('old failure'))
    Object.defineProperty(floating, 'isConnected', { value: false })
    pending[1].resolve(result(60))
    await Promise.resolve()
    expect(session.onError).not.toHaveBeenCalled()
    expect(session.onPosition).not.toHaveBeenCalled()
    session.dispose()
  })
})
