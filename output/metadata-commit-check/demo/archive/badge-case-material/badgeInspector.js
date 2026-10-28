import { createInspectRenderer } from './inspectRenderer.js'

const TAU = Math.PI * 2
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const ease = (t) => 1 - (1 - t) ** 3
const smooth = (t) => t * t * (3 - 2 * t)

// Owns the modal, the one active WebGL renderer, and its bounded animation loop.
// App callbacks own which badge has been lifted and the foam's retained imprint.
export function createBadgeInspector({ onLift, onReturn, onError }) {
  const dialog = document.createElement('dialog')
  dialog.className = 'badge-inspector'
  dialog.setAttribute('aria-label', '徽章检视')
  dialog.innerHTML = `<div class="inspect-object" tabindex="0" role="img"><canvas class="inspect-canvas" aria-hidden="true"></canvas></div><button class="inspect-close" type="button" aria-label="放回盒中"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>`
  document.body.append(dialog)
  const stage = dialog.querySelector('.inspect-object'),
    canvas = dialog.querySelector('canvas')
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  let graphics,
    current,
    flight,
    phase = 'closed',
    frame = 0,
    previous = 0,
    revision = 0,
    disposed = false
  let width = 420,
    height = (width * 370) / 330
  const pose = { x: 0, y: TAU, targetX: 0, targetY: TAU }
  function resize() {
    width = Math.min(420, innerWidth - 56, ((innerHeight - 120) * 330) / 370)
    height = (width * 370) / 330
    stage.style.width = `${width}px`
    stage.style.height = `${height}px`
    graphics?.resize(width, height)
    if (current) current.source = current.button.querySelector('img').getBoundingClientRect()
    if (phase !== 'closed' && phase !== 'loading') requestDraw()
  }
  function place(progress) {
    const source = current.source,
      p = ease(progress)
    const scale = source.width / width + (1 - source.width / width) * p
    const x = source.left + (innerWidth / 2 - width / 2 - source.left) * p
    const y = source.top + (innerHeight / 2 - height / 2 - source.top) * p
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    previous = 0
  }
  function finishClose() {
    stop()
    if (current?.lifted) onReturn(current.entry, current.button)
    const button = current?.button
    current = flight = null
    phase = 'closed'
    dialog.classList.remove('is-present')
    delete dialog.dataset.leaving
    dialog.close()
    if (button?.isConnected) button.focus({ preventScroll: true })
  }
  function close() {
    if (phase === 'closed' || phase === 'leaving') return
    revision++
    graphics?.cancelLoad()
    if (phase === 'loading' || motion.matches) {
      finishClose()
      return
    }
    flight = {
      start: performance.now(),
      duration: 420,
      fromProgress: flight?.progress ?? 1,
      x: pose.x,
      y: pose.y,
      endY: Math.round(pose.y / TAU) * TAU,
    }
    phase = 'leaving'
    dialog.dataset.leaving = 'true'
    dialog.classList.remove('is-present')
    requestDraw()
  }
  function draw(time) {
    frame = 0
    if (!current || disposed || document.hidden) {
      previous = 0
      return
    }
    if (phase === 'entering' || phase === 'leaving') {
      const t = motion.matches ? 1 : clamp((time - flight.start) / flight.duration, 0, 1)
      if (phase === 'entering') {
        flight.progress = t
        place(t)
        pose.x = -Math.sin(Math.PI * t) * 0.08
        pose.y = TAU * smooth(t)
        graphics.render(pose.x, pose.y)
        if (t === 1) {
          phase = 'inspecting'
          flight = null
          pose.x = pose.targetX = 0
          pose.y = pose.targetY = TAU
          stage.focus({ preventScroll: true })
        } else requestDraw()
      } else {
        place(flight.fromProgress * (1 - ease(t)))
        pose.x = flight.x * (1 - ease(t))
        pose.y = flight.y + (flight.endY - flight.y) * ease(t)
        graphics.render(pose.x, pose.y)
        if (t === 1) finishClose()
        else requestDraw()
      }
      return
    }
    if (phase !== 'inspecting') return
    place(1)
    const alpha = motion.matches
      ? 1
      : 1 - Math.exp(-(previous ? Math.min(time - previous, 50) : 16.7) / 65)
    previous = time
    pose.x += (pose.targetX - pose.x) * alpha
    pose.y += (pose.targetY - pose.y) * alpha
    const moving = Math.abs(pose.x - pose.targetX) + Math.abs(pose.y - pose.targetY) > 0.0002
    if (!moving) {
      pose.x = pose.targetX
      pose.y = pose.targetY
      previous = 0
    }
    graphics.render(pose.x, pose.y)
    if (moving) requestDraw()
  }
  function requestDraw() {
    if (!frame && !disposed && !document.hidden) frame = requestAnimationFrame(draw)
  }
  function fail(error) {
    finishClose()
    graphics?.dispose()
    graphics = null
    onError(error)
  }
  function preference() {
    if (phase === 'leaving' && motion.matches) finishClose()
    else if (phase !== 'closed' && phase !== 'loading') {
      pose.targetX = 0
      pose.targetY = TAU
      requestDraw()
    }
  }
  function visibility() {
    if (document.hidden) stop()
    else if (phase !== 'closed' && phase !== 'loading') requestDraw()
  }
  stage.addEventListener('pointermove', (event) => {
    if (phase !== 'inspecting' || motion.matches) return
    const box = stage.getBoundingClientRect()
    pose.targetX = -clamp(((event.clientY - box.top) / box.height) * 2 - 1, -1, 1) * 0.1
    pose.targetY = TAU + clamp(((event.clientX - box.left) / box.width) * 2 - 1, -1, 1) * 0.12
    requestDraw()
  })
  stage.addEventListener('pointerleave', () => {
    pose.targetX = 0
    pose.targetY = TAU
    if (phase === 'inspecting') requestDraw()
  })
  dialog.querySelector('.inspect-close').addEventListener('click', close)
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close()
  })
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    close()
  })
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', visibility)
  motion.addEventListener('change', preference)
  resize()
  return {
    async open(entry, button) {
      if (disposed || phase !== 'closed') return
      const owner = ++revision
      current = {
        entry,
        button,
        source: button.querySelector('img').getBoundingClientRect(),
        lifted: false,
      }
      phase = 'loading'
      stage.setAttribute('aria-label', `${entry.name}，移动鼠标观察反光`)
      dialog.showModal()
      try {
        graphics ??= createInspectRenderer(canvas, fail)
        graphics.resize(width, height)
        if (!(await graphics.load(entry)) || owner !== revision || disposed) return
        place(0)
        graphics.render(0, 0)
        current.lifted = true
        onLift(entry, button)
        phase = 'entering'
        flight = { start: performance.now(), duration: 1080, progress: 0 }
        dialog.classList.add('is-present')
        requestDraw()
      } catch (error) {
        if (owner === revision && !disposed) fail(error)
      }
    },
    close,
    snapshot() {
      return {
        phase,
        badgeId: current?.entry.id ?? null,
        running: !!frame,
        progress: flight?.progress ?? null,
        renderer: graphics?.snapshot() ?? null,
      }
    },
    dispose() {
      disposed = true
      revision++
      finishClose()
      graphics?.dispose()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', visibility)
      motion.removeEventListener('change', preference)
      dialog.remove()
    },
  }
}
