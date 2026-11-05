import { createCdDiscMaterial, type CdDiscMaterialState } from './cdDiscMaterial'
import type { CdStageNode } from './cdStageResources'

/** One idle-prepared coating per stage, parked without a frame loop while browsing. */
export function createCdStageMaterial() {
  let node: CdStageNode | undefined
  let canvas: HTMLCanvasElement | undefined
  let renderer: ReturnType<typeof createCdDiscMaterial> | undefined
  let state: CdDiscMaterialState | undefined
  let failed = false
  let disposed = false
  let preparation: CdDiscMaterialState | undefined
  let cancelIdle: (() => void) | undefined

  function cancelPreparation(): void {
    cancelIdle?.()
    cancelIdle = undefined
    preparation = undefined
  }

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
      // A first-click animation can outrun idle preparation. Keep its existing CSS
      // coating until the stage settles; never compile shaders in a motion frame.
      if (!renderer) return setReady(false)
      const attaching = canvas!.parentElement !== node.disc
      if (attaching) node.disc.append(canvas!)
      setReady(renderer.draw(state, attaching))
    } catch {
      fail()
    }
  }
  function fail(): void {
    // A failed allocation/compile is retried only with a fresh page instance.
    failed = true
    cancelPreparation()
    setReady(false)
    renderer?.dispose()
    renderer = undefined
    canvas?.remove()
    canvas = undefined
  }
  function prepare(appearance: CdDiscMaterialState): void {
    if (disposed || failed || renderer || document.hidden) return
    preparation = appearance
    if (cancelIdle) return
    const initialize = (): void => {
      cancelIdle = undefined
      const next = preparation
      preparation = undefined
      if (disposed || failed || document.hidden || !next) return
      try {
        canvas = document.createElement('canvas')
        canvas.className = 'cd-material-canvas'
        canvas.setAttribute('aria-hidden', 'true')
        renderer = createCdDiscMaterial(canvas, () => {
          setReady(false)
          paint()
        })
        // Warm both compilation and the first submission while detached.
        renderer.draw(next, true)
        paint()
      } catch {
        fail()
      }
    }
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(initialize)
      cancelIdle = () => cancelIdleCallback(id)
    } else {
      const id = setTimeout(initialize, 0)
      cancelIdle = () => clearTimeout(id)
    }
  }
  return {
    prepare,
    cancelPreparation,
    sync(next: CdStageNode | undefined, appearance?: CdDiscMaterialState): void {
      if (disposed) return
      if (node !== next) {
        detach()
        node = next
        setReady(false)
      }
      state = appearance
      paint()
    },
    releaseNode(removed: CdStageNode): void {
      if (node === removed) detach()
    },
    dispose(): void {
      disposed = true
      cancelPreparation()
      detach()
      state = undefined
      renderer?.dispose()
      renderer = undefined
      canvas = undefined
    },
  }
}
