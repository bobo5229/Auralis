import { expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, ref } from 'vue'
import AppearanceSettings from './AppearanceSettings.vue'
import { CHINESE_FONT_STORAGE_KEY } from '@renderer/features/appearance/composables/useChineseFont'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: {
    window: {
      getCloseBehavior: vi.fn(async () => ({ behavior: 'quit', trayAvailable: true })),
      setCloseBehavior: vi.fn(async (behavior: string) => ({ behavior, trayAvailable: true })),
    },
  },
}))
vi.mock('@renderer/features/startupAlbum/startupAlbumPreference', () => ({
  useStartupAlbumPreference: () => ({
    enabled: ref(false),
    persistFailed: ref(false),
    setEnabled: vi.fn(),
  }),
}))
vi.mock('@renderer/i18n', () => ({
  useUiLocale: () => ({
    locale: ref('zh-Hans'),
    persistFailed: ref(false),
    nativeSyncFailed: ref(false),
    setUiLocale: vi.fn(),
  }),
}))
vi.mock('@renderer/features/appearance/composables/useTheme', () => ({
  useTheme: () => ({ theme: ref('light'), setTheme: vi.fn() }),
}))
vi.mock('@renderer/features/appearance/composables/useSidebarLayout', () => ({
  useSidebarLayout: () => ({ sidebarFullHeight: ref(false), setSidebarFullHeight: vi.fn() }),
}))
vi.mock('@renderer/features/appearance/composables/useMotionPreference', () => ({
  useMotionPreference: () => ({
    motionPreference: ref('system'),
    persistFailed: ref(false),
    setMotionPreference: vi.fn(),
  }),
}))
vi.mock('./ThemeAccentSettings.vue', () => ({ default: { render: () => null } }))
vi.mock('./ChineseTextSettings.vue', () => ({ default: { render: () => null } }))

class TestNode {
  parent: TestNode | null = null
  children: TestNode[] = []
  props: Record<string, unknown> = {}
  text = ''
  focused = false
  constructor(public type: string) {}
  classList = { add: vi.fn(), remove: vi.fn() }
  focus(): void {
    this.focused = true
  }
  getBoundingClientRect(): DOMRect {
    return { left: 144, right: 292, top: 50, bottom: 80, width: 148, height: 30 } as DOMRect
  }
  querySelector(): TestNode | undefined {
    return undefined
  }
  scrollIntoView(): void {}
  closest(): null {
    return null
  }
}

let body: TestNode
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
  remove(child) {
    child.parent?.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = null
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
  querySelector: (selector) => (selector === 'body' ? body : null),
})

function find(node: TestNode, predicate: (node: TestNode) => boolean): TestNode | undefined {
  if (predicate(node)) return node
  for (const child of node.children) {
    const match = find(child, predicate)
    if (match) return match
  }
  return undefined
}
function textOf(node: TestNode): string {
  return `${node.text}${node.children.map(textOf).join('')}`
}

it('lists bundled Chinese fonts and persists the selection', async () => {
  const setItem = vi.fn()
  vi.stubGlobal('localStorage', { setItem, getItem: () => null })
  body = new TestNode('body')
  vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('window', {
    innerWidth: 600,
    innerHeight: 600,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })

  const root = new TestNode('root')
  const app = renderer.createApp({ render: () => h(AppearanceSettings) })
  app.mount(root)
  const row = find(root, (node) => String(node.props.class).includes('settings-row--chinese-font'))!
  expect(row).toBeDefined()
  const trigger = find(row, (node) => node.props.id === 'appearance-chinese-font')!
  expect(trigger.props.role).toBe('combobox')
  expect(trigger.props['aria-labelledby']).toBe(
    'appearance-chinese-font-label appearance-chinese-font-value',
  )
  expect(trigger.props['aria-describedby']).toBe('appearance-chinese-font-description')
  expect(textOf(find(trigger, (node) => node.props.id === 'appearance-chinese-font-value')!)).toBe(
    'HarmonyOS Sans SC',
  )
  ;(trigger.props.onClick as () => void)()
  await nextTick()
  expect(trigger.props['aria-expanded']).toBe(true)
  const options = [0, 1].map((index) =>
    find(body, (node) => node.props.id === `appearance-chinese-font-option-${index}`),
  )
  expect(options.map((option) => textOf(option!))).toEqual(['HarmonyOS Sans SC', 'MiSans'])
  expect(options[0]!.props['aria-selected']).toBe(true)
  ;(options[1]!.props.onClick as () => void)()
  await nextTick()
  expect(trigger.props['aria-expanded']).toBe(false)
  expect(setItem).toHaveBeenCalledWith(CHINESE_FONT_STORAGE_KEY, 'misans')
  expect(textOf(find(trigger, (node) => node.props.id === 'appearance-chinese-font-value')!)).toBe(
    'MiSans',
  )
  ;(trigger.props.onClick as () => void)()
  await nextTick()
  const harmony = find(body, (node) => node.props.id === 'appearance-chinese-font-option-0')!
  expect(harmony.props['aria-selected']).toBe(false)
  ;(harmony.props.onClick as () => void)()
  await nextTick()
  expect(setItem).toHaveBeenLastCalledWith(CHINESE_FONT_STORAGE_KEY, 'harmonyOsSans')
  expect(textOf(find(trigger, (node) => node.props.id === 'appearance-chinese-font-value')!)).toBe(
    'HarmonyOS Sans SC',
  )
  app.unmount()
})
