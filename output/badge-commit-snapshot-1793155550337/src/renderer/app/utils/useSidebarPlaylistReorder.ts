import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import {
  createSidebarPlaylistDragMotion,
  type SidebarPlaylistDropTarget,
} from './sidebarPlaylistDragMotion'

const LONG_PRESS_DELAY_MS = 280
const POINTER_MOVE_TOLERANCE = 6

function playlistKey(item: { kind: string; id: number }): string {
  return `${item.kind}:${item.id}`
}

function findPlaylistElementAtPoint(clientX: number, clientY: number): HTMLElement | null {
  return (
    globalThis.document
      ?.elementFromPoint?.(clientX, clientY)
      ?.closest<HTMLElement>('[data-sidebar-playlist-key]') ?? null
  )
}

export function useSidebarPlaylistReorder(options: {
  playlistItems: Ref<SidebarPlaylistItem[]>
  scrollContainer?: Ref<HTMLElement | null>
  playlistContainer?: Ref<HTMLElement | null>
  persistOrder: (
    items: Array<{ kind: SidebarPlaylistItem['kind']; id: number }>,
  ) => Promise<SidebarPlaylistItem[]>
  reload: () => Promise<void>
}) {
  const pressedPlaylistKey = ref<string | null>(null)
  const draggingPlaylistKey = ref<string | null>(null)
  const hiddenPlaylistKey = ref<string | null>(null)
  const dropTarget = ref<SidebarPlaylistDropTarget | null>(null)
  const isSaving = ref(false)
  const isSettling = ref(false)
  const isBusy = computed(() => isSaving.value || isSettling.value)
  const reorderError = ref<'save' | 'reload' | null>(null)
  const announcement = ref<{ name: string; position: number; total: number } | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null
  let suppressionTimer: ReturnType<typeof setTimeout> | null = null
  let pending: {
    key: string
    pointerId: number
    startX: number
    startY: number
    event: PointerEvent
    element: HTMLElement | null
    captured: boolean
  } | null = null
  let suppressedPointer: number | null = null
  let motion: ReturnType<typeof createSidebarPlaylistDragMotion> | null = null
  let visualRevision = 0
  let focusRevision = 0
  let dataRevision = 0
  let assigning = false
  let disposed = false
  let confirmedItems = options.playlistItems.value

  function assignItems(items: SidebarPlaylistItem[]): void {
    assigning = true
    try {
      options.playlistItems.value = items
    } finally {
      assigning = false
    }
  }

  watch(
    options.playlistItems,
    (items) => {
      if (assigning) return
      dataRevision += 1
      confirmedItems = items
      if (pending || isSettling.value) cancel(true)
    },
    { flush: 'sync' },
  )

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function releaseGesture(): void {
    clearTimer()
    const gesture = pending
    pending = null
    pressedPlaylistKey.value = draggingPlaylistKey.value = null
    dropTarget.value = null
    if (gesture?.captured && gesture.element?.hasPointerCapture(gesture.pointerId))
      gesture.element.releasePointerCapture(gesture.pointerId)
  }

  function clearClickSuppressionSoon(): void {
    if (suppressionTimer !== null) clearTimeout(suppressionTimer)
    suppressionTimer = setTimeout(() => {
      suppressedPointer = null
      suppressionTimer = null
    }, 0)
  }

  function settle(committed: boolean): void {
    const token = ++visualRevision
    isSettling.value = motion !== null && hiddenPlaylistKey.value !== null
    void (motion?.finish(committed) ?? Promise.resolve()).finally(() => {
      if (token !== visualRevision || disposed) return
      hiddenPlaylistKey.value = null
      isSettling.value = false
    })
  }

  function clearVisuals(): void {
    visualRevision += 1
    motion?.clear()
    hiddenPlaylistKey.value = null
    isSettling.value = false
  }

  function cancel(immediate = false): void {
    focusRevision += 1
    const wasDragging = draggingPlaylistKey.value !== null
    if (pending) suppressedPointer = pending.pointerId
    releaseGesture()
    if (immediate || !wasDragging) clearVisuals()
    else settle(false)
  }

  function onPointerDown(item: SidebarPlaylistItem, event: PointerEvent): void {
    if (event.button !== 0 || event.isPrimary === false) return
    cancel(true)
    if (suppressionTimer !== null) clearTimeout(suppressionTimer)
    suppressionTimer = null
    suppressedPointer = null
    if (isSaving.value) return
    reorderError.value = null
    const key = playlistKey(item)
    const target = event.currentTarget
    const element = target && 'setPointerCapture' in target ? (target as HTMLElement) : null
    pending = {
      key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      event,
      element,
      captured: false,
    }
    pressedPlaylistKey.value = key
    timer = setTimeout(() => {
      timer = null
      if (!pending || disposed) return
      if (motion && !motion.begin(key, pending.event)) {
        cancel(true)
        return
      }
      draggingPlaylistKey.value = key
      hiddenPlaylistKey.value = motion ? key : null
      suppressedPointer = pending.pointerId
      if (pending.element) {
        try {
          pending.element.setPointerCapture(pending.pointerId)
          pending.captured = true
        } catch {
          /* Release can race the hold timer. */
        }
      }
    }, LONG_PRESS_DELAY_MS)
  }

  function updateTarget(target: SidebarPlaylistDropTarget | null): void {
    if (dropTarget.value?.key === target?.key && dropTarget.value?.position === target?.position)
      return
    dropTarget.value = target
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pending || event.pointerId !== pending.pointerId) return
    if (event.buttons === 0) {
      cancel(true)
      clearClickSuppressionSoon()
      return
    }
    if (draggingPlaylistKey.value === null) {
      if (
        Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) >
        POINTER_MOVE_TOLERANCE
      )
        cancel(true)
      else pending.event = event
      return
    }
    event.preventDefault()
    if (motion) {
      motion.update(event)
      return
    }
    const element = findPlaylistElementAtPoint(event.clientX, event.clientY)
    const key = element?.dataset.sidebarPlaylistKey
    if (!element || !key || key === pending.key) {
      updateTarget(null)
      return
    }
    const bounds = element.getBoundingClientRect()
    updateTarget({
      key,
      position: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
    })
  }

  function nextOrder(
    sourceKey: string,
    target: SidebarPlaylistDropTarget | null,
  ): SidebarPlaylistItem[] | null {
    if (!target) return null
    const current = options.playlistItems.value
    const source = current.find((item) => playlistKey(item) === sourceKey)
    const next = current.filter((item) => playlistKey(item) !== sourceKey)
    const index = next.findIndex((item) => playlistKey(item) === target.key)
    if (!source || index < 0) return null
    next.splice(index + (target.position === 'after' ? 1 : 0), 0, source)
    return next.some((item, i) => playlistKey(item) !== playlistKey(current[i])) ? next : null
  }

  async function focusRow(key: string, token = focusRevision): Promise<void> {
    await nextTick()
    if (disposed || token !== focusRevision) return
    const row = Array.from(
      options.playlistContainer?.value?.querySelectorAll<HTMLElement>(
        '[data-sidebar-playlist-key]',
      ) ?? [],
    ).find((element) => element.dataset.sidebarPlaylistKey === key)
    row?.focus({ preventScroll: true })
    row?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
  }

  async function reloadConfirmed(error: 'save' | null): Promise<void> {
    releaseGesture()
    clearVisuals()
    try {
      await options.reload()
      if (!disposed) {
        confirmedItems = options.playlistItems.value
        reorderError.value = error
      }
    } catch {
      if (!disposed) {
        assignItems(confirmedItems)
        reorderError.value = 'reload'
      }
    }
  }

  async function saveOrder(
    next: SidebarPlaylistItem[],
    sourceKey: string,
    keyboard: boolean,
  ): Promise<void> {
    isSaving.value = true
    reorderError.value = null
    announcement.value = null
    const startedRevision = dataRevision
    const focusToken = focusRevision
    try {
      let saved: SidebarPlaylistItem[]
      try {
        saved = await options.persistOrder(next.map((item) => ({ kind: item.kind, id: item.id })))
      } catch {
        if (!disposed) await reloadConfirmed('save')
        return
      }
      if (disposed) return
      if (dataRevision !== startedRevision) {
        await reloadConfirmed(null)
        if (disposed || reorderError.value) return
      } else {
        assignItems(saved)
        confirmedItems = saved
      }
      const index = options.playlistItems.value.findIndex((item) => playlistKey(item) === sourceKey)
      if (index >= 0)
        announcement.value = {
          name: options.playlistItems.value[index].name,
          position: index + 1,
          total: options.playlistItems.value.length,
        }
    } finally {
      if (!disposed) {
        isSaving.value = false
        if (keyboard && focusToken === focusRevision) void focusRow(sourceKey, focusToken)
      }
    }
  }

  function onPointerUp(event: PointerEvent): void {
    if (!pending || event.pointerId !== pending.pointerId) {
      if (event.pointerId === suppressedPointer) clearClickSuppressionSoon()
      return
    }
    const key = pending.key
    const wasDragging = draggingPlaylistKey.value !== null
    const target = wasDragging && motion ? motion.flush(event) : dropTarget.value
    const next = wasDragging ? nextOrder(key, target) : null
    releaseGesture()
    if (wasDragging) {
      if (next) {
        assignItems(next)
        void saveOrder(next, key, false)
      }
      settle(next !== null)
      clearClickSuppressionSoon()
    }
  }

  function onPointerCancel(event: PointerEvent): void {
    if (!pending || event.pointerId !== pending.pointerId) return
    cancel(true)
    clearClickSuppressionSoon()
  }

  function shouldSuppressClick(event?: MouseEvent): boolean {
    if (event?.detail === 0) return false
    return suppressedPointer !== null || draggingPlaylistKey.value !== null
  }

  function canMove(item: SidebarPlaylistItem, direction: -1 | 1): boolean {
    const index = options.playlistItems.value.findIndex(
      (candidate) => playlistKey(candidate) === playlistKey(item),
    )
    return (
      !isBusy.value &&
      draggingPlaylistKey.value === null &&
      index >= 0 &&
      index + direction >= 0 &&
      index + direction < options.playlistItems.value.length
    )
  }

  function move(item: SidebarPlaylistItem, direction: -1 | 1): void {
    if (!canMove(item, direction)) return
    cancel(true)
    const key = playlistKey(item)
    const next = [...options.playlistItems.value]
    const index = next.findIndex((candidate) => playlistKey(candidate) === key)
    const neighbour = next[index + direction]
    next[index + direction] = next[index]
    next[index] = neighbour
    const token = ++visualRevision
    const mutate = () => assignItems(next)
    isSettling.value = motion !== null
    let animation: Promise<void>
    if (motion) animation = motion.reorderWithKeyboard([key, playlistKey(neighbour)], mutate)
    else {
      mutate()
      animation = Promise.resolve()
    }
    void animation.finally(() => {
      if (token === visualRevision && !disposed) isSettling.value = false
    })
    void focusRow(key)
    void saveOrder(next, key, true)
  }

  function onEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || (!pending && !isSettling.value)) return
    event.preventDefault()
    event.stopPropagation()
    cancel()
  }
  function onBlur(): void {
    cancel(true)
  }
  function onVisibilityChange(): void {
    if (document.hidden) cancel(true)
  }
  function onLostCapture(event: PointerEvent): void {
    if (pending?.pointerId === event.pointerId) cancel(true)
  }
  function onScroll(): void {
    motion?.onScroll()
  }

  onMounted(() => {
    if (options.scrollContainer && options.playlistContainer)
      motion = createSidebarPlaylistDragMotion({
        scrollContainer: options.scrollContainer,
        playlistContainer: options.playlistContainer,
        preference: createReducedMotionQuery(),
        onTarget: updateTarget,
      })
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('lostpointercapture', onLostCapture, true)
    window.addEventListener('keydown', onEscape, true)
    window.addEventListener('blur', onBlur)
    window.addEventListener('resize', onBlur)
    globalThis.document?.addEventListener?.('visibilitychange', onVisibilityChange)
    options.scrollContainer?.value?.addEventListener('scroll', onScroll, { passive: true })
  })

  onBeforeUnmount(() => {
    disposed = true
    cancel(true)
    motion?.dispose()
    if (suppressionTimer !== null) clearTimeout(suppressionTimer)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    window.removeEventListener('lostpointercapture', onLostCapture, true)
    window.removeEventListener('keydown', onEscape, true)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('resize', onBlur)
    globalThis.document?.removeEventListener?.('visibilitychange', onVisibilityChange)
    options.scrollContainer?.value?.removeEventListener('scroll', onScroll)
  })

  return {
    pressedPlaylistKey,
    draggingPlaylistKey,
    hiddenPlaylistKey,
    dropTarget,
    isSaving,
    isBusy,
    reorderError,
    announcement,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    shouldSuppressClick,
    canMove,
    move,
    cancel,
    reset: () => cancel(true),
  }
}
