import { modeRgb, useMode } from 'culori'
import type {
  SeasonMeshLayout,
  SeasonMeshRequest,
  SeasonMeshResponse,
  SeasonMeshWash,
} from './seasonMeshProtocol'

const toRgb = useMode(modeRgb)

/** Keep DOM reads here; WebGL creation, shader compilation and drawing belong to the worker. */
export function createSeasonMesh(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  onReady: () => void,
  onError: (cause: unknown) => void,
) {
  if (typeof Worker === 'undefined' || !canvas.transferControlToOffscreen) {
    throw new Error('Season mesh offscreen rendering is unavailable')
  }
  const worker = new Worker(new URL('./seasonMesh.worker.ts', import.meta.url), { type: 'module' })
  let disposed = false
  let ready = false
  let playing = false

  function dispose() {
    if (disposed) return
    disposed = true
    worker.onmessage = null
    worker.onerror = null
    worker.onmessageerror = null
    // Termination also releases the worker-owned context, even during synchronous initialization.
    worker.terminate()
  }
  function fail(cause: unknown) {
    if (disposed) return
    dispose()
    onError(cause)
  }
  function send(message: SeasonMeshRequest) {
    if (disposed) return
    try {
      worker.postMessage(message)
    } catch (cause) {
      fail(cause)
    }
  }
  function readLayout(): SeasonMeshLayout {
    const width = Math.max(1, host.clientWidth)
    const height = Math.max(1, host.clientHeight)
    return {
      width,
      height,
      pixelRatio: Math.min(devicePixelRatio, 1.25, Math.sqrt(600_000 / (width * height))),
    }
  }
  function readAppearance(): SeasonMeshWash {
    const wash = toRgb(getComputedStyle(host).getPropertyValue('--season-wash').trim())
    return [wash?.r ?? 0, wash?.g ?? 0, wash?.b ?? 0, wash?.alpha ?? 0]
  }
  worker.onmessage = (event: MessageEvent<SeasonMeshResponse>) => {
    if (disposed) return
    if (event.data.type === 'ready') {
      ready = true
      onReady()
    } else fail(new Error(event.data.message))
  }
  worker.onerror = (event) => {
    event.preventDefault()
    fail(new Error(event.message || 'Season mesh worker stopped unexpectedly'))
  }
  worker.onmessageerror = () => fail(new Error('Season mesh worker response could not be read'))
  try {
    const offscreen = canvas.transferControlToOffscreen()
    const message: SeasonMeshRequest = {
      type: 'init',
      canvas: offscreen,
      layout: readLayout(),
      wash: readAppearance(),
    }
    worker.postMessage(message, [offscreen])
  } catch (cause) {
    dispose()
    throw cause
  }
  return {
    isReady: () => ready && !disposed,
    resize() {
      if (!disposed) send({ type: 'layout', layout: readLayout() })
    },
    refreshAppearance() {
      if (!disposed) send({ type: 'appearance', wash: readAppearance() })
    },
    setPlaying(value: boolean) {
      if (disposed || playing === value) return
      playing = value
      send({ type: 'playing', value })
    },
    dispose,
  }
}
