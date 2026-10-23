import type { MeshGradientRenderer } from '@applemusic-like-lyrics/core'

/** AMLL 0.5.1 has no public readiness hook. Observe completed draws so a
 * parked surface can finish loading its cover and stop without continuous flow.
 * If the internal hook changes, keep native flow usable with commit readiness.
 */
export function createReadinessTrackingMeshRenderer(
  Renderer: typeof MeshGradientRenderer,
  onDraw: (canvas: HTMLCanvasElement, settled: boolean) => void,
  onUnsupported: () => void,
): typeof MeshGradientRenderer {
  return class extends Renderer {
    private restoreDraw: (() => void) | null = null

    constructor(canvas: HTMLCanvasElement) {
      // AMLL installs its ResizeObserver before checking WebGL. Reject unavailable
      // contexts first so a failed constructor cannot leave that observer behind.
      if (!canvas.getContext('webgl', { antialias: true })) {
        throw new Error('WebGL is unavailable for the flow background')
      }
      super(canvas)
      const original: unknown = Reflect.get(this, 'onRedraw')
      if (typeof original !== 'function') {
        onUnsupported()
        return
      }
      const draw = original as (time: number, delta: number) => boolean
      const trackReadiness = (time: number, delta: number): boolean => {
        const settled = draw.call(this, time, delta)
        if (canvas.width > 1 && canvas.height > 1) onDraw(canvas, settled)
        return settled
      }
      if (!Reflect.set(this, 'onRedraw', trackReadiness)) onUnsupported()
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
