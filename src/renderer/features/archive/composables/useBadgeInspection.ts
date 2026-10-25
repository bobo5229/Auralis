import { computed, nextTick, onBeforeUnmount, readonly, ref, type Ref } from 'vue'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import type { InspectBadge, createInspectRenderer } from '../runtime/badgeInspectRenderer'

type Phase = 'closed' | 'loading' | 'entering' | 'inspecting' | 'leaving'
interface Selection {
  entry: InspectBadge
  button: HTMLButtonElement
  source: DOMRect
  lifted: boolean
}
interface Flight {
  start: number
  duration: number
  progress: number
  x: number
  y: number
  endY: number
}
const TAU = Math.PI * 2
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const ease = (t: number) => 1 - (1 - t) ** 3

/** Owns the inspection session, pose, cancellation and animation clock. */
export function useBadgeInspection(options: {
  stage: Ref<HTMLElement | null>
  canvas: Ref<HTMLCanvasElement | null>
  onLift: (id: string) => void
  onReturn: (id: string) => void
  onError: () => void
}) {
  const phase = ref<Phase>('closed')
  const badgeId = ref<string | null>(null)
  const liftedId = ref<string | null>(null)
  const active = computed(() => phase.value !== 'closed')
  const motion = createReducedMotionQuery()
  let graphics: ReturnType<typeof createInspectRenderer> | undefined
  let current: Selection | undefined
  let pending: { entry: InspectBadge; button: HTMLButtonElement } | undefined
  let flight: Flight | undefined
  let frame = 0,
    previous = 0,
    revision = 0,
    disposed = false
  let width = 420,
    height = (width * 370) / 330
  const pose = { x: 0, y: TAU, targetX: 0, targetY: TAU }
  function resize() {
    width = Math.min(420, innerWidth - 56, ((innerHeight - 120) * 330) / 370)
    height = (width * 370) / 330
    if (options.stage.value)
      Object.assign(options.stage.value.style, { width: `${width}px`, height: `${height}px` })
    graphics?.resize(width, height)
    if (current) current.source = current.button.querySelector('img')!.getBoundingClientRect()
    if (active.value && phase.value !== 'loading') requestDraw()
  }
  function place(progress: number) {
    if (!current || !options.stage.value) return
    const source = current.source,
      p = ease(progress)
    const scale = source.width / width + (1 - source.width / width) * p
    const x = source.left + (innerWidth / 2 - width / 2 - source.left) * p
    const y = source.top + (innerHeight / 2 - height / 2 - source.top) * p
    options.stage.value.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame)
    frame = previous = 0
  }
  function finishClose(restoreFocus = true) {
    stop()
    if (current?.lifted) options.onReturn(current.entry.id)
    const button = current?.button
    current = flight = undefined
    badgeId.value = liftedId.value = null
    phase.value = 'closed'
    const next = pending
    pending = undefined
    if (next && !disposed) void open(next.entry, next.button)
    else if (restoreFocus) {
      const owner = revision
      void nextTick(() => {
        if (!disposed && owner === revision && phase.value === 'closed' && button?.isConnected)
          button.focus({ preventScroll: true })
      })
    }
  }
  function close() {
    pending = undefined
    beginClose()
  }
  function beginClose() {
    if (phase.value === 'closed' || phase.value === 'leaving') return
    revision++
    graphics?.cancelLoad()
    if (phase.value === 'loading' || motion.matches) {
      finishClose()
      return
    }
    flight = {
      start: performance.now(),
      duration: 420,
      progress: flight?.progress ?? 1,
      x: pose.x,
      y: pose.y,
      endY: Math.round(pose.y / TAU) * TAU,
    }
    phase.value = 'leaving'
    requestDraw()
  }
  function fail() {
    pending = undefined
    finishClose()
    graphics?.dispose()
    graphics = undefined
    options.onError()
  }
  function draw(time: number) {
    frame = 0
    if (!current || disposed || document.hidden) {
      previous = 0
      return
    }
    if (phase.value === 'entering' || phase.value === 'leaving') {
      const turn = flight!
      const t = motion.matches ? 1 : clamp((time - turn.start) / turn.duration, 0, 1)
      if (phase.value === 'entering') {
        turn.progress = t
        place(t)
        pose.x = -Math.sin(Math.PI * t) * 0.08
        pose.y = TAU * t * t * (3 - 2 * t)
        graphics?.render(pose.x, pose.y)
        if (t === 1) {
          phase.value = 'inspecting'
          flight = undefined
          pose.x = pose.targetX = 0
          pose.y = pose.targetY = TAU
          options.stage.value?.focus({ preventScroll: true })
        } else requestDraw()
      } else {
        place(turn.progress * (1 - ease(t)))
        pose.x = turn.x * (1 - ease(t))
        pose.y = turn.y + (turn.endY - turn.y) * ease(t)
        graphics?.render(pose.x, pose.y)
        if (t === 1) finishClose()
        else requestDraw()
      }
      return
    }
    if (phase.value !== 'inspecting') return
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
    graphics?.render(pose.x, pose.y)
    if (moving) requestDraw()
  }
  function requestDraw() {
    if (!frame && !disposed && !document.hidden) frame = requestAnimationFrame(draw)
  }
  async function open(entry: InspectBadge, button: HTMLButtonElement) {
    if (disposed || phase.value !== 'closed') return
    const owner = ++revision
    button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    current = {
      entry,
      button,
      source: button.querySelector('img')!.getBoundingClientRect(),
      lifted: false,
    }
    badgeId.value = entry.id
    phase.value = 'loading'
    try {
      if (!graphics) {
        const module = await import('../runtime/badgeInspectRenderer')
        if (disposed || owner !== revision || !options.canvas.value) return
        graphics = module.createInspectRenderer(options.canvas.value, fail)
      }
      resize()
      if (!(await graphics.load(entry)) || disposed || owner !== revision) return
      place(0)
      graphics.render(0, 0)
      current!.lifted = true
      liftedId.value = entry.id
      options.onLift(entry.id)
      phase.value = 'entering'
      flight = { start: performance.now(), duration: 1080, progress: 0, x: 0, y: 0, endY: TAU }
      requestDraw()
    } catch {
      if (owner === revision && !disposed) fail()
    }
  }
  function switchTo(entry: InspectBadge, button: HTMLButtonElement) {
    if (phase.value !== 'inspecting') return
    pending = { entry, button }
    beginClose()
  }
  function reset() {
    pose.targetX = 0
    pose.targetY = TAU
    if (phase.value === 'inspecting') requestDraw()
  }
  function pointer(event: PointerEvent) {
    if (
      phase.value !== 'inspecting' ||
      motion.matches ||
      event.pointerType === 'touch' ||
      !options.stage.value
    )
      return
    const box = options.stage.value.getBoundingClientRect()
    pose.targetX = -clamp(((event.clientY - box.top) / box.height) * 2 - 1, -1, 1) * 0.1
    pose.targetY = TAU + clamp(((event.clientX - box.left) / box.width) * 2 - 1, -1, 1) * 0.12
    requestDraw()
  }
  function keydown(event: KeyboardEvent) {
    if (phase.value !== 'inspecting') return
    if (event.key === 'Home') {
      event.preventDefault()
      reset()
      return
    }
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [0, -0.035],
      ArrowRight: [0, 0.035],
      ArrowUp: [0.035, 0],
      ArrowDown: [-0.035, 0],
    }
    const step = steps[event.key]
    if (!step) return
    event.preventDefault()
    pose.targetX = clamp(pose.targetX + step[0], -0.1, 0.1)
    pose.targetY = clamp(pose.targetY + step[1], TAU - 0.12, TAU + 0.12)
    requestDraw()
  }
  function preference() {
    if (phase.value === 'leaving' && motion.matches) finishClose()
    else if (active.value) {
      reset()
      requestDraw()
    }
  }
  function visibility() {
    if (document.hidden) stop()
    else if (active.value && phase.value !== 'loading') requestDraw()
  }
  let resolution: MediaQueryList | undefined
  function watchResolution() {
    resolution?.removeEventListener('change', onResolution)
    resolution = matchMedia(`(resolution: ${devicePixelRatio}dppx)`)
    resolution.addEventListener('change', onResolution)
  }
  function onResolution() {
    resize()
    watchResolution()
  }
  watchResolution()
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', visibility)
  motion.addEventListener('change', preference)
  onBeforeUnmount(() => {
    disposed = true
    revision++
    pending = undefined
    finishClose(false)
    graphics?.dispose()
    resolution?.removeEventListener('change', onResolution)
    window.removeEventListener('resize', resize)
    document.removeEventListener('visibilitychange', visibility)
    motion.removeEventListener('change', preference)
  })
  return {
    phase: readonly(phase),
    badgeId: readonly(badgeId),
    liftedId: readonly(liftedId),
    active,
    open,
    close,
    switchTo,
    pointer,
    reset,
    keydown,
    snapshot: () => ({
      phase: phase.value,
      badgeId: badgeId.value,
      running: !!frame,
      renderer: graphics?.snapshot() ?? null,
    }),
    forceContextLoss: () => graphics?.forceContextLoss(),
  }
}
