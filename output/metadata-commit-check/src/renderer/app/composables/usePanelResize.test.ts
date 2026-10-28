import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createRenderer, defineComponent, ref } from 'vue'
import { usePanelResize } from './usePanelResize'

function pointer(type: string, clientX: number): PointerEvent {
  return Object.assign(new Event(type, { cancelable: true }), {
    pointerId: 1,
    isPrimary: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX,
  }) as PointerEvent
}

function keyboard(key: string): KeyboardEvent {
  return Object.assign(new Event('keydown', { cancelable: true }), { key }) as KeyboardEvent
}

const unmounts: Array<() => void> = []
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
let windowEvents: EventTarget

function flushFrames(): void {
  for (const [id, callback] of [...frames]) {
    frames.delete(id)
    callback(0)
  }
}

function mountRightPane(preference = 0, limit = 640) {
  const preferredWidth = ref(preference)
  const automaticWidth = ref(320)
  const maxWidth = ref(limit)
  const disabled = ref(false)
  const width = computed(() =>
    Math.max(240, Math.min(maxWidth.value, preferredWidth.value || automaticWidth.value)),
  )
  const persist = vi.fn()
  function setWidth(value: number, save = true): void {
    preferredWidth.value = value
    if (save) persist(value)
  }
  let pane!: ReturnType<typeof usePanelResize>
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
        pane = usePanelResize({
          preferredWidth,
          width,
          minWidth: 240,
          maxWidth,
          direction: -1,
          disabled,
          setWidth,
          resetPreference: () => setWidth(0),
          onActiveChange: vi.fn(),
        })
        return () => null
      },
    }),
  )
  app.mount({})
  unmounts.push(() => app.unmount())
  const handle = Object.assign(new EventTarget(), {
    focus: vi.fn(),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
  })
  function start(): void {
    const event = pointer('pointerdown', 800)
    Object.defineProperty(event, 'currentTarget', { value: handle })
    pane.onPointerDown(event)
  }
  return { ...pane, preferredWidth, automaticWidth, maxWidth, disabled, persist, start }
}

describe('usePanelResize right-hand panel', () => {
  beforeEach(() => {
    windowEvents = new EventTarget()
    vi.stubGlobal('window', windowEvents)
    vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }))
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback)
      return frameId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  })

  afterEach(() => {
    for (const unmount of unmounts.splice(0)) unmount()
    frames.clear()
    vi.unstubAllGlobals()
  })

  it('widens to the left and saves the final position once', () => {
    const pane = mountRightPane()
    pane.start()
    windowEvents.dispatchEvent(pointer('pointermove', 760))
    flushFrames()
    expect(pane.width.value).toBe(360)
    expect(pane.persist).not.toHaveBeenCalled()
    windowEvents.dispatchEvent(pointer('pointerup', 752))
    expect(pane.width.value).toBe(368)
    expect(pane.persist).toHaveBeenCalledExactlyOnceWith(368)
  })

  it.each(['ArrowLeft', 'End'])(
    'preserves a window-limited preference when %s cannot move the edge',
    (key) => {
      const pane = mountRightPane(560, 400)
      pane.onKeyDown(keyboard(key))
      expect(pane.width.value).toBe(400)
      expect(pane.preferredWidth.value).toBe(560)
      expect(pane.persist).not.toHaveBeenCalled()
      pane.maxWidth.value = 640
      expect(pane.width.value).toBe(560)
    },
  )

  it('also preserves the saved preference when dragging outward against a window limit', () => {
    const pane = mountRightPane(560, 400)
    pane.start()
    windowEvents.dispatchEvent(pointer('pointermove', 740))
    flushFrames()
    windowEvents.dispatchEvent(pointer('pointerup', 740))
    expect(pane.preferredWidth.value).toBe(560)
    expect(pane.persist).not.toHaveBeenCalled()
  })

  it('keeps automatic sizing when a drag returns to its original edge', () => {
    const pane = mountRightPane()
    pane.start()
    windowEvents.dispatchEvent(pointer('pointermove', 760))
    flushFrames()
    windowEvents.dispatchEvent(pointer('pointerup', 800))
    expect(pane.preferredWidth.value).toBe(0)
    expect(pane.persist).not.toHaveBeenCalled()
    pane.automaticWidth.value = 384
    expect(pane.width.value).toBe(384)
  })

  it('rolls back an automatic preference when the panel is disabled mid-drag', () => {
    const pane = mountRightPane()
    pane.start()
    windowEvents.dispatchEvent(pointer('pointermove', 760))
    flushFrames()
    windowEvents.dispatchEvent(pointer('pointermove', 752))
    pane.disabled.value = true
    flushFrames()
    windowEvents.dispatchEvent(pointer('pointerup', 752))
    expect(pane.preferredWidth.value).toBe(0)
    expect(pane.persist).not.toHaveBeenCalled()
    expect(pane.isResizing.value).toBe(false)
  })

  it('moves a left edge with arrow keys and resets to automatic sizing explicitly', () => {
    const pane = mountRightPane(560, 400)
    pane.onKeyDown(keyboard('ArrowRight'))
    expect(pane.width.value).toBe(392)
    expect(pane.persist).toHaveBeenLastCalledWith(392)
    pane.onKeyDown(keyboard('ArrowLeft'))
    expect(pane.width.value).toBe(400)
    pane.onKeyDown(keyboard('Home'))
    expect(pane.width.value).toBe(240)
    pane.resetWidth()
    expect(pane.preferredWidth.value).toBe(0)
    expect(pane.persist).toHaveBeenLastCalledWith(0)
    pane.automaticWidth.value = 384
    expect(pane.width.value).toBe(384)
  })
})
