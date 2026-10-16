/** A 30 Hz clock that advances by active time, independently of the display refresh rate. */
export function createSeasonMeshClock(onFrame: (elapsedSeconds: number) => void) {
  const interval = 1000 / 30
  let playing = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastDraw = 0
  let nextDraw = 0
  let elapsed = 0

  function schedule() {
    // Round up to avoid an extra callback caused by truncating a fractional millisecond.
    timer = setTimeout(tick, Math.max(1, Math.ceil(nextDraw - performance.now())))
  }
  function tick() {
    timer = undefined
    if (!playing) return
    const now = performance.now()
    elapsed += Math.min(0.1, (now - lastDraw) / 1000)
    lastDraw = now
    onFrame(elapsed)
    if (!playing) return
    nextDraw += interval
    if (nextDraw <= performance.now()) nextDraw = performance.now() + interval
    schedule()
  }
  return {
    setPlaying(value: boolean) {
      if (playing === value) return
      playing = value
      if (value) {
        lastDraw = performance.now()
        nextDraw = lastDraw + interval
        schedule()
      } else {
        clearTimeout(timer)
        timer = undefined
      }
    },
  }
}
