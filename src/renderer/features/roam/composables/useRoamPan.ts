import { shallowRef } from 'vue'

/** Soft exponential friction per millisecond — map-like long coast. */
const FRICTION_PER_MS = 0.0035

/** Stop inertia when speed (px/ms) falls below this. */
const STOP_SPEED = 0.02

/** Sample window for release velocity (ms). */
const VELOCITY_SAMPLE_MS = 100

/** Cap frame dt so tab-background spikes do not teleport the camera. */
const MAX_DT_MS = 64

interface PointerSample {
  t: number
  x: number
  y: number
}

/**
 * Map-like pan + inertia for the infinite roam wall.
 *
 * `cameraX` / `cameraY` are the world-space coordinates of the viewport top-left.
 * Dragging grabs the wall (camera moves opposite the pointer). Wheel is ignored.
 */
export function useRoamPan() {
  const cameraX = shallowRef(0)
  const cameraY = shallowRef(0)

  let dragging = false
  let activePointerId: number | null = null
  let lastClientX = 0
  let lastClientY = 0
  let samples: PointerSample[] = []

  let velocityX = 0
  let velocityY = 0
  let rafId = 0
  let lastFrameTime = 0
  let panTarget: HTMLElement | null = null

  function cancelInertia(): void {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    velocityX = 0
    velocityY = 0
  }

  function setCamera(x: number, y: number): void {
    cameraX.value = x
    cameraY.value = y
  }

  /** Place world origin at the viewport center. */
  function centerOnOrigin(viewportW: number, viewportH: number): void {
    setCamera(-viewportW / 2, -viewportH / 2)
  }

  function pruneSamples(now: number): void {
    const cutoff = now - VELOCITY_SAMPLE_MS
    while (samples.length > 2 && samples[0]!.t < cutoff) {
      samples.shift()
    }
  }

  function startInertia(): void {
    if (samples.length >= 2) {
      const first = samples[0]!
      const last = samples[samples.length - 1]!
      const dt = last.t - first.t
      if (dt > 0) {
        // Pointer moved (last - first); camera tracks opposite → wall grab.
        velocityX = -(last.x - first.x) / dt
        velocityY = -(last.y - first.y) / dt
      }
    }
    samples = []

    if (Math.hypot(velocityX, velocityY) < STOP_SPEED) {
      velocityX = 0
      velocityY = 0
      return
    }

    lastFrameTime = performance.now()
    rafId = requestAnimationFrame(stepInertia)
  }

  function stepInertia(now: number): void {
    const rawDt = now - lastFrameTime
    lastFrameTime = now
    const dt = Math.min(Math.max(rawDt, 0), MAX_DT_MS)

    cameraX.value += velocityX * dt
    cameraY.value += velocityY * dt

    // v *= e^(-k·dt) ≈ map-style soft decay (or ~0.95/frame at 60fps with tuned k)
    const decay = Math.exp(-FRICTION_PER_MS * dt)
    velocityX *= decay
    velocityY *= decay

    if (Math.hypot(velocityX, velocityY) < STOP_SPEED) {
      velocityX = 0
      velocityY = 0
      rafId = 0
      return
    }

    rafId = requestAnimationFrame(stepInertia)
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return

    cancelInertia()

    const el = event.currentTarget as HTMLElement | null
    if (el) {
      el.setPointerCapture(event.pointerId)
    }

    dragging = true
    activePointerId = event.pointerId
    lastClientX = event.clientX
    lastClientY = event.clientY
    const now = performance.now()
    samples = [{ t: now, x: event.clientX, y: event.clientY }]
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging || event.pointerId !== activePointerId) return

    const dx = event.clientX - lastClientX
    const dy = event.clientY - lastClientY
    // Grab the wall: content follows the pointer.
    cameraX.value -= dx
    cameraY.value -= dy
    lastClientX = event.clientX
    lastClientY = event.clientY

    const now = performance.now()
    samples.push({ t: now, x: event.clientX, y: event.clientY })
    pruneSamples(now)
  }

  function endPointer(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) return

    dragging = false
    activePointerId = null

    const el = event.currentTarget as HTMLElement | null
    if (el?.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId)
    }

    startInertia()
  }

  function onPointerUp(event: PointerEvent): void {
    endPointer(event)
  }

  function onPointerCancel(event: PointerEvent): void {
    endPointer(event)
  }

  function attachPanTarget(el: HTMLElement): () => void {
    panTarget = el
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerCancel)

    return () => {
      if (panTarget === el) {
        el.removeEventListener('pointerdown', onPointerDown)
        el.removeEventListener('pointermove', onPointerMove)
        el.removeEventListener('pointerup', onPointerUp)
        el.removeEventListener('pointercancel', onPointerCancel)
        panTarget = null
      }
    }
  }

  function dispose(): void {
    cancelInertia()
    dragging = false
    activePointerId = null
    samples = []
    if (panTarget) {
      panTarget.removeEventListener('pointerdown', onPointerDown)
      panTarget.removeEventListener('pointermove', onPointerMove)
      panTarget.removeEventListener('pointerup', onPointerUp)
      panTarget.removeEventListener('pointercancel', onPointerCancel)
      panTarget = null
    }
  }

  return {
    cameraX,
    cameraY,
    setCamera,
    centerOnOrigin,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    attachPanTarget,
    dispose,
  }
}
