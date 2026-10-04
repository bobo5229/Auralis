import { uiText } from '@renderer/i18n'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { createArchiveStarfield } from './archiveStarfield'
import { archiveSceneSession } from './archiveSceneSession'

export interface MacDeviceOptions {
  onTransition?: () => void
  onReturnToIntro?: () => void
  onSceneReadyChange?: (ready: boolean) => void
  onPopupEscape?: () => boolean
}
export interface MacDeviceController {
  setVisible(visible: boolean): void
  enter(): void
  returnToIntro(): void
  refreshLocale(): void
  dispose(): void
}

const DURATION = 1.4
const ACCELERATION = 0.25
const BRAKING = 0.4
const CRUISE = 8
const READY_YAW = 23
const STAR_FRAME_MS = 1000 / 60
const smooth = (p: number) => {
  const t = Math.max(0, Math.min(1, p))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, p: number) => a + (b - a) * p

// Integrate the speed curve exactly so distance is independent of refresh rate.
function travelDistance(age: number) {
  const integral = (p: number) => p ** 3 - p ** 4 / 2
  if (age < ACCELERATION) return CRUISE * ACCELERATION * integral(age / ACCELERATION)
  const brakeAt = DURATION - BRAKING
  if (age <= brakeAt) return CRUISE * (ACCELERATION / 2 + age - ACCELERATION)
  const t = Math.min(BRAKING, age - brakeAt)
  return CRUISE * (ACCELERATION / 2 + brakeAt - ACCELERATION + t - BRAKING * integral(t / BRAKING))
}

export function mountMacDevice(
  root: ShadowRoot,
  options: MacDeviceOptions = {},
): MacDeviceController {
  const shell = root.getElementById('archive-mac-shell')!
  const rig = root.getElementById('rig')!
  const glass = root.querySelector<HTMLElement>('.crt-glass')!
  const plane = root.getElementById('crt-logic-plane')!
  const projection = root.getElementById('hologram')!
  const scene = root.querySelector<HTMLElement>('.archive-mac-main')!
  const glow = root.querySelector<HTMLElement>('.archive-galaxy-glow')!
  const canvas = root.getElementById('archive-stars') as HTMLCanvasElement
  const sky = createArchiveStarfield(canvas)
  const listeners = new AbortController()
  const signal = listeners.signal
  const motion = createReducedMotionQuery()
  let state: 'intro' | 'travel' | 'ready' = archiveSceneSession.entered ? 'ready' : 'intro'
  let age = 0
  let yaw = READY_YAW
  let pitch = -8
  let initialYaw = yaw
  let targetYaw = yaw
  let width = 1
  let height = 1
  let raf = 0
  let previous: number | null = null
  let starFrameAt: number | null = null
  let starElapsed = 0
  let starDistance = 0
  let initialScale = 1
  let finalScale = 1
  let finalX = 0
  let finalY = 0
  let disposed = false
  let windowVisible = true
  const isVisible = () => windowVisible && !document.hidden
  let suppressDoubleClickUntil = 0
  let clockTimer: ReturnType<typeof setTimeout> | undefined
  let drag: {
    id: number
    x: number
    y: number
    yaw: number
    pitch: number
    moved: boolean
  } | null = null
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, strength: 0, inside: false }

  function syncState(focus = false) {
    shell.dataset.scene = state
    plane.setAttribute('aria-hidden', String(state !== 'ready'))
    projection.inert = state !== 'ready'
    projection.setAttribute('aria-hidden', String(state !== 'ready'))
    rig.setAttribute('aria-busy', String(state === 'travel'))
    rig.setAttribute('role', state === 'ready' ? 'group' : 'button')
    rig.setAttribute(
      'aria-label',
      uiText(state === 'ready' ? 'archive.mac.reader' : 'archive.mac.enter'),
    )
    if (focus && state === 'ready')
      root.getElementById('date-trigger')?.focus({ preventScroll: true })
    options.onSceneReadyChange?.(state === 'ready')
  }
  function finish() {
    state = 'ready'
    age = DURATION
    yaw = targetYaw
    pitch = -8
    archiveSceneSession.entered = true
    syncState(true)
  }
  function enter() {
    if (state !== 'intro' || disposed) return
    endDrag()
    options.onTransition?.()
    initialYaw = yaw
    targetYaw = yaw + ((((READY_YAW - yaw + 540) % 360) + 360) % 360) - 180
    age = 0
    state = 'travel'
    if (motion.matches) finish()
    syncState()
    draw(0, 0)
    start()
  }
  function cancel() {
    if (state !== 'travel') return
    state = 'intro'
    age = 0
    yaw = initialYaw
    resetSky()
    syncState()
    rig.focus({ preventScroll: true })
    draw(0, 0)
  }
  function returnToIntro() {
    if (state !== 'ready' || disposed) return
    endDrag()
    options.onReturnToIntro?.()
    state = 'intro'
    age = 0
    yaw = initialYaw = targetYaw = READY_YAW
    pitch = -8
    suppressDoubleClickUntil = 0
    pointer.x = pointer.tx = width / 2
    pointer.y = pointer.ty = height / 2
    pointer.inside = false
    pointer.strength = 0
    resetSky()
    archiveSceneSession.entered = false
    syncState()
    rig.focus({ preventScroll: true })
    draw(0, 0)
    start()
  }
  function progress() {
    return state === 'ready' ? 1 : state === 'intro' ? 0 : age / DURATION
  }
  function speed() {
    return state === 'travel'
      ? CRUISE * smooth(age / ACCELERATION) * (1 - smooth((age - DURATION + BRAKING) / BRAKING))
      : 0
  }
  function resetSky() {
    starFrameAt = null
    starElapsed = starDistance = 0
    sky.reset()
  }
  function drawPose() {
    const p = progress()
    const pose = smooth(p)
    const energy = speed() / CRUISE
    const x = lerp(width / 2, finalX, pose) - width / 2
    const y = lerp(height * 0.44, finalY, pose) - height / 2
    const zoom = lerp(initialScale, finalScale, pose)
    const tiltX = lerp(pitch, -8, state === 'travel' ? pose : 0)
    const tiltY = state === 'travel' ? lerp(initialYaw, targetYaw, pose) : yaw
    // Animate the rig itself rather than invalidating inherited variables on every face.
    rig.style.transform = `translate3d(${x}px, ${y}px, 0) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(${zoom}, ${zoom}, ${zoom})`
    // Disk flight reads these values only in the settled reading scene.
    if (state === 'ready') {
      rig.style.setProperty('--zoom', String(zoom))
      rig.style.setProperty('--tilt-x', `${tiltX}deg`)
      rig.style.setProperty('--tilt-y', `${tiltY}deg`)
    }
    const shake = motion.matches ? 0 : energy * Math.min(2.8, width * 0.004)
    const cameraX = shake * (Math.sin(age * 67) * 0.7 + Math.sin(age * 109) * 0.3)
    const cameraY = shake * Math.sin(age * 83) * 0.7
    const camera = `translate(${cameraX}px, ${cameraY}px)`
    canvas.style.transform = camera
    scene.style.transform = camera
    glow.style.opacity = String(smooth((p - 0.15) / 0.75))
    const visible = smooth((p - 0.72) / 0.28)
    projection.style.opacity = String(visible)
    projection.style.transform = `translateY(${(1 - visible) * 18}px)`
  }
  function drawSky(dt: number, distance: number, time?: number) {
    if (disposed || !isVisible()) return
    starElapsed += dt
    starDistance += distance
    if (time !== undefined) {
      if (starFrameAt !== null) {
        const elapsed = time - starFrameAt
        // Preserve cadence on 120/144/240 Hz displays, including timestamp rounding.
        if (elapsed + 0.1 < STAR_FRAME_MS) return
        starFrameAt += Math.max(1, Math.floor((elapsed + 0.1) / STAR_FRAME_MS)) * STAR_FRAME_MS
      } else starFrameAt = time
    }
    sky.draw({
      dt: starElapsed,
      distance: starDistance,
      speed: speed(),
      blend: smooth((progress() - 0.15) / 0.75),
      pointerX: pointer.x,
      pointerY: pointer.y,
      pointerStrength: pointer.strength,
      reduced: motion.matches,
    })
    starElapsed = starDistance = 0
  }
  function draw(dt: number, distance: number) {
    drawPose()
    drawSky(dt, distance)
  }
  function frame(time: number) {
    raf = 0
    if (disposed || !isVisible() || motion.matches) return
    const dt = previous !== null ? Math.min((time - previous) / 1000, 0.064) : 0
    previous = time
    const poseChanged = state !== 'ready'
    let distance = 0
    if (state === 'intro' && !drag) yaw = (yaw + dt * 11) % 360
    if (state === 'travel') {
      const oldDistance = travelDistance(age)
      age = Math.min(DURATION, age + dt)
      distance = travelDistance(age) - oldDistance
      if (age >= DURATION) finish()
    }
    const follow = 1 - Math.exp(-dt * 9)
    pointer.x += (pointer.tx - pointer.x) * follow
    pointer.y += (pointer.ty - pointer.y) * follow
    pointer.strength += ((pointer.inside ? 1 : 0) - pointer.strength) * follow
    if (poseChanged) drawPose()
    drawSky(dt, distance, time)
    raf = requestAnimationFrame(frame)
  }
  function start() {
    if (!raf && !disposed && !motion.matches && isVisible()) {
      previous = null
      starFrameAt = null
      raf = requestAnimationFrame(frame)
    }
  }
  function resize() {
    if (disposed || !isVisible()) return
    width = Math.max(1, shell.clientWidth)
    height = Math.max(1, shell.clientHeight)
    const narrow = width < 780
    initialScale = Math.min(width / 1000, height / 950, 0.5)
    finalScale = narrow
      ? Math.min((width * 0.88) / 420, 0.95)
      : Math.min((width * 0.46) / 430, (height - 80) / 460, 1.8)
    finalX = width * (narrow ? 0.46 : 0.255)
    finalY = narrow ? finalScale * 220 + 20 : height * 0.48
    shell.style.setProperty('--mac-space', `${finalScale * 440 + 32}px`)
    sky.resize(width, height)
    const scale = Math.min(glass.clientWidth / crt.width, glass.clientHeight / crt.height)
    plane.style.transform = `translate(${(glass.clientWidth - crt.width * scale) / 2}px, ${(glass.clientHeight - crt.height * scale) / 2}px) scale(${scale})`
    if (!pointer.inside) {
      pointer.x = pointer.tx = width / 2
      pointer.y = pointer.ty = height / 2
    }
    draw(0, 0)
  }
  function endDrag() {
    if (!drag) return
    const ended = drag
    drag = null
    rig.classList.remove('is-dragging')
    if (rig.hasPointerCapture(ended.id)) rig.releasePointerCapture(ended.id)
    if (ended.moved) suppressDoubleClickUntil = performance.now() + 400
  }
  rig.addEventListener(
    'dblclick',
    (event) => {
      if (event.button !== 0 || performance.now() < suppressDoubleClickUntil) return
      event.preventDefault()
      enter()
    },
    { signal },
  )
  rig.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0 || state !== 'intro' || drag) return
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch, moved: false }
      rig.setPointerCapture(event.pointerId)
      rig.focus({ preventScroll: true })
      event.preventDefault()
    },
    { signal },
  )
  rig.addEventListener(
    'pointermove',
    (event) => {
      if (!drag || drag.id !== event.pointerId) return
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < 4) return
      drag.moved = true
      rig.classList.add('is-dragging')
      yaw = drag.yaw + dx * 0.45
      pitch = Math.max(-40, Math.min(-4, drag.pitch - dy * 0.3))
      drawPose()
    },
    { signal },
  )
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    rig.addEventListener(type, endDrag, { signal })
  rig.addEventListener(
    'keydown',
    (event) => {
      if (event.target !== rig) return
      if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
        event.preventDefault()
        enter()
      }
    },
    { signal },
  )
  root.addEventListener(
    'keydown',
    (event) => {
      const key = event as KeyboardEvent
      if (key.key !== 'Escape') return
      if (options.onPopupEscape?.() || state === 'travel') {
        key.preventDefault()
        key.stopPropagation()
        cancel()
      }
    },
    { signal },
  )
  shell.addEventListener(
    'pointermove',
    (event) => {
      const bounds = shell.getBoundingClientRect()
      pointer.tx = event.clientX - bounds.left
      pointer.ty = event.clientY - bounds.top
      pointer.inside = !(event.target as Element).closest('.hologram, .rig')
      if (motion.matches) {
        pointer.x = pointer.tx
        pointer.y = pointer.ty
        pointer.strength = pointer.inside ? 1 : 0
        draw(0, 0)
      }
    },
    { signal },
  )
  shell.addEventListener(
    'pointerleave',
    () => {
      pointer.inside = false
      if (motion.matches) {
        pointer.strength = 0
        draw(0, 0)
      }
    },
    { signal },
  )
  shell.addEventListener(
    'pointerdown',
    (event) => {
      if (
        event.button ||
        state === 'travel' ||
        motion.matches ||
        (event.target as Element).closest('.hologram, .rig')
      )
        return
      const bounds = shell.getBoundingClientRect()
      sky.pulse(event.clientX - bounds.left, event.clientY - bounds.top)
    },
    { signal },
  )
  function updateClock() {
    const now = new Date()
    root.getElementById('crt-clock')!.textContent =
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    clearTimeout(clockTimer)
    if (!disposed && isVisible())
      clockTimer = setTimeout(updateClock, (60 - now.getSeconds()) * 1000)
  }
  function suspend() {
    cancelAnimationFrame(raf)
    raf = 0
    previous = null
    starFrameAt = null
    endDrag()
    clearTimeout(clockTimer)
  }
  function syncVisibility() {
    if (disposed) return
    if (!isVisible()) suspend()
    else {
      updateClock()
      resize()
      start()
    }
  }
  document.addEventListener('visibilitychange', syncVisibility, { signal })
  window.addEventListener('blur', endDrag, { signal })
  window.addEventListener('resize', resize, { signal })
  motion.addEventListener(
    'change',
    () => {
      if (motion.matches) {
        suspend()
        if (state === 'travel') finish()
        draw(0, 0)
        updateClock()
      } else start()
    },
    { signal },
  )
  const observer = new ResizeObserver(resize)
  observer.observe(shell)
  const crt = root.getElementById('crt') as HTMLCanvasElement
  const ctx = crt.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#d6dfca'
    ctx.fillRect(0, 0, crt.width, crt.height)
    ctx.fillStyle = '#a2b89e'
    for (let y = 0; y < crt.height; y += 4)
      for (let x = 0; x < crt.width; x += 4) ctx.fillRect(x, y, 1, 1)
  }
  syncState()
  updateClock()
  resize()
  start()
  return {
    setVisible(visible) {
      if (windowVisible === visible) return
      windowVisible = visible
      syncVisibility()
    },
    enter,
    returnToIntro,
    refreshLocale() {
      rig.setAttribute(
        'aria-label',
        uiText(state === 'ready' ? 'archive.mac.reader' : 'archive.mac.enter'),
      )
    },
    dispose() {
      disposed = true
      suspend()
      listeners.abort()
      observer.disconnect()
      sky.dispose()
    },
  }
}
