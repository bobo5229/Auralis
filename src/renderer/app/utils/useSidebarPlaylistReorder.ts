import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { SidebarPlaylistItem } from '@shared/types/playlist'

const LONG_PRESS_DELAY_MS = 280
const POINTER_MOVE_TOLERANCE = 6

function playlistKey(item: { kind: string; id: number }): string {
  return `${item.kind}:${item.id}`
}

function findPlaylistElementAtPoint(clientX: number, clientY: number): HTMLElement | null {
  const node = globalThis.document?.elementFromPoint?.(clientX, clientY) as
    | { closest?: (selector: string) => HTMLElement | null }
    | null
    | undefined
  return node?.closest?.('[data-sidebar-playlist-key]') ?? null
}

export function useSidebarPlaylistReorder(options: {
  playlistItems: Ref<SidebarPlaylistItem[]>
  persistOrder: (
    items: Array<{ kind: SidebarPlaylistItem['kind']; id: number }>,
  ) => Promise<SidebarPlaylistItem[]>
  reload: () => Promise<void>
}): {
  pressedPlaylistKey: Ref<string | null>
  draggingPlaylistKey: Ref<string | null>
  dropTarget: Ref<{ key: string; position: 'before' | 'after' } | null>
  onPointerDown: (item: SidebarPlaylistItem, event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
  onPointerCancel: (event: PointerEvent) => void
  shouldSuppressClick: () => boolean
  reset: () => void
} {
  const pressedPlaylistKey = ref<string | null>(null)
  const draggingPlaylistKey = ref<string | null>(null)
  const dropTarget = ref<{ key: string; position: 'before' | 'after' } | null>(null)
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let pendingDrag: {
    playlistKey: string
    pointerId: number
    startX: number
    startY: number
  } | null = null
  let suppressPlaylistClick = false

  function clearLongPressTimer(): void {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  function reset(): void {
    clearLongPressTimer()
    pendingDrag = null
    pressedPlaylistKey.value = null
    draggingPlaylistKey.value = null
    dropTarget.value = null
  }

  function onPointerDown(item: SidebarPlaylistItem, event: PointerEvent): void {
    if (event.button !== 0) return

    reset()
    const key = playlistKey(item)
    pendingDrag = {
      playlistKey: key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }
    pressedPlaylistKey.value = key
    longPressTimer = setTimeout(() => {
      if (!pendingDrag) return
      draggingPlaylistKey.value = pendingDrag.playlistKey
      suppressPlaylistClick = true
      longPressTimer = null
    }, LONG_PRESS_DELAY_MS)
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pendingDrag || event.pointerId !== pendingDrag.pointerId) return

    if (draggingPlaylistKey.value === null) {
      const distance = Math.hypot(
        event.clientX - pendingDrag.startX,
        event.clientY - pendingDrag.startY,
      )
      if (distance > POINTER_MOVE_TOLERANCE) {
        reset()
      }
      return
    }

    event.preventDefault()
    const element = findPlaylistElementAtPoint(event.clientX, event.clientY)
    if (!element) {
      dropTarget.value = null
      return
    }

    const targetKey = element.dataset.sidebarPlaylistKey
    if (!targetKey || targetKey === draggingPlaylistKey.value) {
      dropTarget.value = null
      return
    }

    const bounds = element.getBoundingClientRect()
    dropTarget.value = {
      key: targetKey,
      position: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
    }
  }

  async function persistDrop(): Promise<void> {
    const sourceKey = draggingPlaylistKey.value
    const target = dropTarget.value
    if (sourceKey === null || !target) return

    const items = options.playlistItems.value
    const next = items.filter((item) => playlistKey(item) !== sourceKey)
    const source = items.find((item) => playlistKey(item) === sourceKey)
    const targetIndex = next.findIndex((item) => playlistKey(item) === target.key)
    if (!source || targetIndex < 0) return

    next.splice(targetIndex + (target.position === 'after' ? 1 : 0), 0, source)
    options.playlistItems.value = next

    try {
      options.playlistItems.value = await options.persistOrder(
        next.map((item) => ({ kind: item.kind, id: item.id })),
      )
    } catch {
      await options.reload()
    }
  }

  function onPointerUp(event: PointerEvent): void {
    if (!pendingDrag || event.pointerId !== pendingDrag.pointerId) return
    const wasDragging = draggingPlaylistKey.value !== null
    if (wasDragging) void persistDrop()
    reset()

    if (wasDragging) {
      setTimeout(() => {
        suppressPlaylistClick = false
      })
    }
  }

  function onPointerCancel(event: PointerEvent): void {
    if (!pendingDrag || event.pointerId !== pendingDrag.pointerId) return
    const wasDragging = draggingPlaylistKey.value !== null
    reset()
    if (wasDragging) {
      setTimeout(() => {
        suppressPlaylistClick = false
      })
    }
  }

  function shouldSuppressClick(): boolean {
    return suppressPlaylistClick || draggingPlaylistKey.value !== null
  }

  onMounted(() => {
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  })

  onBeforeUnmount(() => {
    reset()
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
  })

  return {
    pressedPlaylistKey,
    draggingPlaylistKey,
    dropTarget,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    shouldSuppressClick,
    reset,
  }
}
