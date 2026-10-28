import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, nextTick, ref, shallowRef } from 'vue'
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

const mountedApps: Array<() => void> = []

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
  mountedApps.push(() => app.unmount())
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
    for (const unmount of mountedApps.splice(0)) unmount()
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

  function fireWindow(type: string, event: unknown = {}): void {
    const listener = vi
      .mocked(window.addEventListener)
      .mock.calls.find((call) => call[0] === type)?.[1]
    expect(listener).toBeTypeOf('function')
    ;(listener as (event: unknown) => void)(event)
  }

  async function flush(): Promise<void> {
    await nextTick()
    await nextTick()
    await nextTick()
  }

  function pointAt(key: string, position: 'before' | 'after' = 'after'): void {
    const element = {
      dataset: { sidebarPlaylistKey: key },
      closest: () => element,
      getBoundingClientRect: () => ({ top: position === 'before' ? 20 : 0, height: 40 }),
    }
    vi.stubGlobal('document', { elementFromPoint: () => element })
  }

  it.each(['keydown', 'blur', 'resize', 'lostpointercapture'])(
    'cancels on %s without committing the later release',
    async (type) => {
      const playlistItems = ref([playlist(1, 'A'), playlist(2, 'B'), playlist(3, 'C')])
      const persistOrder = vi.fn(async () => playlistItems.value)
      const reorder = mountReorder({ playlistItems, persistOrder, reload: vi.fn() })
      pointAt('playlist:3')
      reorder.onPointerDown(playlistItems.value[0], pointerEvent())
      vi.advanceTimersByTime(280)
      reorder.onPointerMove(pointerEvent({ clientY: 30 }))
      fireWindow(type, {
        key: 'Escape',
        pointerId: 1,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      })
      expect(reorder.draggingPlaylistKey.value).toBeNull()
      expect(reorder.dropTarget.value).toBeNull()
      expect(reorder.shouldSuppressClick(pointerEvent({ detail: 1 }))).toBe(true)
      expect(reorder.shouldSuppressClick(pointerEvent({ detail: 0 }))).toBe(false)
      reorder.onPointerUp(pointerEvent())
      vi.advanceTimersByTime(0)
      await flush()
      expect(persistOrder).not.toHaveBeenCalled()
      expect(playlistItems.value.map((item) => item.id)).toEqual([1, 2, 3])
      expect(reorder.shouldSuppressClick()).toBe(false)
    },
  )

  it('cancels a pending hold and restores the next ordinary click after cancellation', () => {
    const playlistItems = ref([playlist(1, 'A'), playlist(2, 'B')])
    const reorder = mountReorder({ playlistItems, persistOrder: vi.fn(), reload: vi.fn() })
    reorder.onPointerDown(playlistItems.value[0], pointerEvent())
    fireWindow('blur')
    vi.advanceTimersByTime(280)
    expect(reorder.pressedPlaylistKey.value).toBeNull()
    expect(reorder.draggingPlaylistKey.value).toBeNull()
    expect(reorder.shouldSuppressClick(pointerEvent({ detail: 1 }))).toBe(true)
    reorder.onPointerUp(pointerEvent())
    expect(reorder.shouldSuppressClick(pointerEvent({ detail: 1 }))).toBe(true)
    vi.advanceTimersByTime(0)
    expect(reorder.shouldSuppressClick(pointerEvent({ detail: 1 }))).toBe(false)
    reorder.onPointerDown(playlistItems.value[0], pointerEvent())
    vi.advanceTimersByTime(280)
    reorder.cancel(true)
    reorder.onPointerDown(playlistItems.value[1], pointerEvent())
    expect(reorder.shouldSuppressClick(pointerEvent({ detail: 1 }))).toBe(false)
  })

  it('cancels when the document becomes hidden', () => {
    const addEventListener = vi.fn()
    vi.stubGlobal('document', { hidden: true, addEventListener, removeEventListener: vi.fn() })
    const playlistItems = ref([playlist(1, 'A')])
    const reorder = mountReorder({ playlistItems, persistOrder: vi.fn(), reload: vi.fn() })
    reorder.onPointerDown(playlistItems.value[0], pointerEvent())
    vi.advanceTimersByTime(280)
    addEventListener.mock.calls.find((call) => call[0] === 'visibilitychange')![1]()
    expect(reorder.draggingPlaylistKey.value).toBeNull()
  })

  it('does not persist a no-op, missing target or cancelled pointer', async () => {
    const playlistItems = ref([playlist(1, 'A'), playlist(2, 'B')])
    const persistOrder = vi.fn()
    const reorder = mountReorder({ playlistItems, persistOrder, reload: vi.fn() })
    pointAt('playlist:2', 'before')
    reorder.onPointerDown(playlistItems.value[0], pointerEvent())
    vi.advanceTimersByTime(280)
    reorder.onPointerMove(pointerEvent({ clientY: 30 }))
    reorder.onPointerUp(pointerEvent())
    await flush()
    expect(persistOrder).not.toHaveBeenCalled()
    reorder.onPointerDown(playlistItems.value[0], pointerEvent())
    vi.advanceTimersByTime(280)
    reorder.onPointerUp(pointerEvent())
    reorder.onPointerDown(playlistItems.value[0], pointerEvent())
    vi.advanceTimersByTime(280)
    reorder.onPointerCancel(pointerEvent())
    reorder.onPointerUp(pointerEvent())
    expect(persistOrder).not.toHaveBeenCalled()
  })

  it('ignores another pointer and clears a drag if the button was released elsewhere', () => {
    const playlistItems = ref([playlist(1, 'A'), playlist(2, 'B')])
    const reorder = mountReorder({ playlistItems, persistOrder: vi.fn(), reload: vi.fn() })
    reorder.onPointerDown(playlistItems.value[0], pointerEvent({ isPrimary: false }))
    expect(reorder.pressedPlaylistKey.value).toBeNull()
    reorder.onPointerDown(playlistItems.value[0], pointerEvent())
    vi.advanceTimersByTime(280)
    reorder.onPointerCancel(pointerEvent({ pointerId: 2 }))
    expect(reorder.draggingPlaylistKey.value).toBe('playlist:1')
    reorder.onPointerMove(pointerEvent({ buttons: 0 }))
    expect(reorder.draggingPlaylistKey.value).toBeNull()
  })

  it('moves mixed playlist kinds with equal numeric IDs and announces the confirmed position', async () => {
    const smart = { ...playlist(1, 'Smart A'), kind: 'smart' as const }
    const playlistItems = ref([playlist(1, 'A'), smart, playlist(2, 'B')])
    const saved = [smart, playlist(1, 'A'), playlist(2, 'B')]
    const persistOrder = vi.fn(async () => saved)
    const reorder = mountReorder({ playlistItems, persistOrder, reload: vi.fn() })
    expect(reorder.canMove(playlistItems.value[0], -1)).toBe(false)
    expect(reorder.canMove(playlistItems.value[2], 1)).toBe(false)
    reorder.move(smart, -1)
    expect(playlistItems.value.map((item) => `${item.kind}:${item.id}`)).toEqual([
      'smart:1',
      'playlist:1',
      'playlist:2',
    ])
    await flush()
    expect(persistOrder).toHaveBeenCalledWith([
      { kind: 'smart', id: 1 },
      { kind: 'playlist', id: 1 },
      { kind: 'playlist', id: 2 },
    ])
    expect(reorder.announcement.value).toEqual({ name: 'Smart A', position: 1, total: 3 })
  })

  it('locks sorting until a pending save completes and keeps keyboard focus', async () => {
    let resolveSave!: (items: SidebarPlaylistItem[]) => void
    const persistOrder = vi.fn(
      () =>
        new Promise<SidebarPlaylistItem[]>((resolve) => {
          resolveSave = resolve
        }),
    )
    const playlistItems = ref([playlist(1, 'A'), playlist(2, 'B')])
    const row = {
      dataset: { sidebarPlaylistKey: 'playlist:1' },
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    }
    const list = shallowRef({ querySelectorAll: () => [row] } as unknown as HTMLElement)
    const reorder = mountReorder({
      playlistItems,
      playlistContainer: list,
      persistOrder,
      reload: vi.fn(),
    })
    reorder.move(playlistItems.value[0], 1)
    await flush()
    expect(row.focus).toHaveBeenCalledWith({ preventScroll: true })
    reorder.move(playlistItems.value[0], 1)
    reorder.onPointerDown(playlistItems.value[0], pointerEvent())
    expect(reorder.pressedPlaylistKey.value).toBeNull()
    expect(reorder.isSaving.value).toBe(true)
    expect(persistOrder).toHaveBeenCalledTimes(1)
    await flush()
    row.focus.mockClear()
    resolveSave(playlistItems.value)
    await flush()
    expect(reorder.isBusy.value).toBe(false)
    expect(reorder.canMove(playlistItems.value[1], -1)).toBe(true)
    expect(row.focus).not.toHaveBeenCalled()
  })

  it('restores the confirmed order and releases the lock when save and reload both fail', async () => {
    const original = [playlist(1, 'A'), playlist(2, 'B')]
    const playlistItems = ref(original)
    const persistOrder = vi.fn(async () => {
      throw Error('save failed')
    })
    let rejectReload!: (cause: Error) => void
    const reload = vi.fn(() => new Promise<void>((_resolve, reject) => (rejectReload = reject)))
    const row = {
      dataset: { sidebarPlaylistKey: 'playlist:1' },
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    }
    const playlistContainer = shallowRef({
      querySelectorAll: () => [row],
    } as unknown as HTMLElement)
    const reorder = mountReorder({ playlistItems, playlistContainer, persistOrder, reload })
    reorder.move(playlistItems.value[0], 1)
    await flush()
    expect(reorder.isSaving.value).toBe(true)
    row.focus.mockClear()
    rejectReload(Error('reload failed'))
    await flush()
    expect(playlistItems.value.map((item) => item.id)).toEqual([1, 2])
    expect(reorder.reorderError.value).toBe('reload')
    expect(reorder.isBusy.value).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(row.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('cancels a gesture when the list is externally refreshed', () => {
    const playlistItems = ref([playlist(1, 'A'), playlist(2, 'B')])
    const persistOrder = vi.fn()
    const reorder = mountReorder({ playlistItems, persistOrder, reload: vi.fn() })
    reorder.onPointerDown(playlistItems.value[0], pointerEvent())
    vi.advanceTimersByTime(280)
    playlistItems.value = [playlist(1, 'A'), playlist(2, 'B'), playlist(3, 'C')]
    expect(reorder.draggingPlaylistKey.value).toBeNull()
    reorder.onPointerUp(pointerEvent())
    expect(persistOrder).not.toHaveBeenCalled()
  })

  it('reloads after an intervening refresh instead of applying an obsolete response', async () => {
    let resolveSave!: (items: SidebarPlaylistItem[]) => void
    const playlistItems = ref([playlist(1, 'A'), playlist(2, 'B')])
    const persistOrder = vi.fn(
      () =>
        new Promise<SidebarPlaylistItem[]>((resolve) => {
          resolveSave = resolve
        }),
    )
    const latest = [playlist(3, 'New'), playlist(2, 'B'), playlist(1, 'A')]
    const reload = vi.fn(async () => {
      playlistItems.value = latest
    })
    const reorder = mountReorder({ playlistItems, persistOrder, reload })
    reorder.move(playlistItems.value[0], 1)
    playlistItems.value = [playlist(3, 'New'), playlist(1, 'A'), playlist(2, 'B')]
    resolveSave([playlist(2, 'B'), playlist(1, 'A')])
    await flush()
    expect(playlistItems.value.map((item) => item.id)).toEqual([3, 2, 1])
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reorder.reorderError.value).toBeNull()
    expect(reorder.announcement.value).toEqual({ name: 'A', position: 3, total: 3 })
  })

  it('does not apply a late response or restart a hold after unmount', async () => {
    let resolveSave!: (items: SidebarPlaylistItem[]) => void
    const playlistItems = ref([playlist(1, 'A'), playlist(2, 'B')])
    const persistOrder = vi.fn(
      () =>
        new Promise<SidebarPlaylistItem[]>((resolve) => {
          resolveSave = resolve
        }),
    )
    const reorder = mountReorder({ playlistItems, persistOrder, reload: vi.fn() })
    reorder.move(playlistItems.value[0], 1)
    reorder.unmount()
    resolveSave([playlist(1, 'Obsolete')])
    await flush()
    expect(playlistItems.value.map((item) => item.name)).toEqual(['B', 'A'])
    expect(reorder.announcement.value).toBeNull()
  })
})
