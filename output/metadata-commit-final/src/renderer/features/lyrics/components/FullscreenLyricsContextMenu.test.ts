import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, reactive } from 'vue'
import FullscreenLyricsContextMenu from './FullscreenLyricsContextMenu.vue'

const positioning = vi.hoisted(() => ({
  sessions: [] as Array<{
    options: { onPosition?: (result: unknown, first: boolean) => void }
    disposed: boolean
    dispose: () => void
  }>,
}))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/shared/floating/floatingPosition', () => ({
  pointReference: (clientX: number, clientY: number) => ({ clientX, clientY }),
  startFloatingPosition: (options: {
    onPosition?: (result: unknown, first: boolean) => void
    onError?: () => void
  }) => {
    const session = {
      options,
      disposed: false,
      dispose() {
        session.disposed = true
      },
    }
    positioning.sessions.push(session)
    return session
  },
}))

let activeDocument: { activeElement: TestNode | null } | null = null
let documentListeners: Map<string, Set<EventListener>>

class TestNode {
  parent: TestNode | null = null
  children: TestNode[] = []
  props: Record<string, unknown> = {}
  style: Record<string, string> = {}
  textContent = ''
  constructor(public type: string) {}
  focus = vi.fn(() => {
    if (activeDocument) activeDocument.activeElement = this
  })
  contains(candidate: unknown): boolean {
    if (!(candidate instanceof TestNode)) return false
    const node = candidate as unknown as TestNode
    if (node === this) return true
    return this.children.some((child) => child.contains(node))
  }
  get isConnected(): boolean {
    return true
  }
}

const renderer = createRenderer<TestNode, TestNode>({
  createElement: (type) => new TestNode(type),
  createText: (text) => {
    const node = new TestNode('text')
    node.textContent = text
    return node
  },
  createComment: () => new TestNode('comment'),
  insert(child, parent, anchor) {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(child)
    else parent.children.splice(index, 0, child)
  },
  remove(child) {
    child.parent?.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = null
  },
  setText(node, text) {
    node.textContent = text
  },
  setElementText(node, text) {
    node.textContent = text
  },
  parentNode: (node) => node.parent,
  nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  patchProp: (node, key, _old, value) => {
    node.props[key] = value
  },
})

function find(node: TestNode, predicate: (node: TestNode) => boolean): TestNode | undefined {
  if (predicate(node)) return node
  for (const child of node.children) {
    const match = find(child, predicate)
    if (match) return match
  }
  return undefined
}

function findRole(root: TestNode, role: string): TestNode | undefined {
  return find(root, (node) => node.props.role === role)
}

function callHandler(node: TestNode, name: string, event: unknown): void {
  const handler = node.props[name]
  if (typeof handler === 'function') handler(event)
}

function makeDocumentStub(): {
  activeElement: TestNode | null
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  dispatch: (type: string, event: Event) => void
} {
  documentListeners = new Map()
  const stub = {
    activeElement: null as TestNode | null,
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      const listeners = documentListeners.get(type) ?? new Set<EventListener>()
      listeners.add(listener)
      documentListeners.set(type, listeners)
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      documentListeners.get(type)?.delete(listener)
    }),
    dispatch(type: string, event: Event) {
      documentListeners.get(type)?.forEach((listener) => listener(event))
    },
  }
  activeDocument = stub
  vi.stubGlobal('document', stub)
  vi.stubGlobal('Node', TestNode)
  return stub
}

function mountMenu(currentScript: 'simplified' | 'traditional' = 'simplified') {
  const props = reactive({
    open: false,
    anchor: { clientX: 40, clientY: 50 },
    currentScript,
  })
  const select = vi.fn()
  const close = vi.fn()
  const root = new TestNode('root')
  const app = renderer.createApp({
    setup: () => () =>
      h(FullscreenLyricsContextMenu, {
        open: props.open,
        anchor: props.anchor,
        currentScript: props.currentScript,
        onSelect: select,
        onClose: close,
      }),
  })
  app.mount(root)
  props.open = true
  return { app, root, props, select, close }
}

beforeEach(() => {
  positioning.sessions.length = 0
  makeDocumentStub()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  activeDocument = null
})

it.each(['simplified', 'traditional'] as const)(
  'renders a single action to switch from %s to the opposite script',
  async (currentScript) => {
    const { app, root, select, props } = mountMenu(currentScript)
    await nextTick()
    const menu = findRole(root, 'menu')!
    const item = findRole(root, 'menuitem')!
    expect(menu.props['aria-label']).toBe('fullscreen.lyricsContextMenu.label')
    expect(menu.children.filter((node) => node.type === 'button')).toHaveLength(1)
    expect(item.props.tabindex).toBe('0')
    expect(item.props['aria-checked']).toBeUndefined()
    const target = currentScript === 'simplified' ? 'traditional' : 'simplified'
    expect(
      find(item, (node) => node.textContent === `fullscreen.lyricsContextMenu.${target}`),
    ).toBeDefined()
    callHandler(item, 'onClick', {})
    expect(select).toHaveBeenLastCalledWith(target)
    props.currentScript = target
    await nextTick()
    callHandler(item, 'onClick', {})
    expect(select).toHaveBeenLastCalledWith(currentScript)
    app.unmount()
  },
)

it('keeps navigation on the single action and activates the opposite script with Enter or Space', async () => {
  const { app, root, select } = mountMenu()
  await nextTick()
  const menu = findRole(root, 'menu')!
  const item = findRole(root, 'menuitem')!
  positioning.sessions[0].options.onPosition?.({}, true)
  await nextTick()
  expect(item.focus).toHaveBeenCalledWith({ preventScroll: true })
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
    const event = { key, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    callHandler(menu, 'onKeydown', event)
    await nextTick()
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    expect(activeDocument?.activeElement).toBe(item)
    expect(select).not.toHaveBeenCalled()
  }
  for (const key of ['Enter', ' ']) {
    const event = { key, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    callHandler(menu, 'onKeydown', event)
    expect(select).toHaveBeenLastCalledWith('traditional')
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
  }
  expect(select).toHaveBeenCalledTimes(2)
  app.unmount()
})

it('closes on Escape without activating the action', async () => {
  const { app, root, close, select } = mountMenu()
  await nextTick()
  const menu = findRole(root, 'menu')!
  const escape = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() }
  callHandler(menu, 'onKeydown', escape)
  expect(close).toHaveBeenCalledExactlyOnceWith('escape')
  expect(escape.preventDefault).toHaveBeenCalledOnce()
  expect(select).not.toHaveBeenCalled()
  app.unmount()
})

it('closes for outside pointer input and preserves Tab navigation focus', async () => {
  const documentStub = makeDocumentStub()
  const outside = new TestNode('outside')
  const first = mountMenu()
  await nextTick()
  documentStub.dispatch('pointerdown', { target: outside } as unknown as Event)
  expect(first.close).toHaveBeenCalledExactlyOnceWith('outside')
  first.app.unmount()

  vi.useFakeTimers()
  const second = mountMenu()
  await nextTick()
  const menu = findRole(second.root, 'menu')!
  const tab = { key: 'Tab', preventDefault: vi.fn(), stopPropagation: vi.fn() }
  callHandler(menu, 'onKeydown', tab)
  documentStub.activeElement = outside
  await vi.runOnlyPendingTimersAsync()
  expect(tab.preventDefault).not.toHaveBeenCalled()
  expect(tab.stopPropagation).not.toHaveBeenCalled()
  expect(second.close).toHaveBeenCalledExactlyOnceWith('tab')
  second.app.unmount()

  const third = mountMenu()
  await nextTick()
  documentStub.dispatch('wheel', { target: outside } as unknown as Event)
  expect(third.close).toHaveBeenCalledExactlyOnceWith('scroll')
  third.app.unmount()
})

it('disposes positioning sessions when repositioned, closed and unmounted', async () => {
  const { app, props, root } = mountMenu()
  await nextTick()
  const first = positioning.sessions[0]
  props.anchor = { clientX: 120, clientY: 90 }
  await nextTick()
  const second = positioning.sessions[1]
  expect(first.disposed).toBe(true)
  expect(positioning.sessions).toHaveLength(2)

  props.open = false
  await nextTick()
  expect(second.disposed).toBe(true)
  expect(findRole(root, 'menu')).toBeUndefined()
  app.unmount()
})
