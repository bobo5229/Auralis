import { modeRgb, useMode } from 'culori'
import { seasonMeshSession } from './seasonMeshSession'
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
  session = seasonMeshSession,
) {
  if (typeof Worker === 'undefined' || !canvas.transferControlToOffscreen) {
    throw new Error('Season mesh offscreen rendering is unavailable')
  }
  const worker = new Worker(new URL('./seasonMesh.worker.ts', import.meta.url), { type: 'module' })
  const owner = session.begin()
  let disposed = false
  let ready = false
  let playing = false
  let appearance = ''
  let capturing = false
  let released = false
  let captureTimeout: ReturnType<typeof setTimeout> | undefined
  let finishCapture: (() => void) | undefined

  function release() {
    if (released) return
    released = true
    capturing = false
    clearTimeout(captureTimeout)
    worker.onmessage = null
    worker.onerror = null
    worker.onmessageerror = null
    worker.terminate()
    finishCapture?.()
    finishCapture = undefined
  }
  function dispose() {
    if (disposed) return
    disposed = true
    if (!ready) {
      release()
      return
    }
    // Stop and capture once in the worker, then release it even if no response arrives.
    capturing = true
    finishCapture = session.beginCapture(owner)
    captureTimeout = setTimeout(release, 250)
    try {
      worker.postMessage({ type: 'snapshot' } satisfies SeasonMeshRequest)
    } catch {
      release()
    }
  }
  function fail(cause: unknown) {
    if (disposed) {
      release()
      return
    }
    disposed = true
    release()
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
    appearance = getComputedStyle(host).getPropertyValue('--season-wash').trim()
    const wash = toRgb(appearance)
    return [wash?.r ?? 0, wash?.g ?? 0, wash?.b ?? 0, wash?.alpha ?? 0]
  }
  worker.onmessage = (event: MessageEvent<SeasonMeshResponse>) => {
    if (event.data.type === 'snapshot') {
      if (capturing)
        session.save(owner, {
          bitmap: event.data.bitmap,
          elapsed: event.data.elapsed,
          appearance,
        })
      else event.data.bitmap.close()
      if (capturing) release()
      return
    }
    if (disposed && event.data.type === 'error') {
      release()
      return
    }
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
      elapsed: session.read()?.elapsed ?? 0,
    }
    worker.postMessage(message, [offscreen])
  } catch (cause) {
    disposed = true
    release()
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
