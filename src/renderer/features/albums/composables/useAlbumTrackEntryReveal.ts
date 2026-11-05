import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { getContrastRatio } from '@renderer/shared/color/colorMath'
import { parseSurfaceColor } from '@renderer/shared/color/surfaceColor'
import type { ForegroundReadiness } from '@renderer/shared/color/foregroundReadiness'

/** Hold the list until the shared foreground timeline reaches its final light/dark polarity. */
export function useAlbumTrackEntryReveal(
  root: Ref<HTMLElement | null>,
  options: {
    entering: () => boolean
    textColor: () => string
    artworkKey: () => string | null
    readiness: () => ForegroundReadiness | null
  },
) {
  const pending = ref(options.entering())
  let frame: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  let main: HTMLElement | null = null
  let attempts = 0
  let disposed = false

  function cancelScheduled(): void {
    if (frame !== undefined) cancelAnimationFrame(frame)
    if (timer !== undefined) clearTimeout(timer)
    frame = undefined
    timer = undefined
  }
  function reveal(): void {
    pending.value = false
    cancelScheduled()
    if (deadline !== undefined) clearTimeout(deadline)
    deadline = undefined
  }
  function schedule(): void {
    if (!pending.value || disposed || !main) return
    cancelScheduled()
    attempts = 0
    frame = requestAnimationFrame(inspect)
  }
  function inspect(): void {
    frame = undefined
    if (!pending.value || !main) return
    const target = parseSurfaceColor(options.textColor())
    if (!target) return
    const readiness = options.readiness()
    if (
      readiness &&
      readiness.target.r === target.r &&
      readiness.target.g === target.g &&
      readiness.target.b === target.b
    ) {
      timer = setTimeout(reveal, Math.max(0, readiness.readyAt - performance.now()))
      return
    }
    const background = parseSurfaceColor(getComputedStyle(main).backgroundColor)
    if (background && getContrastRatio(target, background) >= 4.58) return reveal()
    // The shell may publish the readiness after this component's next render.
    if (++attempts < 4) frame = requestAnimationFrame(inspect)
  }
  watch(
    [root, options.textColor, options.entering, options.artworkKey, options.readiness],
    ([node]) => {
      if (!pending.value || disposed) return
      main = node?.closest<HTMLElement>('.app-main') ?? null
      if (!options.artworkKey() && !options.entering()) return reveal()
      if (options.textColor()) schedule()
    },
    { immediate: true, flush: 'post' },
  )
  if (pending.value) deadline = setTimeout(reveal, 1200)
  onBeforeUnmount(() => {
    disposed = true
    cancelScheduled()
    if (deadline !== undefined) clearTimeout(deadline)
  })
  return { pending }
}
