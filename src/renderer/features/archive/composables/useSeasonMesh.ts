import { onMounted, onScopeDispose, ref, watch, type Ref } from 'vue'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { useWindowVisibility } from '@renderer/shared/animation/useWindowVisibility'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import type { createSeasonMesh } from '../runtime/seasonMesh'

export function useSeasonMesh(
  host: Ref<HTMLElement | null>,
  canvas: Ref<HTMLCanvasElement | null>,
) {
  const ready = ref(false)
  const windowVisible = useWindowVisibility()
  const motion = createReducedMotionQuery()
  let isIntersecting = false
  let runtime: ReturnType<typeof createSeasonMesh> | undefined
  let intersection: IntersectionObserver | undefined
  let resize: ResizeObserver | undefined
  let theme: MutationObserver | undefined
  let disposed = false
  let failed = false
  let preparing = false
  let revision = 0

  function canAnimate() {
    return !disposed && !failed && !motion.matches && windowVisible.value && isIntersecting
  }
  function fail(cause: unknown) {
    if (disposed || failed) return
    failed = true
    runtime?.dispose()
    runtime = undefined
    ready.value = false
    rendererDiagnostics.warn({
      scope: 'archive.season-mesh',
      message: 'Season banner kept its static artwork',
      cause,
    })
  }
  async function prepare() {
    preparing = true
    const current = revision
    try {
      const { createSeasonMesh } = await import('../runtime/seasonMesh')
      if (current !== revision || !canAnimate() || !host.value || !canvas.value) return
      const nextRuntime = createSeasonMesh(
        host.value,
        canvas.value,
        () => {
          if (!disposed && !failed) ready.value = !motion.matches
        },
        fail,
      )
      runtime = nextRuntime
      nextRuntime.setPlaying(true)
    } catch (cause) {
      if (!disposed) fail(cause)
    } finally {
      preparing = false
      if (current !== revision && canAnimate()) sync()
    }
  }
  function sync() {
    if (!canAnimate()) {
      revision++
      runtime?.setPlaying(false)
      // Keep the context reusable; reduced motion displays the CSS artwork.
      if (motion.matches) ready.value = false
      return
    }
    if (runtime) {
      runtime.setPlaying(true)
      // A new worker may still be preparing its first frame.
      if (runtime.isReady()) ready.value = !failed
    } else if (!preparing) void prepare()
  }
  function refreshLayout() {
    runtime?.resize()
  }
  function refreshAppearance() {
    runtime?.refreshAppearance()
  }
  watch(windowVisible, sync, { flush: 'sync' })
  onMounted(() => {
    if (!host.value) return
    intersection = new IntersectionObserver((entries) => {
      const entry = entries.find((entry) => entry.target === host.value)
      if (!entry) return
      isIntersecting = entry.isIntersecting
      sync()
    })
    intersection.observe(host.value)
    resize = new ResizeObserver(refreshLayout)
    resize.observe(host.value)
    theme = new MutationObserver(refreshAppearance)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    window.addEventListener('resize', refreshLayout)
    motion.addEventListener('change', sync)
  })
  onScopeDispose(() => {
    disposed = true
    revision++
    intersection?.disconnect()
    resize?.disconnect()
    theme?.disconnect()
    window.removeEventListener('resize', refreshLayout)
    motion.removeEventListener('change', sync)
    runtime?.dispose()
    runtime = undefined
    ready.value = false
    isIntersecting = false
  })
  return ready
}
