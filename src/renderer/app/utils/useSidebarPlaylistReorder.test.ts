import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, ref } from 'vue'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import { useSidebarPlaylistReorder } from './useSidebarPlaylistReorder'

function playlist(id: number, name: string): SidebarPlaylistItem {
  return {
    kind: 'playlist',
    id,
    name,
    viewMode: 'flat',
    sortOrder: id,
    trackCount: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

function pointerEvent(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    button: 0,
    pointerId: 1,
    clientX: 10,
    clientY: 10,
    preventDefault: vi.fn(),
    ...overrides,
  } as PointerEvent
}

function mountReorder(
  options: Parameters<typeof useSidebarPlaylistReorder>[0],
): ReturnType<typeof useSidebarPlaylistReorder> & { unmount: () => void } {
  const holder: { current: ReturnType<typeof useSidebarPlaylistReorder> | null } = {
    current: null,
  }
  const { createApp } = createRenderer({
    patchProp: () => undefined,
    insert: () => undefined,
    remove: () => undefined,
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    setText: () => undefined,
    setElementText: () => undefined,
    parentNode: () => null,
    nextSibling: () => null,
  })
  const app = createApp(
    defineComponent({
      setup() {
        holder.current = useSidebarPlaylistReorder(options)
        return () => null
      },
    }),
  )
  app.mount({})
  return { ...holder.current!, unmount: () => app.unmount() }
}

describe('useSidebarPlaylistReorder', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('starts a drag after the long-press delay and ignores a later click', () => {
    const playlistItems = ref([playlist(1, 'A'), playlist(2, 'B')])
    const reorder = mountReorder({
      playlistItems,
      persistOrder: vi.fn(),
      reload: vi.fn(),
    })

    reorder.onPointerDown(playlistItems.value[0], pointerEvent())
    expect(reorder.draggingPlaylistKey.value).toBeNull()
    expect(reorder.pressedPlaylistKey.value).toBe('playlist:1')

    vi.advanceTimersByTime(280)
    expect(reorder.draggingPlaylistKey.value).toBe('playlist:1')
    expect(reorder.shouldSuppressClick()).toBe(true)
  })

  it('cancels a pending long-press when the pointer moves too far', () => {
    const playlistItems = ref([playlist(1, 'A'), playlist(2, 'B')])
    const reorder = mountReorder({
      playlistItems,
      persistOrder: vi.fn(),
      reload: vi.fn(),
    })

    reorder.onPointerDown(playlistItems.value[0], pointerEvent())
    reorder.onPointerMove(pointerEvent({ clientX: 40, clientY: 10 }))
    vi.advanceTimersByTime(280)

    expect(reorder.draggingPlaylistKey.value).toBeNull()
    expect(reorder.pressedPlaylistKey.value).toBeNull()
  })

  it('persists a drop after a long-press drag', async () => {
    const playlistItems = ref([playlist(1, 'A'), playlist(2, 'B'), playlist(3, 'C')])
    const persistOrder = vi.fn(async (items: Array<{ kind: 'playlist' | 'smart'; id: number }>) =>
      items.map((item, index) => ({
        ...playlist(item.id, item.id === 1 ? 'A' : item.id === 2 ? 'B' : 'C'),
        sortOrder: index,
      })),
    )
    const reload = vi.fn()
    const reorder = mountReorder({
      playlistItems,
      persistOrder,
      reload,
    })

    const dropEl = {
      dataset: { sidebarPlaylistKey: 'playlist:3' },
      closest: () => dropEl,
      getBoundingClientRect: () => ({ top: 0, height: 40 }),
    }
    vi.stubGlobal('document', {
      elementFromPoint: () => dropEl,
    })

    reorder.onPointerDown(playlistItems.value[0], pointerEvent())
    vi.advanceTimersByTime(280)
    reorder.onPointerMove(pointerEvent({ clientY: 30 }))
    expect(reorder.dropTarget.value).toEqual({ key: 'playlist:3', position: 'after' })

    reorder.onPointerUp(pointerEvent())
    await Promise.resolve()

    expect(persistOrder).toHaveBeenCalledWith([
      { kind: 'playlist', id: 2 },
      { kind: 'playlist', id: 3 },
      { kind: 'playlist', id: 1 },
    ])
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads the sidebar list when persist fails', async () => {
    const playlistItems = ref([playlist(1, 'A'), playlist(2, 'B')])
    const persistOrder = vi.fn(async () => {
      throw new Error('unavailable')
    })
    const reload = vi.fn(async () => {
      playlistItems.value = [playlist(1, 'A'), playlist(2, 'B')]
    })
    const reorder = mountReorder({
      playlistItems,
      persistOrder,
      reload,
    })

    const dropEl = {
      dataset: { sidebarPlaylistKey: 'playlist:2' },
      closest: () => dropEl,
      getBoundingClientRect: () => ({ top: 0, height: 40 }),
    }
    vi.stubGlobal('document', {
      elementFromPoint: () => dropEl,
    })

    reorder.onPointerDown(playlistItems.value[0], pointerEvent())
    vi.advanceTimersByTime(280)
    reorder.onPointerMove(pointerEvent({ clientY: 30 }))
    reorder.onPointerUp(pointerEvent())
    await Promise.resolve()
    await Promise.resolve()

    expect(reload).toHaveBeenCalledTimes(1)
  })
})
