import { afterEach, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, ref } from 'vue'
import AppearanceSettings from './AppearanceSettings.vue'
import {
  PLAYING_ICON_PRESET_KEY,
  getPlayingIconPreset,
  setPlayingIconPreset,
} from '@renderer/features/appearance/composables/usePlayingIconPreference'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
const windowApi = vi.hoisted(() => ({
  getCloseBehavior: vi.fn(async () => ({ behavior: 'quit', trayAvailable: true })),
  setCloseBehavior: vi.fn(async (behavior: string) => ({ behavior, trayAvailable: true })),
}))
vi.mock('@renderer/shared/ipc/client', () => ({ auralis: { window: windowApi } }))
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
vi.mock('@renderer/composables/useTheme', () => ({
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
vi.mock('./SongFontWeightSettings.vue', () => ({ default: { render: () => null } }))
vi.mock('./AlbumListParameterSettings.vue', () => ({ default: { render: () => null } }))

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
    return {
      left: 144,
      right: 292,
      top: 50,
      bottom: 80,
      width: 148,
      height: this.props.role === 'listbox' ? 148 : 30,
    } as DOMRect
  }
  querySelector(selector: string): TestNode | undefined {
    const index = selector.match(/data-index="(\d+)"/)?.[1]
    return find(this, (node) => node.props['data-index'] === Number(index))
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

afterEach(() => {
  windowApi.getCloseBehavior
    .mockReset()
    .mockResolvedValue({ behavior: 'quit', trayAvailable: true })
  windowApi.setCloseBehavior
    .mockReset()
    .mockImplementation(async (behavior: string) => ({ behavior, trayAvailable: true }))
  vi.stubGlobal('localStorage', { setItem: vi.fn(), getItem: () => null })
  setPlayingIconPreset('equalizer')
  vi.unstubAllGlobals()
})

it('opens the playing icon listbox and persists user selection', async () => {
  const setItem = vi.fn()
  vi.stubGlobal('localStorage', { setItem, getItem: () => null })
  body = new TestNode('body')
  vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('window', {
    innerWidth: 300,
    innerHeight: 300,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })

  const root = new TestNode('root')
  const app = renderer.createApp({ render: () => h(AppearanceSettings) })
  app.mount(root)

  const row = find(root, (node) => String(node.props.class).includes('settings-row--playing-icon'))!
  expect(row).toBeDefined()

  const trigger = find(row, (node) => node.props.role === 'combobox')!
  expect(trigger.props['aria-expanded']).toBe(false)
  expect(trigger.props['aria-describedby']).toBe('appearance-playing-icon-description')
  expect(find(trigger, (node) => node.props.id === 'appearance-playing-icon-value')?.text).toBe(
    'settings.appearance.playingIcon.equalizer',
  )

  const preventDefault = vi.fn()
  ;(trigger.props.onKeydown as (event: unknown) => void)({ key: 'ArrowDown', preventDefault })
  await nextTick()
  await nextTick()

  const listbox = find(body, (node) => node.props.role === 'listbox')!
  const options = listbox.children.filter((node) => node.props.role === 'option')
  expect(options).toHaveLength(2)
  expect(options.map((node) => find(node, (child) => child.type === 'span')?.text)).toEqual([
    'settings.appearance.playingIcon.equalizer',
    'settings.appearance.playingIcon.blocks-wave',
  ])

  // Select the implemented blocks-wave preset
  ;(trigger.props.onKeydown as (event: unknown) => void)({ key: 'ArrowDown', preventDefault })
  await nextTick()
  ;(trigger.props.onKeydown as (event: unknown) => void)({ key: 'Enter', preventDefault })
  await nextTick()

  expect(trigger.props['aria-expanded']).toBe(false)
  expect(getPlayingIconPreset()).toBe('blocks-wave')
  expect(setItem).toHaveBeenCalledWith(PLAYING_ICON_PRESET_KEY, 'blocks-wave')
  expect(find(trigger, (node) => node.props.id === 'appearance-playing-icon-value')?.text).toBe(
    'settings.appearance.playingIcon.blocks-wave',
  )

  app.unmount()
})
