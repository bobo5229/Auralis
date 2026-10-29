import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SeasonMeshRequest } from './seasonMeshProtocol'

const runtime = vi.hoisted(() => ({
  snapshot: vi.fn(),
  dispose: vi.fn(),
  setPlaying: vi.fn(),
  resize: vi.fn(),
  setAppearance: vi.fn(),
  renderFrame: vi.fn(),
}))
const createRenderer = vi.hoisted(() => vi.fn(() => runtime))
vi.mock('./seasonMeshRenderer', () => ({ createSeasonMeshRenderer: createRenderer }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
  vi.resetModules()
})

describe('season mesh worker snapshot', () => {
  it('prepares a paused renderer and adopts it without creating a second context', async () => {
    const scope = {
      postMessage: vi.fn(),
      close: vi.fn(),
      onmessage: undefined as ((event: MessageEvent<SeasonMeshRequest>) => void) | undefined,
    }
    vi.stubGlobal('self', scope)
    await import('./seasonMesh.worker')
    const finish = vi.fn()
    const canvas = { getContext: vi.fn(() => ({ finish })) } as unknown as OffscreenCanvas
    scope.onmessage!({ data: { type: 'warmup', canvas } } as MessageEvent<SeasonMeshRequest>)
    expect(createRenderer).toHaveBeenCalledWith(
      canvas,
      { width: 64, height: 64, pixelRatio: 1 },
      [0, 0, 0, 0],
      expect.any(Function),
    )
    expect(runtime.setPlaying).not.toHaveBeenCalled()
    expect(finish).toHaveBeenCalledOnce()
    expect(runtime.dispose).not.toHaveBeenCalled()
    expect(scope.postMessage).toHaveBeenCalledWith({ type: 'warmed' }, { transfer: [] })
    expect(scope.close).not.toHaveBeenCalled()
    const layout = { width: 900, height: 180, pixelRatio: 1.25 }
    const wash = [1, 1, 1, 0.04] as const
    scope.onmessage!({ data: { type: 'attach', layout, wash } } as MessageEvent<SeasonMeshRequest>)
    expect(createRenderer).toHaveBeenCalledOnce()
    expect(runtime.resize).toHaveBeenCalledWith(layout)
    expect(runtime.setAppearance).toHaveBeenCalledWith(wash)
    expect(runtime.renderFrame).toHaveBeenCalledOnce()
    expect(runtime.setPlaying).not.toHaveBeenCalled()
    expect(scope.postMessage).toHaveBeenLastCalledWith({ type: 'ready' }, { transfer: [] })
  })

  it('restores the phase and transfers the last frame before releasing the renderer and closing', async () => {
    const scope = {
      postMessage: vi.fn(),
      close: vi.fn(),
      onmessage: undefined as ((event: MessageEvent<SeasonMeshRequest>) => void) | undefined,
    }
    vi.stubGlobal('self', scope)
    await import('./seasonMesh.worker')
    const init: SeasonMeshRequest = {
      type: 'init',
      canvas: {} as OffscreenCanvas,
      layout: { width: 900, height: 180, pixelRatio: 1 },
      wash: [0, 0, 0, 0.12],
      elapsed: 12,
    }
    scope.onmessage!({ data: init } as MessageEvent<SeasonMeshRequest>)
    expect(createRenderer).toHaveBeenCalledWith(
      init.canvas,
      init.layout,
      init.wash,
      expect.any(Function),
      12,
    )
    const bitmap = {} as ImageBitmap
    runtime.snapshot.mockReturnValue({ bitmap, elapsed: 13 })
    scope.onmessage!({ data: { type: 'snapshot' } } as MessageEvent<SeasonMeshRequest>)
    expect(scope.postMessage).toHaveBeenLastCalledWith(
      { type: 'snapshot', bitmap, elapsed: 13 },
      { transfer: [bitmap] },
    )
    expect(runtime.dispose).toHaveBeenCalledOnce()
    expect(scope.close).toHaveBeenCalledOnce()
  })
})
