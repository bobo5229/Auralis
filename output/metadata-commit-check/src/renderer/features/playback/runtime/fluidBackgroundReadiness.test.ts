import { describe, expect, it, vi } from 'vitest'
import type { MeshGradientRenderer } from '@applemusic-like-lyrics/core'
import { createReadinessTrackingMeshRenderer } from './fluidBackgroundReadiness'

describe('AMLL cover readiness adapter', () => {
  it('reports readiness after drawing and preserves static-mode readiness and disposal', () => {
    const sequence: string[] = []
    class Renderer {
      onRedraw() {
        sequence.push('draw')
        return true
      }
      dispose() {
        sequence.push('dispose')
      }
    }
    const unsupported = vi.fn()
    const Tracked = createReadinessTrackingMeshRenderer(
      Renderer as unknown as typeof MeshGradientRenderer,
      (_canvas, settled) => {
        expect(settled).toBe(true)
        sequence.push('ready')
      },
      unsupported,
    )
    const renderer = new Tracked({
      width: 400,
      height: 300,
      getContext: () => ({}),
    } as unknown as HTMLCanvasElement)
    const draw = Reflect.get(renderer, 'onRedraw') as () => boolean
    expect(draw()).toBe(true)
    expect(sequence).toEqual(['draw', 'ready'])
    expect(unsupported).not.toHaveBeenCalled()
    renderer.dispose()
    const restored = Reflect.get(renderer, 'onRedraw') as () => boolean
    restored.call(renderer)
    expect(sequence).toEqual(['draw', 'ready', 'dispose', 'draw'])
  })
  it('leaves native flow usable if the internal hook changes', () => {
    class Renderer {
      dispose = vi.fn()
    }
    const ready = vi.fn(),
      unsupported = vi.fn()
    const Tracked = createReadinessTrackingMeshRenderer(
      Renderer as unknown as typeof MeshGradientRenderer,
      ready,
      unsupported,
    )
    const renderer = new Tracked({
      width: 400,
      height: 300,
      getContext: () => ({}),
    } as unknown as HTMLCanvasElement)
    expect(unsupported).toHaveBeenCalledOnce()
    expect(ready).not.toHaveBeenCalled()
    renderer.dispose()
  })

  it('rejects unavailable WebGL before the library can install observers', () => {
    const construct = vi.fn()
    class Renderer {
      constructor() {
        construct()
      }
    }
    const Tracked = createReadinessTrackingMeshRenderer(
      Renderer as unknown as typeof MeshGradientRenderer,
      vi.fn(),
      vi.fn(),
    )
    const getContext = vi.fn(() => null)
    expect(() => new Tracked({ getContext } as unknown as HTMLCanvasElement)).toThrow(
      'WebGL is unavailable',
    )
    expect(getContext).toHaveBeenCalledWith('webgl', { antialias: true })
    expect(construct).not.toHaveBeenCalled()
  })
})
