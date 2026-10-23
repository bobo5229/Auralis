import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, h, markRaw, nextTick, ref } from 'vue'
import LyricsSaveMenu, { type LyricsSaveAction } from './LyricsSaveMenu.vue'
import { startFloatingPosition } from '@renderer/shared/floating/floatingPosition'

vi.mock('@renderer/shared/floating/floatingPosition', () => ({
  startFloatingPosition: vi.fn(({ floating }: { floating: HTMLElement }) => {
    floating.style.visibility = 'visible'
    return { dispose: vi.fn(), update: vi.fn() }
  }),
}))
class TestNode {
  props: Record<string, unknown> = {}
  children: TestNode[] = []
  parent: TestNode | null = null
  text = ''
  focused = false
  style: Record<string, string> = {}
  constructor(public type: string) {
    markRaw(this)
  }
  contains(node: TestNode): boolean {
    return node === this || this.children.some((child) => child.contains(node))
  }
  querySelector(selector: string): TestNode | undefined {
    const index = selector.match(/data-index="(\d+)"/)?.[1]
    return find((node) => String(node.props['data-index']) === index, this)
  }
  focus(): void {
    this.focused = true
  }
  closest(selector: string): TestNode | null {
    return selector === '[data-index]' && 'data-index' in this.props ? this : null
  }
  setAttribute(name: string, value: string): void {
    this.props[name] = value
  }
  removeAttribute(name: string): void {
    delete this.props[name]
  }
  getBoundingClientRect() {
    return { x: 0, y: 0, left: 0, top: 0, width: 76, height: 34, right: 76, bottom: 34 }
  }
}
const renderer = createRenderer<TestNode, TestNode>({
  createElement: (type) => new TestNode(type),
  createText: (text) => Object.assign(new TestNode('text'), { text }),
  createComment: () => new TestNode('comment'),
  insert(child, parent, anchor) {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(child)
    else parent.children.splice(index, 0, child)
  },
  remove(node) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1)
    node.parent = null
  },
  setText: (node, text) => {
    node.text = text
  },
  setElementText: (node, text) => {
    node.text = text
  },
  parentNode: (node) => node.parent,
  nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  patchProp: (node, key, _old, value) => {
    node.props[key] = value
    if (key === 'style' && value) Object.assign(node.style, value)
  },
})
function find(predicate: (node: TestNode) => boolean, root: TestNode): TestNode | undefined {
  if (predicate(root)) return root
  for (const child of root.children) {
    const result = find(predicate, child)
    if (result) return result
  }
  return undefined
}
let app: ReturnType<typeof renderer.createApp> | undefined
let pointerdown: ((event: { target: TestNode }) => void) | undefined
const removeDocumentListener = vi.fn()
const removeWindowListener = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  pointerdown = undefined
  vi.stubGlobal('Node', TestNode)
  vi.stubGlobal('HTMLElement', TestNode)
  vi.stubGlobal('document', {
    documentElement: { dataset: { reducedMotion: 'true' } },
    addEventListener: (name: string, handler: typeof pointerdown) => {
      if (name === 'pointerdown') pointerdown = handler
    },
    removeEventListener: removeDocumentListener,
  })
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: true }),
    addEventListener: vi.fn(),
    removeEventListener: removeWindowListener,
  })
  vi.stubGlobal('getComputedStyle', () => ({ backgroundColor: 'rgb(38, 38, 38)' }))
})
afterEach(() => {
  app?.unmount()
  app = undefined
  vi.unstubAllGlobals()
})
async function mount() {
  const root = new TestNode('root')
  const anchor = new TestNode('button')
  const open = ref(true)
  const onClose = vi.fn()
  const onSelect = vi.fn()
  const actions: LyricsSaveAction[] = [
    { target: 'tag', label: 'Tag', disabled: true, icon: 'i-lucide-tag' },
    { target: 'file', label: 'LRC', disabled: false, icon: 'i-lucide-file-text' },
  ]
  app = renderer.createApp({
    render: () =>
      h(LyricsSaveMenu, {
        open: open.value,
        anchor: anchor as unknown as HTMLElement,
        label: 'Save',
        actions,
        onClose,
        onSelect,
      }),
  })
  app.mount(root)
  await nextTick()
  await nextTick()
  return { root, anchor, open, onClose, onSelect }
}
function key(root: TestNode, value: string, target?: TestNode): void {
  const surface = find((node) => 'onKeydown' in node.props, root)!
  ;(surface.props.onKeydown as (event: unknown) => void)({
    key: value,
    target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  })
}

describe('lyrics save action menu', () => {
  it('shows only two actions with full-width separators and no extra save or collapse button', async () => {
    const { root } = await mount()
    const menu = find((node) => node.props.role === 'menu', root)!
    expect(menu.props['aria-label']).toBe('Save')
    expect(menu.children.filter((node) => node.type === 'button')).toHaveLength(2)
    expect(menu.children.filter((node) => node.props.role === 'separator')).toHaveLength(1)
    expect(find((node) => node.text === 'Save', root)).toBeUndefined()
    expect(find((node) => String(node.props.class).includes('chevron'), root)).toBeUndefined()
  })
  it('skips disabled destinations with arrows and selects the active destination with Enter', async () => {
    const { root, onSelect } = await mount()
    key(root, 'ArrowDown')
    const lrc = find((node) => node.props['data-index'] === 1, root)!
    expect(lrc.focused).toBe(true)
    key(root, 'Enter', lrc)
    expect(onSelect).toHaveBeenCalledWith('file')
    key(root, 'ArrowDown')
    expect(find((node) => node.props['data-index'] === 1, root)?.focused).toBe(true)
    const disabled = find((node) => node.props['data-index'] === 0, root)!
    ;(disabled.props.onClick as () => void)()
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
  it('retains positioned visibility when pointer focus moves to a different action before click', async () => {
    const { root, onSelect } = await mount()
    const surface = find((node) => String(node.props.class).includes('lyrics-save-menu'), root)!
    const lrc = find((node) => node.props['data-index'] === 1, root)!
    expect(surface.style.visibility).toBe('visible')
    ;(lrc.props.onFocus as () => void)()
    await nextTick()
    expect(surface.style.visibility).toBe('visible')
    ;(lrc.props.onClick as () => void)()
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('file')
  })
  it('closes on an outside pointer or Escape without treating an action as an outside click', async () => {
    const { root, anchor, onClose } = await mount()
    pointerdown?.({ target: find((node) => node.props.role === 'menuitem', root)! })
    pointerdown?.({ target: anchor })
    expect(onClose).not.toHaveBeenCalled()
    pointerdown?.({ target: new TestNode('textarea') })
    expect(onClose).toHaveBeenLastCalledWith('outside')
    key(root, 'Escape')
    expect(onClose).toHaveBeenLastCalledWith('escape')
  })
  it('releases positioning and global listeners when closed', async () => {
    const { root, open } = await mount()
    const positioning = vi.mocked(startFloatingPosition).mock.results[0].value
    open.value = false
    await nextTick()
    expect(positioning.dispose).toHaveBeenCalledOnce()
    expect(removeDocumentListener).toHaveBeenCalledWith('pointerdown', pointerdown, true)
    expect(removeWindowListener).toHaveBeenCalledWith('blur', expect.any(Function))
    expect(find((node) => node.props.role === 'menu', root)).toBeUndefined()
  })
})
