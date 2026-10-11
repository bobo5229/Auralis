import type { MeshGradientRenderer } from '@applemusic-like-lyrics/core'

export interface FluidBackgroundFrame {
  canvas: HTMLCanvasElement
  artworkUrl: string | null
  settled: boolean
}

/** AMLL 0.5.1 has no public after-draw hook. Keep the checked adapter here.
 * Copying on a later RAF is unsafe: the compositor may already have cleared the
 * default WebGL framebuffer. A future incompatible AMLL keeps native flow usable.
 */
export function createFrameCapturingMeshRenderer(
  Renderer: typeof MeshGradientRenderer,
  onFrame: (canvas: HTMLCanvasElement, settled: boolean) => void,
  onUnsupported: () => void,
): typeof MeshGradientRenderer {
  return class extends Renderer {
    private restoreDraw: (() => void) | null = null

    constructor(canvas: HTMLCanvasElement) {
      super(canvas)
      const original: unknown = Reflect.get(this, 'onRedraw')
      if (typeof original !== 'function') {
        onUnsupported()
        return
      }
      const draw = original as (time: number, delta: number) => boolean
      const capture = (time: number, delta: number): boolean => {
        const settled = draw.call(this, time, delta)
        if (canvas.width > 1 && canvas.height > 1) onFrame(canvas, settled)
        return settled
      }
      if (!Reflect.set(this, 'onRedraw', capture)) onUnsupported()
      else
        this.restoreDraw = () => {
          Reflect.set(this, 'onRedraw', original)
        }
    }

    override dispose(): void {
      this.restoreDraw?.()
      this.restoreDraw = null
      super.dispose()
    }
  }
}
