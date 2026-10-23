import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'

export interface PanelResizeOptions {
  preferredWidth: Readonly<Ref<number>>
  width: Readonly<Ref<number>>
  minWidth: number
  /** +1 for a left pane's right edge, -1 for a right pane's left edge. */
  direction: 1 | -1
  setWidth: (width: number, persist?: boolean) => void
  resetPreference: () => void
  disabled: Readonly<Ref<boolean>>
  maxWidth: Readonly<Ref<number>>
  onActiveChange: (active: boolean) => void
}

/** Follows VS Code Sash interaction; the existing Shell grid remains the layout owner.
 * Reference: https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/sash/sash.ts
 */
export function usePanelResize(options: PanelResizeOptions) {
  const { preferredWidth, width, setWidth } = options
  const isResizing = ref(false)

  function clampWidth(value: number): number {
    return Math.round(Math.max(options.minWidth, Math.min(options.maxWidth.value, value)))
  }
  let drag: {
    pointerId: number
    handle: HTMLElement
    startX: number
    startWidth: number
    savedWidth: number
    pendingWidth: number | null
  } | null = null
  let frame: number | null = null
  let activityRevision = 0

  function activate(): void {
    activityRevision += 1
    options.onActiveChange(true)
  }

  function deactivate(): void {
    const revision = ++activityRevision
    // Commit final geometry with transitions still disabled before restoring them.
    void nextTick(() => {
      if (revision === activityRevision) options.onActiveChange(false)
    })
  }

  function flushWidth(): void {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    if (!drag || drag.pendingWidth === null) return
    if (drag.pendingWidth !== width.value) setWidth(drag.pendingWidth, false)
    drag.pendingWidth = null
  }

  function finish(commit: boolean): void {
    const current = drag
    if (!current) return
    if (commit) flushWidth()
    else if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    drag = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    window.removeEventListener('keydown', onDragKeyDown, true)
    window.removeEventListener('blur', cancel)
    window.removeEventListener('resize', cancel)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    current.handle.removeEventListener('lostpointercapture', cancel)
    if (current.handle.hasPointerCapture(current.pointerId)) {
      current.handle.releasePointerCapture(current.pointerId)
    }
    // Returning to the starting edge also restores an automatic or window-limited preference.
    if (!commit || width.value === current.startWidth) setWidth(current.savedWidth, false)
    else setWidth(width.value)
    isResizing.value = false
    deactivate()
  }

  function cancel(): void {
    finish(false)
  }

  function onVisibilityChange(): void {
    if (document.hidden) cancel()
  }

  function onDragKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    cancel()
  }

  function onPointerMove(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return
    if (event.buttons === 0) {
      cancel()
      return
    }
    event.preventDefault()
    drag.pendingWidth = clampWidth(
      drag.startWidth + (event.clientX - drag.startX) * options.direction,
    )
    if (frame === null) frame = requestAnimationFrame(flushWidth)
  }

  function onPointerUp(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return
    // Capture the release position even if no final pointermove was delivered.
    drag.pendingWidth = clampWidth(
      drag.startWidth + (event.clientX - drag.startX) * options.direction,
    )
    finish(true)
  }

  function onPointerCancel(event: PointerEvent): void {
    if (event.pointerId === drag?.pointerId) cancel()
  }

  function onPointerDown(event: PointerEvent): void {
    if (options.disabled.value || drag || event.button !== 0 || !event.isPrimary) return
    const handle = event.currentTarget as HTMLElement
    event.preventDefault()
    event.stopPropagation()
    try {
      handle.setPointerCapture(event.pointerId)
    } catch {
      return
    }
    handle.focus({ preventScroll: true })
    drag = {
      pointerId: event.pointerId,
      handle,
      startX: event.clientX,
      startWidth: width.value,
      savedWidth: preferredWidth.value,
      pendingWidth: null,
    }
    isResizing.value = true
    activate()
    handle.addEventListener('lostpointercapture', cancel)
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('keydown', onDragKeyDown, true)
    window.addEventListener('blur', cancel)
    window.addEventListener('resize', cancel)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  function changeWidth(next: number): void {
    if (options.disabled.value || drag) return
    activate()
    setWidth(clampWidth(next))
    deactivate()
  }

  function resetWidth(): void {
    if (options.disabled.value || drag) return
    activate()
    options.resetPreference()
    deactivate()
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (options.disabled.value || drag || event.altKey || event.ctrlKey || event.metaKey) return
    const step = event.shiftKey ? 32 : 8
    let next: number
    switch (event.key) {
      case 'ArrowLeft':
        next = width.value - step * options.direction
        break
      case 'ArrowRight':
        next = width.value + step * options.direction
        break
      case 'Home':
        next = options.minWidth
        break
      case 'End':
        next = options.maxWidth.value
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
    // A key that cannot move the visible edge must preserve a wider saved preference.
    const nextWidth = clampWidth(next)
    if (nextWidth !== width.value) changeWidth(nextWidth)
  }

  watch(
    options.disabled,
    (disabled) => {
      if (disabled) cancel()
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(() => {
    cancel()
    activityRevision += 1
    options.onActiveChange(false)
  })

  return { width, isResizing, onPointerDown, onKeyDown, resetWidth, cancel }
}
