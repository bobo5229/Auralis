import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, ref } from 'vue'
import AppDialog from './AppDialog.vue'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/shared/focus/useOverlayFocusTrap', () => ({ useOverlayFocusTrap: vi.fn() }))
vi.mock('vue', async (original) => ({
  ...(await original<typeof import('vue')>()),
  Transition: {
    inheritAttrs: false,
    setup(_props: unknown, { slots }: { slots: { default: () => unknown } }) {
      return () => slots.default()
    },
  },
}))

class TestNode {
  props: Record<string, unknown> = {}
  children: TestNode[] = []
  parent: TestNode | null = null
  text = ''
  constructor(public type = 'node') {}
  click(): void {
    const handler = this.props.onClick as ((event: unknown) => void) | undefined
    handler?.({ target: this, currentTarget: this })
  }
}
let body: TestNode
let app: ReturnType<typeof renderer.createApp> | undefined
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
  },
  querySelector: () => body,
})
function find(predicate: (node: TestNode) => boolean, root = body): TestNode | undefined {
  if (predicate(root)) return root
  for (const child of root.children) {
    const match = find(predicate, child)
    if (match) return match
  }
  return undefined
}
async function mount(
  options: { as?: 'section' | 'form'; closeOnBackdrop?: boolean; dismissible?: boolean } = {},
) {
  const open = ref(true)
  const dismissible = ref(options.dismissible ?? true)
  const onClose = vi.fn()
  const onSubmit = vi.fn()
  app = renderer.createApp({
    render: () =>
      h(
        AppDialog,
        {
          open: open.value,
          title: 'Title',
          titleId: 'test-title',
          dismissible: dismissible.value,
          as: options.as,
          closeOnBackdrop: options.closeOnBackdrop,
          onClose,
          onSubmit,
        },
        {
          default: () => h('input', { 'aria-label': 'Value' }),
          footer: () => h('button', { type: 'submit' }, 'Save'),
        },
      ),
  })
  app.mount(new TestNode('root'))
  await nextTick()
  return { open, dismissible, onClose, onSubmit }
}
beforeEach(() => {
  body = new TestNode('body')
  vi.clearAllMocks()
})
afterEach(() => {
  app?.unmount()
  app = undefined
})

describe('AppDialog shared behavior', () => {
  it('renders a named modal, body and footer, and removes it when closed', async () => {
    const { open } = await mount()
    expect(find((node) => node.props.role === 'dialog')?.props).toMatchObject({
      'aria-modal': 'true',
      'aria-labelledby': 'test-title',
    })
    expect(find((node) => node.props['aria-label'] === 'Value')).toBeDefined()
    expect(find((node) => node.text === 'Save')).toBeDefined()
    open.value = false
    await nextTick()
    expect(find((node) => node.props.role === 'dialog')).toBeUndefined()
  })
  it('blocks button, Escape and backdrop dismissal until allowed', async () => {
    const { dismissible, onClose } = await mount({ dismissible: false })
    const closeButton = find((node) => node.props['aria-label'] === 'dialog.close')!
    const backdrop = find((node) => String(node.props.class).includes('auralis-dialog-backdrop'))!
    expect(closeButton.props.disabled).toBe(true)
    closeButton.click()
    backdrop.click()
    vi.mocked(useOverlayFocusTrap).mock.calls[0][0].onEscape()
    expect(onClose).not.toHaveBeenCalled()
    dismissible.value = true
    await nextTick()
    closeButton.click()
    backdrop.click()
    vi.mocked(useOverlayFocusTrap).mock.calls[0][0].onEscape()
    expect(onClose.mock.calls.map(([reason]) => reason)).toEqual(['button', 'backdrop', 'escape'])
  })
  it('retains a form dialog’s no-backdrop-dismiss rule and native footer submit semantics', async () => {
    const { onClose, onSubmit } = await mount({ as: 'form', closeOnBackdrop: false })
    const panel = find((node) => node.props.role === 'dialog')!
    const submit = find((node) => node.text === 'Save')!
    expect(panel.type).toBe('form')
    expect(submit.parent?.parent).toBe(panel)
    find((node) => String(node.props.class).includes('auralis-dialog-backdrop'))!.click()
    expect(onClose).not.toHaveBeenCalled()
    const preventDefault = vi.fn()
    ;(panel.props.onSubmit as (event: unknown) => void)({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledOnce()
  })
})
