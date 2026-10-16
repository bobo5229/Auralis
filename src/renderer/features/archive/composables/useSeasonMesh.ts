import { onMounted, onScopeDispose, ref, watch, type Ref } from 'vue'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { useWindowVisibility } from '@renderer/shared/animation/useWindowVisibility'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import type { createSeasonMesh } from '../runtime/seasonMesh'
import { seasonMeshSession } from '../runtime/seasonMeshSession'

export function useSeasonMesh(
  host: Ref<HTMLElement | null>,
  canvas: Ref<HTMLCanvasElement | null>,
  snapshotCanvas: Ref<HTMLCanvasElement | null>,
) {
  const ready = ref(false)
  const hasSnapshot = ref(false)
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
  let restoring = true
  let revealFrame: number | undefined

  function canAnimate() {
    return (
      !disposed && !failed && !restoring && !motion.matches && windowVisible.value && isIntersecting
    )
  }
  function restoreSnapshot() {
    hasSnapshot.value = false
    const snapshot = seasonMeshSession.read()
    if (!snapshot || motion.matches || !host.value || !snapshotCanvas.value) return
    if (
      snapshot.appearance !== getComputedStyle(host.value).getPropertyValue('--season-wash').trim()
    )
      return
    try {
      const target = snapshotCanvas.value
      const context = target.getContext('2d')
      if (!context) return
      target.width = snapshot.bitmap.width
      target.height = snapshot.bitmap.height
      context.drawImage(snapshot.bitmap, 0, 0)
      hasSnapshot.value = true
    } catch {
      // A missing snapshot must never prevent the static artwork or live renderer from appearing.
    }
  }
  function cancelReveal() {
    if (revealFrame !== undefined) cancelAnimationFrame(revealFrame)
    revealFrame = undefined
  }
  function reveal() {
    if (ready.value || revealFrame !== undefined || !canAnimate()) return
    // Give the restored image a painted frame before changing the live canvas opacity.
    revealFrame = requestAnimationFrame(() => {
      revealFrame = requestAnimationFrame(() => {
        revealFrame = undefined
        if (canAnimate()) ready.value = true
      })
    })
  }
  function fail(cause: unknown) {
    if (disposed || failed) return
    failed = true
    runtime?.dispose()
    runtime = undefined
    cancelReveal()
    ready.value = false
    restoreSnapshot()
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
          if (!disposed && !failed) reveal()
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
      cancelReveal()
      runtime?.setPlaying(false)
      // Keep the context reusable; reduced motion displays the CSS artwork.
      if (motion.matches) {
        ready.value = false
        hasSnapshot.value = false
      }
      return
    }
    if (runtime) {
      runtime.setPlaying(true)
      // A new worker may still be preparing its first frame.
      if (runtime.isReady()) reveal()
    } else if (!preparing) void prepare()
  }
  function refreshLayout() {
    runtime?.resize()
  }
  function refreshAppearance() {
    restoreSnapshot()
    runtime?.refreshAppearance()
  }
  function motionChanged() {
    restoreSnapshot()
    sync()
  }
  watch(windowVisible, sync, { flush: 'sync' })
  onMounted(() => {
    if (!host.value) return
    restoreSnapshot()
    // An immediately preceding route may still be transferring its final worker frame.
    void seasonMeshSession.whenCaptured().then(() => {
      if (disposed) return
      restoreSnapshot()
      restoring = false
      sync()
    })
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
    motion.addEventListener('change', motionChanged)
  })
  onScopeDispose(() => {
    disposed = true
    revision++
    cancelReveal()
    intersection?.disconnect()
    resize?.disconnect()
    theme?.disconnect()
    window.removeEventListener('resize', refreshLayout)
    motion.removeEventListener('change', motionChanged)
    runtime?.dispose()
    runtime = undefined
    ready.value = false
    isIntersecting = false
  })
  return { ready, hasSnapshot }
}
