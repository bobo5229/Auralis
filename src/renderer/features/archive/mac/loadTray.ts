export interface LoadTrayController {
  hit(x: number, y: number): boolean
  approach(x: number, y: number): void
  reset(): void
  cancel(): void
  load(
    texture: HTMLCanvasElement,
    ghost: HTMLCanvasElement,
    options: { x: number; y: number; signal: AbortSignal },
  ): Promise<boolean>
  dispose(): void
}

export function mountLoadTray(
  slot: HTMLElement,
  motion: { matches: boolean } = { matches: false },
): LoadTrayController {
  slot.insertAdjacentHTML(
    'beforeend',
    '<div class="load-tray" aria-hidden="true"><div class="tray-top"><div class="tray-media"><canvas width="96" height="96"></canvas><i class="tray-point p0"></i><i class="tray-point p1"></i><i class="tray-point p2"></i><i class="tray-point p3"></i></div></div><div class="tray-front"></div><div class="tray-side left"></div><div class="tray-side right"></div></div>',
  )
  const surface = slot.querySelector<HTMLElement>('.tray-top')
  const media = slot.querySelector<HTMLElement>('.tray-media')
  const cover = media?.querySelector<HTMLCanvasElement>('canvas')
  let busy = false
  let revision = 0
  let currentAnimation: Animation | null = null
  let currentTimer: number | null = null
  let activeLoad: AbortController | null = null

  function size() {
    slot.style.setProperty('--tray-width', `${slot.offsetWidth}px`)
  }
  size()

  const observer = new ResizeObserver(size)
  observer.observe(slot)

  function open(value: boolean) {
    slot.classList.toggle('tray-open', value)
    slot.dataset.tray = value ? 'open' : 'closed'
  }
  open(false)

  function contains(x: number, y: number, r: DOMRect, padX: number, padY = padX): boolean {
    return x >= r.left - padX && x <= r.right + padX && y >= r.top - padY && y <= r.bottom + padY
  }

  function hit(x: number, y: number): boolean {
    return (
      contains(x, y, slot.getBoundingClientRect(), 14, 20) ||
      (slot.classList.contains('tray-open') &&
        Boolean(surface && contains(x, y, surface.getBoundingClientRect(), 10)))
    )
  }

  function approach(x: number, y: number): void {
    if (busy) return
    const near =
      contains(x, y, slot.getBoundingClientRect(), 50, 55) ||
      (slot.classList.contains('tray-open') &&
        Boolean(surface && contains(x, y, surface.getBoundingClientRect(), 32)))
    open(near)
    slot.classList.toggle('is-ready', hit(x, y))
  }

  function cancelAnimation(): void {
    if (currentAnimation) {
      currentAnimation.cancel()
      currentAnimation = null
    }
    if (currentTimer !== null) {
      clearTimeout(currentTimer)
      currentTimer = null
    }
  }

  function reset(): void {
    if (busy) return
    cancelAnimation()
    open(false)
    slot.classList.remove('is-ready', 'tray-loaded')
  }

  function cancel(): void {
    activeLoad?.abort()
    activeLoad = null
    revision++
    cancelAnimation()
    open(false)
    slot.classList.remove('is-ready', 'tray-loaded')
    busy = false
  }

  function delay(ms: number, signal: AbortSignal): Promise<void> {
    if (motion.matches || signal.aborted) return Promise.resolve()
    return new Promise((resolve) => {
      const done = () => {
        if (currentTimer !== null) {
          clearTimeout(currentTimer)
          currentTimer = null
        }
        signal.removeEventListener('abort', done)
        resolve()
      }
      currentTimer = window.setTimeout(done, ms)
      signal.addEventListener('abort', done, { once: true })
    })
  }

  async function load(
    texture: HTMLCanvasElement,
    ghost: HTMLCanvasElement,
    { x, y, signal: externalSignal }: { x: number; y: number; signal: AbortSignal },
  ): Promise<boolean> {
    cancel()
    const controller = new AbortController()
    activeLoad = controller
    const signal = controller.signal
    const forwardAbort = () => controller.abort()
    externalSignal.addEventListener('abort', forwardAbort, { once: true })
    if (externalSignal.aborted) controller.abort()
    busy = true
    const run = ++revision
    let animation: Animation | null = null

    const abort = () => {
      animation?.cancel()
      if (run !== revision) return
      ghost.hidden = true
      open(false)
      slot.classList.remove('is-ready', 'tray-loaded')
      busy = false
    }
    signal.addEventListener('abort', abort, { once: true })

    try {
      if (signal.aborted) return false
      open(true)
      slot.classList.add('is-ready')
      await delay(280, signal)
      if (signal.aborted) return false

      if (cover) {
        const cCtx = cover.getContext('2d')
        cCtx?.drawImage(texture, 0, 0)
        surface?.style.setProperty('--tray-cover', `url("${cover.toDataURL()}")`)
      }

      const points = media
        ? [...media.querySelectorAll('.tray-point')].map((p) => {
            const r = p.getBoundingClientRect()
            return { x: r.left, y: r.top }
          })
        : []
      const [p0, p1, , p3] = points
      const width = ghost.offsetWidth || 96
      const height = ghost.offsetHeight || 96
      const landing =
        p0 && p1 && p3
          ? `matrix(${(p1.x - p0.x) / width},${(p1.y - p0.y) / width},${(p3.x - p0.x) / height},${(p3.y - p0.y) / height},0,0)`
          : 'none'

      if (!motion.matches && p0) {
        animation = ghost.animate(
          [
            {
              left: `${x}px`,
              top: `${y}px`,
              transform: 'translate(-50%,-50%)',
              transformOrigin: '0 0',
              opacity: 1,
            },
            {
              left: `${p0.x}px`,
              top: `${p0.y}px`,
              transform: landing,
              transformOrigin: '0 0',
              opacity: 1,
            },
          ],
          {
            duration: 340,
            easing: 'cubic-bezier(.22,1,.36,1)',
            fill: 'forwards',
          },
        )
        currentAnimation = animation
        await animation.finished.catch(() => {})
        currentAnimation = null
        if (signal.aborted) return false
      }

      slot.classList.add('tray-loaded')
      ghost.hidden = true
      animation?.cancel()
      animation = null

      await delay(110, signal)
      if (signal.aborted) return false
      open(false)
      slot.classList.remove('is-ready')
      await delay(280, signal)
      return !signal.aborted
    } finally {
      signal.removeEventListener('abort', abort)
      externalSignal.removeEventListener('abort', forwardAbort)
      animation?.cancel()
      if (run === revision) {
        activeLoad = null
        ghost.hidden = true
        open(false)
        slot.classList.remove('is-ready', 'tray-loaded')
        busy = false
      }
    }
  }

  return {
    hit,
    approach,
    reset,
    cancel,
    load,
    dispose: () => {
      cancel()
      observer.disconnect()
    },
  }
}
