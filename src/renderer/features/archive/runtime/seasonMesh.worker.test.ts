import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SeasonMeshRequest } from './seasonMeshProtocol'

const runtime = vi.hoisted(() => ({
  snapshot: vi.fn(),
  dispose: vi.fn(),
  setPlaying: vi.fn(),
  resize: vi.fn(),
  setAppearance: vi.fn(),
}))
const createRenderer = vi.hoisted(() => vi.fn(() => runtime))
vi.mock('./seasonMeshRenderer', () => ({ createSeasonMeshRenderer: createRenderer }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
  vi.resetModules()
})

describe('season mesh worker snapshot', () => {
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
