import { afterEach, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, ref } from 'vue'
import PlayingIndicator from './PlayingIndicator.vue'

const animations: Array<{ cancel: ReturnType<typeof vi.fn> }> = []
class TestNode {
  parent: TestNode | null = null
  children: TestNode[] = []
  props: Record<string, unknown> = {}
  style = { transform: '' }
  constructor(public type: string) {}
  querySelectorAll(type: string): TestNode[] {
    return this.children.flatMap((child) => [
      ...(child.type === type ? [child] : []),
      ...child.querySelectorAll(type),
    ])
  }
  animate() {
    const animation = { cancel: vi.fn() }
    animations.push(animation)
    return animation
  }
}
const renderer = createRenderer<TestNode, TestNode>({
  createElement: (type) => new TestNode(type),
  createText: () => new TestNode('text'),
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
  setText() {},
  setElementText() {},
  parentNode: (node) => node.parent,
  nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  patchProp: (node, key, _old, value) => {
    node.props[key] = value
  },
})
const runningCount = () =>
  animations.filter((animation) => !animation.cancel.mock.calls.length).length

it('keeps instance presets independent and replaces animations when a preset changes', async () => {
  vi.stubGlobal('document', {
    hidden: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  vi.stubGlobal('window', {})
  const preset = ref<'equalizer' | 'blocks-wave'>('equalizer')
  const root = new TestNode('root')
  const app = renderer.createApp({
    render: () =>
      h('div', [
        h(PlayingIndicator, { playing: true, preset: preset.value }),
        h(PlayingIndicator, { playing: false, preset: 'equalizer' }),
      ]),
  })
  app.mount(root)
  await nextTick()
  expect(runningCount()).toBe(3)
  preset.value = 'blocks-wave'
  await nextTick()
  expect(root.children[0].children.map((node) => node.props['data-preset'])).toEqual([
    'blocks-wave',
    'equalizer',
  ])
  expect(runningCount()).toBe(9)
  app.unmount()
  expect(runningCount()).toBe(0)
})

afterEach(() => {
  animations.length = 0
  vi.unstubAllGlobals()
})

it.each([
  ['equalizer', 3],
  ['blocks-wave', 9],
] as const)(
  'stops %s animations on native hide, resumes only while playing, and cleans up',
  async (preset, count) => {
    vi.stubGlobal('localStorage', { setItem: vi.fn() })
    vi.stubGlobal('document', {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    let visibility!: (state: { isVisible: boolean }) => void
    const unsubscribe = vi.fn()
    vi.stubGlobal('window', {
      auralis: {
        window: {
          getVisibility: async () => ({ isVisible: true }),
          onVisibilityChanged: (callback: typeof visibility) => {
            visibility = callback
            return unsubscribe
          },
        },
      },
    })
    const playing = ref(true)
    const root = new TestNode('root')
    const app = renderer.createApp({
      setup: () => () => h(PlayingIndicator, { playing: playing.value, preset }),
    })
    app.mount(root)
    await nextTick()
    await nextTick()
    expect(runningCount()).toBe(count)
    visibility({ isVisible: false })
    await nextTick()
    expect(document.hidden).toBe(false)
    expect(runningCount()).toBe(0)
    visibility({ isVisible: true })
    await nextTick()
    expect(runningCount()).toBe(count)
    playing.value = false
    await nextTick()
    expect(runningCount()).toBe(0)
    visibility({ isVisible: false })
    visibility({ isVisible: true })
    await nextTick()
    expect(runningCount()).toBe(0)
    playing.value = true
    await nextTick()
    expect(runningCount()).toBe(count)
    app.unmount()
    expect(runningCount()).toBe(0)
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(document.removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    )
  },
)

it('uses document visibility when the browser preview has no native API', async () => {
  let change!: () => void
  const previewDocument = {
    hidden: false,
    addEventListener: (_name: string, callback: () => void) => {
      change = callback
    },
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal('document', previewDocument)
  const root = new TestNode('root')
  const app = renderer.createApp({ render: () => h(PlayingIndicator, { playing: true }) })
  app.mount(root)
  await nextTick()
  expect(runningCount()).toBe(3)
  previewDocument.hidden = true
  change()
  await nextTick()
  expect(runningCount()).toBe(0)
  previewDocument.hidden = false
  change()
  await nextTick()
  expect(runningCount()).toBe(3)
  app.unmount()
})
