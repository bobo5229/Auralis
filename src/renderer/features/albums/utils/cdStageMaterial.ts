import { createCdDiscMaterial, type CdDiscMaterialState } from './cdDiscMaterial'
import type { CdStageNode } from './cdStageResources'

/** One lazily allocated coating per stage, parked without a frame loop while browsing. */
export function createCdStageMaterial() {
  let node: CdStageNode | undefined
  let canvas: HTMLCanvasElement | undefined
  let renderer: ReturnType<typeof createCdDiscMaterial> | undefined
  let state: CdDiscMaterialState | undefined
  let failed = false
  let disposed = false

  function setReady(ready: boolean): void {
    node?.disc.setAttribute('data-material-ready', String(ready))
    if (canvas) canvas.style.visibility = ready ? 'visible' : 'hidden'
  }
  function detach(): void {
    setReady(false)
    canvas?.remove()
    node = undefined
  }
  function paint(): void {
    if (disposed || failed || !node || !state || document.hidden) return
    try {
      if (!renderer) {
        canvas = document.createElement('canvas')
        canvas.className = 'cd-material-canvas'
        canvas.setAttribute('aria-hidden', 'true')
        renderer = createCdDiscMaterial(canvas, () => {
          setReady(false)
          paint()
        })
      }
      const attaching = canvas!.parentElement !== node.disc
      if (attaching) node.disc.append(canvas!)
      setReady(renderer.draw(state, attaching))
    } catch {
      // A failed allocation/compile is retried only with a fresh page instance.
      failed = true
      setReady(false)
      renderer?.dispose()
      renderer = undefined
      canvas?.remove()
      canvas = undefined
    }
  }
  return {
    sync(next: CdStageNode | undefined, appearance?: CdDiscMaterialState): void {
      if (disposed) return
      if (node !== next) {
        detach()
        node = next
      }
      state = appearance
      paint()
    },
    releaseNode(removed: CdStageNode): void {
      if (node === removed) detach()
    },
    dispose(): void {
      disposed = true
      detach()
      state = undefined
      renderer?.dispose()
      renderer = undefined
      canvas = undefined
    },
  }
}
