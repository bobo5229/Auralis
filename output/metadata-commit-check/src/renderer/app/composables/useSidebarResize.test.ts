import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, nextTick, ref } from 'vue'
import { useSidebarLayout } from '@renderer/features/appearance/composables/useSidebarLayout'
import { useSidebarResize } from './useSidebarResize'

const storage = vi.hoisted(() => {
  const storage = { getItem: vi.fn(() => null), setItem: vi.fn() }
  vi.stubGlobal('localStorage', storage)
  return storage
})

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))

function pointer(type: string, clientX: number, overrides: object = {}): PointerEvent {
  return Object.assign(new Event(type, { cancelable: true }), {
    pointerId: 1,
    isPrimary: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX,
    ...overrides,
  }) as PointerEvent
}

function keyboard(key: string, shiftKey = false): KeyboardEvent {
  return Object.assign(new Event('keydown', { cancelable: true }), {
    key,
    shiftKey,
  }) as KeyboardEvent
}

const unmounts: Array<() => void> = []
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
let windowEvents: EventTarget

function flushFrame(): void {
  for (const [id, callback] of [...frames]) {
    frames.delete(id)
    callback(0)
  }
}

function mountResize(max = 480) {
  const disabled = ref(false)
  const maxWidth = ref(max)
  const onActiveChange = vi.fn()
  let resize!: ReturnType<typeof useSidebarResize>
  const renderer = createRenderer({
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
  const app = renderer.createApp(
    defineComponent({
      setup() {
        resize = useSidebarResize({ disabled, maxWidth, onActiveChange })
        return () => null
      },
    }),
  )
  app.mount({})
  const unmount = () => app.unmount()
  unmounts.push(unmount)
  let captured = false
  const handle = Object.assign(new EventTarget(), {
    focus: vi.fn(),
    setPointerCapture: vi.fn(() => {
      captured = true
    }),
    hasPointerCapture: () => captured,
    releasePointerCapture: vi.fn(() => {
      captured = false
    }),
  })
  function start(overrides: object = {}): void {
    const event = pointer('pointerdown', 260, overrides)
    Object.defineProperty(event, 'currentTarget', { value: handle })
    resize.onPointerDown(event)
  }
  return { ...resize, start, handle, disabled, maxWidth, onActiveChange, unmount }
}

describe('useSidebarResize', () => {
  beforeEach(() => {
    windowEvents = new EventTarget()
    vi.stubGlobal('window', windowEvents)
    vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }))
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback)
      return frameId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    useSidebarLayout().setSidebarWidth(260, false)
    storage.setItem.mockClear()
  })

  afterEach(() => {
    for (const unmount of unmounts.splice(0)) unmount()
    frames.clear()
    vi.unstubAllGlobals()
  })

  it('batches previews and persists the final pointer position only on release', async () => {
    const resize = mountResize()
    resize.start()
    windowEvents.dispatchEvent(pointer('pointermove', 300))
    windowEvents.dispatchEvent(pointer('pointermove', 340))
    expect(frames.size).toBe(1)
    expect(resize.width.value).toBe(260)
    flushFrame()
    expect(resize.width.value).toBe(340)
    expect(storage.setItem).not.toHaveBeenCalled()
    windowEvents.dispatchEvent(pointer('pointerup', 352))
    expect(resize.width.value).toBe(352)
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith('auralis-sidebar-width', '352')
    expect(resize.handle.releasePointerCapture).toHaveBeenCalledWith(1)
    await nextTick()
    expect(resize.onActiveChange.mock.calls).toEqual([[true], [false]])
  })

  it('uses the release position when returning to the start within one frame', () => {
    const resize = mountResize()
    resize.start()
    windowEvents.dispatchEvent(pointer('pointermove', 340))
    windowEvents.dispatchEvent(pointer('pointerup', 260))
    flushFrame()
    expect(resize.width.value).toBe(260)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each(['pointercancel', 'blur', 'lostpointercapture', 'Escape', 'disabled', 'unmount'])(
    'restores the saved width and removes pending work on %s',
    async (reason) => {
      const resize = mountResize()
      resize.start()
      windowEvents.dispatchEvent(pointer('pointermove', 340))
      flushFrame()
      windowEvents.dispatchEvent(pointer('pointermove', 360))
      if (reason === 'disabled') resize.disabled.value = true
      else if (reason === 'unmount') {
        unmounts.splice(unmounts.indexOf(resize.unmount), 1)
        resize.unmount()
      } else if (reason === 'lostpointercapture') resize.handle.dispatchEvent(new Event(reason))
      else if (reason === 'Escape') windowEvents.dispatchEvent(keyboard('Escape'))
      else windowEvents.dispatchEvent(pointer(reason, 360))
      flushFrame()
      windowEvents.dispatchEvent(pointer('pointerup', 360))
      expect(useSidebarLayout().sidebarWidth.value).toBe(260)
      expect(storage.setItem).not.toHaveBeenCalled()
      expect(frames.size).toBe(0)
      await nextTick()
      expect(resize.onActiveChange).toHaveBeenLastCalledWith(false)
    },
  )

  it('clamps dragging and keyboard changes, resets, and preserves a window-limited preference', () => {
    const resize = mountResize(400)
    resize.start()
    windowEvents.dispatchEvent(pointer('pointermove', 1000))
    flushFrame()
    expect(resize.width.value).toBe(400)
    windowEvents.dispatchEvent(pointer('pointerup', 0))
    expect(resize.width.value).toBe(240)
    resize.onKeyDown(keyboard('ArrowRight'))
    expect(resize.width.value).toBe(248)
    resize.onKeyDown(keyboard('ArrowRight', true))
    expect(resize.width.value).toBe(280)
    resize.onKeyDown(keyboard('End'))
    expect(resize.width.value).toBe(400)
    resize.maxWidth.value = 320
    expect(resize.width.value).toBe(320)
    expect(useSidebarLayout().sidebarWidth.value).toBe(400)
    resize.maxWidth.value = 480
    expect(resize.width.value).toBe(400)
    resize.onKeyDown(keyboard('Home'))
    expect(resize.width.value).toBe(240)
    resize.resetWidth()
    expect(resize.width.value).toBe(260)
  })

  it.each<[string, boolean]>([
    ['ArrowRight', false],
    ['ArrowRight', true],
    ['End', false],
  ])(
    'preserves a window-limited preference when %s (Shift=%s) cannot move the edge',
    (key, shift) => {
      const resize = mountResize(320)
      useSidebarLayout().setSidebarWidth(400)
      storage.setItem.mockClear()
      const event = keyboard(key, shift)

      resize.onKeyDown(event)

      expect(event.defaultPrevented).toBe(true)
      expect(resize.width.value).toBe(320)
      expect(useSidebarLayout().sidebarWidth.value).toBe(400)
      expect(storage.setItem).not.toHaveBeenCalled()
      expect(resize.onActiveChange).not.toHaveBeenCalled()
      resize.maxWidth.value = 480
      expect(resize.width.value).toBe(400)
    },
  )

  it.each<[string, boolean, number]>([
    ['ArrowLeft', false, 312],
    ['ArrowLeft', true, 288],
    ['Home', false, 240],
  ])(
    'persists a visible change with %s (Shift=%s) from a window-limited edge',
    (key, shift, expected) => {
      const resize = mountResize(320)
      useSidebarLayout().setSidebarWidth(400)
      storage.setItem.mockClear()

      resize.onKeyDown(keyboard(key, shift))

      expect(resize.width.value).toBe(expected)
      expect(useSidebarLayout().sidebarWidth.value).toBe(expected)
      expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(
        'auralis-sidebar-width',
        String(expected),
      )
      resize.maxWidth.value = 480
      expect(resize.width.value).toBe(expected)
    },
  )

  it('still saves an explicit reset when the visible edge already equals the default', () => {
    const resize = mountResize(260)
    useSidebarLayout().setSidebarWidth(400)
    storage.setItem.mockClear()
    expect(resize.width.value).toBe(260)

    resize.resetWidth()

    expect(useSidebarLayout().sidebarWidth.value).toBe(260)
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith('auralis-sidebar-width', '260')
    resize.maxWidth.value = 480
    expect(resize.width.value).toBe(260)
  })

  it('ignores secondary pointers, right clicks, and disabled gestures', () => {
    const resize = mountResize()
    resize.start({ isPrimary: false })
    resize.start({ button: 2 })
    resize.disabled.value = true
    resize.start()
    resize.onKeyDown(keyboard('End'))
    resize.resetWidth()
    expect(resize.handle.setPointerCapture).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})
