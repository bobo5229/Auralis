import { describe, expect, it, vi } from 'vitest'
import type { MeshGradientRenderer } from '@applemusic-like-lyrics/core'
import { createFrameCapturingMeshRenderer } from './fluidBackgroundFrameCapture'

describe('AMLL frame capture adapter', () => {
  it('captures synchronously after drawing and preserves static-mode readiness and disposal', () => {
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
    const Captured = createFrameCapturingMeshRenderer(
      Renderer as unknown as typeof MeshGradientRenderer,
      (_canvas, settled) => {
        expect(settled).toBe(true)
        sequence.push('capture')
      },
      unsupported,
    )
    const renderer = new Captured({ width: 400, height: 300 } as HTMLCanvasElement)
    const draw = Reflect.get(renderer, 'onRedraw') as () => boolean
    expect(draw()).toBe(true)
    expect(sequence).toEqual(['draw', 'capture'])
    expect(unsupported).not.toHaveBeenCalled()
    renderer.dispose()
    const restored = Reflect.get(renderer, 'onRedraw') as () => boolean
    restored.call(renderer)
    expect(sequence).toEqual(['draw', 'capture', 'dispose', 'draw'])
  })
  it('leaves native flow usable if the internal hook changes', () => {
    class Renderer {
      dispose = vi.fn()
    }
    const capture = vi.fn(),
      unsupported = vi.fn()
    const Captured = createFrameCapturingMeshRenderer(
      Renderer as unknown as typeof MeshGradientRenderer,
      capture,
      unsupported,
    )
    const renderer = new Captured({ width: 400, height: 300 } as HTMLCanvasElement)
    expect(unsupported).toHaveBeenCalledOnce()
    expect(capture).not.toHaveBeenCalled()
    renderer.dispose()
  })
})
