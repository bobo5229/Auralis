import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, nextTick, ref, shallowRef } from 'vue'
import { createFocusTrap, type FocusTrap, type Options } from 'focus-trap'
import { useOverlayFocusTrap } from './useOverlayFocusTrap'
import { useSidebarOwnedModal } from '@renderer/app/utils/useSidebarOwnedModal'

vi.mock('focus-trap', () => ({ createFocusTrap: vi.fn() }))

class ElementStub {
  tabIndex = 0
  inert = false
  isConnected = true
  focus = vi.fn()
  hasAttribute = vi.fn(() => false)
  getAttributeNames = () => []
  closest = vi.fn(() => null)
}
const renderer = createRenderer({
  patchProp: () => {},
  insert: () => {},
  remove: () => {},
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText: () => {},
  setElementText: () => {},
  parentNode: () => null,
  nextSibling: () => null,
})
const mounted: (() => void)[] = []
function mount(options: Parameters<typeof useOverlayFocusTrap>[0], sidebar = false) {
  const app = renderer.createApp(
    defineComponent({
      setup() {
        if (sidebar)
          useSidebarOwnedModal({
            ...options,
            trigger: shallowRef(trigger as unknown as HTMLElement),
          })
        else useOverlayFocusTrap(options)
        return () => null
      },
    }),
  )
  app.mount({})
  mounted.push(() => app.unmount())
  return app
}
let created: { options: Options; trap: FocusTrap }[]
let trigger: ElementStub
let background: ElementStub
beforeEach(() => {
  created = []
  trigger = new ElementStub()
  background = new ElementStub()
  vi.stubGlobal('HTMLElement', ElementStub)
  vi.stubGlobal('document', {
    activeElement: trigger,
    querySelector: (selector: string) =>
      selector === '[data-app-shell-root]' ? background : trigger,
  })
  vi.mocked(createFocusTrap).mockImplementation((_root, options = {}) => {
    const trap = {
      activate: vi.fn(() => {
        options.trapStack!.push(trap)
        return trap
      }),
      deactivate: vi.fn(() => {
        const stack = options.trapStack!
        stack.splice(stack.indexOf(trap), 1)
        return trap
      }),
    } as unknown as FocusTrap
    created.push({ options, trap })
    return trap
  })
})
afterEach(async () => {
  mounted
    .splice(0)
    .reverse()
    .forEach((unmount) => unmount())
  await nextTick()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
const root = () => shallowRef(new ElementStub() as unknown as HTMLElement)

describe('owned focus trap lifecycle', () => {
  it('waits for the rendered root and uses it as the empty-dialog fallback', async () => {
    const container = shallowRef<HTMLElement | null>(null)
    mount({ isOpen: true, container, onEscape: vi.fn() })
    expect(created).toHaveLength(0)
    container.value = root().value
    await nextTick()
    expect(created[0].options.fallbackFocus).toBe(container.value)
    expect(container.value!.tabIndex).toBe(-1)
    expect(created[0].trap.activate).toHaveBeenCalledOnce()
  })
  it('deactivates immediately and restores business focus after the DOM tick', async () => {
    const open = ref(true)
    const restoreFocus = vi.fn()
    mount({ isOpen: open, container: root(), onEscape: vi.fn(), restoreFocus })
    open.value = false
    expect(created[0].trap.deactivate).toHaveBeenCalledWith({ returnFocus: false })
    expect(restoreFocus).not.toHaveBeenCalled()
    await nextTick()
    expect(restoreFocus.mock.calls[0]?.[0]).toBe(trigger)
  })
  it('cancels old return-focus work on rapid reopening', async () => {
    const open = ref(true)
    const restoreFocus = vi.fn()
    mount({ isOpen: open, container: root(), onEscape: vi.fn(), restoreFocus })
    open.value = false
    open.value = true
    await nextTick()
    expect(restoreFocus).not.toHaveBeenCalled()
    expect(created).toHaveLength(2)
  })
  it('replaces a changed root without keeping a stale trap', async () => {
    const container = root()
    mount({ isOpen: true, container, onEscape: vi.fn() })
    container.value = root().value
    await nextTick()
    expect(created[0].trap.deactivate).toHaveBeenCalledOnce()
    expect(created[1].trap.activate).toHaveBeenCalledOnce()
  })
  it('consumes Escape while busy and delegates closing when dismissal becomes allowed', () => {
    const canDismiss = ref(false)
    const onEscape = vi.fn()
    mount({ isOpen: true, container: root(), onEscape, canDismiss })
    const event = {
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as KeyboardEvent
    const escape = created[0].options.escapeDeactivates as (event: KeyboardEvent) => boolean
    expect(escape(event)).toBe(false)
    expect(onEscape).not.toHaveBeenCalled()
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce()
    canDismiss.value = true
    escape(event)
    expect(onEscape).toHaveBeenCalledOnce()
  })
  it('shares the stack and avoids restoring behind a remaining overlay', async () => {
    const parent = ref(true)
    const child = ref(true)
    const restoreParent = vi.fn(),
      restoreChild = vi.fn()
    mount({ isOpen: parent, container: root(), onEscape: vi.fn(), restoreFocus: restoreParent })
    mount({ isOpen: child, container: root(), onEscape: vi.fn(), restoreFocus: restoreChild })
    expect(created[0].options.trapStack).toBe(created[1].options.trapStack)
    child.value = false
    await nextTick()
    expect(restoreChild).not.toHaveBeenCalled()
    parent.value = false
    await nextTick()
    expect(restoreParent).toHaveBeenCalledOnce()
  })
  it('releases the trap and restores focus when an open owner unmounts', async () => {
    const restoreFocus = vi.fn()
    const app = mount({ isOpen: true, container: root(), onEscape: vi.fn(), restoreFocus })
    app.unmount()
    await nextTick()
    expect(created[0].trap.deactivate).toHaveBeenCalledOnce()
    expect(restoreFocus).toHaveBeenCalledOnce()
  })
  it('keeps background inert until the last Sidebar owner closes', async () => {
    const parent = ref(true),
      child = ref(true)
    mount({ isOpen: parent, container: root(), onEscape: vi.fn() }, true)
    mount({ isOpen: child, container: root(), onEscape: vi.fn() }, true)
    expect(background.inert).toBe(true)
    child.value = false
    await nextTick()
    expect(background.inert).toBe(true)
    parent.value = false
    await nextTick()
    expect(background.inert).toBe(false)
    expect(trigger.focus).toHaveBeenCalledOnce()
  })
  it('preserves an already-inert background', async () => {
    background.inert = true
    const open = ref(true)
    mount({ isOpen: open, container: root(), onEscape: vi.fn() }, true)
    open.value = false
    await nextTick()
    expect(background.inert).toBe(true)
  })
})
