import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import type { SeasonMeshRequest, SeasonMeshResponse } from './seasonMeshProtocol'

let attempted = false
let cancelPending: (() => void) | undefined
let prepared: { worker: Worker; canvas: HTMLCanvasElement; detach: () => void } | undefined

/** Keep one paused surface for at most 30 seconds so the first visit can adopt its context. */
export function scheduleSeasonMeshWarmup(): void {
  if (
    attempted ||
    cancelPending ||
    typeof window === 'undefined' ||
    typeof Worker === 'undefined' ||
    typeof OffscreenCanvas === 'undefined'
  )
    return
  const motion = createReducedMotionQuery()
  if (motion.matches || document.hidden) return

  let cancelled = false
  let worker: Worker | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  let cancelIdle: (() => void) | undefined
  function detach() {
    if (cancelled) return
    cancelled = true
    cancelIdle?.()
    clearTimeout(timeout)
    motion.removeEventListener('change', stopWhenInactive)
    document.removeEventListener('visibilitychange', stopWhenInactive)
    cancelPending = undefined
    prepared = undefined
  }
  function finish() {
    if (cancelled) return
    detach()
    worker?.terminate()
    worker = undefined
  }
  function stopWhenInactive() {
    if (motion.matches || document.hidden) finish()
  }
  async function start() {
    cancelIdle = undefined
    timeout = setTimeout(finish, 5000)
    const visibility = await window.auralis?.window.getVisibility()
    if (cancelled) return
    if (attempted || motion.matches || document.hidden || visibility?.isVisible === false) {
      finish()
      return
    }
    attempted = true
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const offscreen = canvas.transferControlToOffscreen()
    worker = new Worker(new URL('./seasonMesh.worker.ts', import.meta.url), { type: 'module' })
    prepared = { worker, canvas, detach }
    worker.onmessage = ({ data }: MessageEvent<SeasonMeshResponse>) => {
      if (cancelled) return
      if (data.type !== 'warmed') {
        finish()
        return
      }
      clearTimeout(timeout)
      timeout = setTimeout(finish, 30_000)
    }
    worker.onerror = (event) => {
      event.preventDefault()
      finish()
    }
    worker.onmessageerror = finish
    worker.postMessage({ type: 'warmup', canvas: offscreen } satisfies SeasonMeshRequest, [
      offscreen,
    ])
  }
  cancelPending = finish
  motion.addEventListener('change', stopWhenInactive)
  document.addEventListener('visibilitychange', stopWhenInactive)
  const run = () => void start().catch(finish)
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(run, { timeout: 1500 })
    cancelIdle = () => window.cancelIdleCallback(handle)
  } else {
    const handle = setTimeout(run, 16)
    cancelIdle = () => clearTimeout(handle)
  }
}

/** Transfer ownership, including pending initialization, without creating a competing worker. */
export function takeSeasonMeshWarmup(): { worker: Worker; canvas: HTMLCanvasElement } | undefined {
  attempted = true
  const result = prepared
  if (result) {
    result.detach()
    return { worker: result.worker, canvas: result.canvas }
  }
  cancelPending?.()
  return undefined
}
