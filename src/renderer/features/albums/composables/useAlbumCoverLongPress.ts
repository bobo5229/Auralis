import { onBeforeUnmount, onDeactivated, ref, watch, type Ref } from 'vue'

/** Listen globally only during a press; virtualization and KeepAlive can detach the cover. */
export function useAlbumCoverLongPress(
  enabled: Ref<boolean>,
  trigger: (cover: HTMLElement) => void,
) {
  const holding = ref(false)
  let frame: number | null = null
  let press: { id: number; x: number; y: number; start: number; cover: HTMLElement } | null = null
  let suppressClick = false

  function cancel(): void {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    press = null
    holding.value = false
    if (typeof window === 'undefined') return
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onEnd, true)
    window.removeEventListener('pointercancel', onEnd, true)
    window.removeEventListener('wheel', interrupt, true)
    window.removeEventListener('scroll', interrupt, true)
    window.removeEventListener('blur', interrupt)
    window.removeEventListener('keydown', onKey, true)
  }

  function interrupt(): void {
    if (press) suppressClick = true
    cancel()
  }

  function onMove(event: PointerEvent): void {
    if (press?.id !== event.pointerId) return
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 9) interrupt()
  }

  function onEnd(event: PointerEvent): void {
    if (press?.id !== event.pointerId) return
    if (event.type === 'pointercancel') suppressClick = true
    cancel()
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') interrupt()
  }

  function start(event: PointerEvent): void {
    cancel()
    suppressClick = false
    if (!enabled.value || event.button !== 0 || !event.isPrimary) return
    const cover = event.currentTarget
    if (!(cover instanceof HTMLElement)) return
    const current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: performance.now(),
      cover,
    }
    press = current
    holding.value = true
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onEnd, true)
    window.addEventListener('pointercancel', onEnd, true)
    window.addEventListener('wheel', interrupt, { capture: true, passive: true })
    window.addEventListener('scroll', interrupt, { capture: true, passive: true })
    window.addEventListener('blur', interrupt)
    window.addEventListener('keydown', onKey, true)
    const tick = (now: number): void => {
      if (press !== current) return
      if (!enabled.value || !cover.isConnected) return interrupt()
      if (now - current.start < 500) {
        frame = requestAnimationFrame(tick)
        return
      }
      suppressClick = true
      cancel()
      trigger(cover)
    }
    frame = requestAnimationFrame(tick)
  }

  function consumeClick(event?: MouseEvent): boolean {
    if (!suppressClick || (event?.type === 'click' && event.detail === 0)) return false
    suppressClick = false
    event?.preventDefault()
    return true
  }

  watch(
    enabled,
    (allowed) => {
      if (!allowed) interrupt()
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(cancel)
  onDeactivated(cancel)
  return { holding, start, cancel, consumeClick }
}
