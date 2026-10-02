/** Owns exactly one animation loop. Hidden views do not keep scheduling frames. */
export function createRhineLoop(
  frame: (seconds: number) => void,
  request: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancel: (id: number) => void = cancelAnimationFrame,
) {
  let handle: number | null = null
  let running = false
  let disposed = false
  let previous: number | null = null
  let elapsed = 0
  function tick(ms: number): void {
    handle = null
    if (!running || disposed) return
    elapsed += previous === null ? 0 : Math.min(0.05, Math.max(0, (ms - previous) / 1000))
    previous = ms
    frame(elapsed)
    if (running && !disposed) handle = request(tick)
  }
  function stop(): void {
    running = false
    previous = null
    if (handle !== null) cancel(handle)
    handle = null
  }
  return {
    setActive(active: boolean) {
      if (!active) return stop()
      if (running || disposed) return
      running = true
      handle = request(tick)
    },
    dispose() {
      disposed = true
      stop()
    },
  }
}
