import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, nextTick, ref, shallowRef, type Ref } from 'vue'
import { createFocusTrap, type FocusTrap, type Options } from 'focus-trap'
import { useSidebarOwnedModal } from './useSidebarOwnedModal'

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
function mount(options: {
  isOpen: Ref<boolean>
  container: Ref<HTMLElement | null>
  onEscape: () => void
}) {
  const app = renderer.createApp(
    defineComponent({
      setup() {
        useSidebarOwnedModal({
          ...options,
          trigger: shallowRef(trigger as unknown as HTMLElement),
        })
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

describe('sidebar-owned modal focus', () => {
  it('keeps background inert until the last Sidebar owner closes', async () => {
    const parent = ref(true),
      child = ref(true)
    mount({ isOpen: parent, container: root(), onEscape: vi.fn() })
    mount({ isOpen: child, container: root(), onEscape: vi.fn() })
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
    mount({ isOpen: open, container: root(), onEscape: vi.fn() })
    open.value = false
    await nextTick()
    expect(background.inert).toBe(true)
  })
})
