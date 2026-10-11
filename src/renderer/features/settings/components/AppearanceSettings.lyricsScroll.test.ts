import { afterEach, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, ref } from 'vue'
import AppearanceSettings from './AppearanceSettings.vue'
import SongFontWeightSelect from './SongFontWeightSelect.vue'
import WindowBehaviorSettings from './WindowBehaviorSettings.vue'
import {
  getLyricsScrollPreset,
  setLyricsScrollPreset,
} from '@renderer/features/lyrics/lyricsScrollPreset'

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
  vi.stubGlobal('localStorage', { setItem: vi.fn() })
  setLyricsScrollPreset('standard')
  vi.unstubAllGlobals()
})

function mountWindowSettings() {
  body = new TestNode('body')
  vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('window', {
    innerWidth: 600,
    innerHeight: 600,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  const root = new TestNode('root')
  const app = renderer.createApp({ render: () => h(WindowBehaviorSettings) })
  app.mount(root)
  const trigger = find(root, (node) => node.props.role === 'combobox')!
  return { root, app, trigger }
}

it('keeps close choices disabled after a read failure and allows retrying the query', async () => {
  windowApi.getCloseBehavior.mockRejectedValueOnce(new Error('unavailable'))
  const { root, app, trigger } = mountWindowSettings()
  await Promise.resolve()
  await nextTick()
  expect(trigger.props.disabled).toBe(true)
  expect(find(root, (node) => node.props.role === 'status')?.text).toBe(
    'settings.appearance.windowBehavior.loadFailed',
  )
  const retry = find(root, (node) => node.type === 'button' && node.props.role !== 'combobox')!
  ;(retry.props.onClick as () => void)()
  await Promise.resolve()
  await nextTick()
  expect(windowApi.getCloseBehavior).toHaveBeenCalledTimes(2)
  expect(trigger.props.disabled).toBe(false)
  expect(find(root, (node) => node.props.role === 'status')).toBeUndefined()
  app.unmount()
})

it('disables close choices while loading and retains the previous choice on save failure', async () => {
  let finish!: (value: { behavior: string; trayAvailable: boolean }) => void
  windowApi.getCloseBehavior.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const { root, app, trigger } = mountWindowSettings()
  expect(trigger.props.disabled).toBe(true)
  ;(trigger.props.onClick as () => void)()
  await nextTick()
  expect(trigger.props['aria-expanded']).toBe(false)
  finish({ behavior: 'tray', trayAvailable: true })
  await Promise.resolve()
  await nextTick()
  expect(trigger.props.disabled).toBe(false)
  expect(find(root, (node) => node.props.id === 'window-close-behavior-value')?.text).toBe(
    'settings.appearance.windowBehavior.tray',
  )
  windowApi.setCloseBehavior.mockRejectedValueOnce(new Error('disk full'))
  ;(trigger.props.onClick as () => void)()
  await nextTick()
  const quit = find(body, (node) => node.props.id === 'window-close-behavior-option-0')!
  ;(quit.props.onClick as () => void)()
  await Promise.resolve()
  await nextTick()
  expect(find(root, (node) => node.props.id === 'window-close-behavior-value')?.text).toBe(
    'settings.appearance.windowBehavior.tray',
  )
  expect(find(root, (node) => node.props.role === 'status')?.text).toBe(
    'settings.appearance.windowBehavior.saveFailed',
  )
  app.unmount()
})

it('skips an unavailable tray option for keyboard and pointer selection and saves available choices', async () => {
  windowApi.getCloseBehavior.mockResolvedValueOnce({ behavior: 'quit', trayAvailable: false })
  const { app, trigger, root } = mountWindowSettings()
  await Promise.resolve()
  await nextTick()
  ;(trigger.props.onClick as () => void)()
  await nextTick()
  const tray = find(body, (node) => node.props.id === 'window-close-behavior-option-2')!
  expect(tray.props['aria-disabled']).toBe(true)
  ;(tray.props.onClick as () => void)()
  expect(windowApi.setCloseBehavior).not.toHaveBeenCalled()
  const key = trigger.props.onKeydown as (event: unknown) => void
  key({ key: 'End', preventDefault: vi.fn() })
  await nextTick()
  expect(trigger.props['aria-activedescendant']).toBe('window-close-behavior-option-1')
  key({ key: 'ArrowDown', preventDefault: vi.fn() })
  await nextTick()
  expect(trigger.props['aria-activedescendant']).toBe('window-close-behavior-option-1')
  key({ key: 'Enter', preventDefault: vi.fn() })
  await Promise.resolve()
  await nextTick()
  expect(windowApi.setCloseBehavior).toHaveBeenCalledWith('minimize')
  expect(find(root, (node) => node.props.id === 'window-close-behavior-value')?.text).toBe(
    'settings.appearance.windowBehavior.minimize',
  )
  app.unmount()
})

it('opens the existing settings listbox and persists a keyboard selection', async () => {
  const setItem = vi.fn()
  vi.stubGlobal('localStorage', { setItem })
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
  const row = find(root, (node) =>
    String(node.props.class).includes('settings-row--lyrics-scroll'),
  )!
  const trigger = find(row, (node) => node.props.role === 'combobox')!
  expect(trigger.props['aria-expanded']).toBe(false)
  expect(trigger.props['aria-describedby']).toBe('appearance-lyrics-scroll-description')
  expect(find(trigger, (node) => node.props.id === 'appearance-lyrics-scroll-value')?.text).toBe(
    'settings.appearance.lyricsScroll.standard',
  )

  const preventDefault = vi.fn()
  ;(trigger.props.onKeydown as (event: unknown) => void)({ key: 'ArrowDown', preventDefault })
  await nextTick()
  await nextTick()
  const listbox = find(body, (node) => node.props.role === 'listbox')!
  const options = listbox.children.filter((node) => node.props.role === 'option')
  expect(options).toHaveLength(4)
  expect(options.map((node) => find(node, (child) => child.type === 'span')?.text)).toEqual([
    'settings.appearance.lyricsScroll.standard',
    'settings.appearance.lyricsScroll.quick',
    'settings.appearance.lyricsScroll.soft',
    'settings.appearance.lyricsScroll.emphasized',
  ])
  expect(trigger.props['aria-expanded']).toBe(true)
  expect(options[0].props['aria-selected']).toBe(true)
  expect(listbox.props.style).toMatchObject({ left: '144px', width: '148px' })
  ;(trigger.props.onKeydown as (event: unknown) => void)({ key: 'ArrowDown', preventDefault })
  await nextTick()
  expect(trigger.props['aria-activedescendant']).toBe('appearance-lyrics-scroll-option-1')
  ;(trigger.props.onKeydown as (event: unknown) => void)({ key: 'Enter', preventDefault })
  await nextTick()
  expect(preventDefault).toHaveBeenCalledTimes(3)
  expect(trigger.props['aria-expanded']).toBe(false)
  expect(trigger.focused).toBe(true)
  expect(getLyricsScrollPreset()).toBe('quick')
  expect(setItem).toHaveBeenCalledWith('auralis-lyrics-scroll-preset', 'quick')
  expect(find(trigger, (node) => node.props.id === 'appearance-lyrics-scroll-value')?.text).toBe(
    'settings.appearance.lyricsScroll.quick',
  )
  ;(trigger.props.onClick as () => void)()
  await nextTick()
  expect(trigger.props['aria-expanded']).toBe(true)
  ;(trigger.props.onKeydown as (event: unknown) => void)({
    key: 'Escape',
    preventDefault,
    stopPropagation: vi.fn(),
  })
  await nextTick()
  expect(trigger.props['aria-expanded']).toBe(false)
  expect(getLyricsScrollPreset()).toBe('quick')

  setItem.mockImplementation(() => {
    throw new Error('storage unavailable')
  })
  ;(trigger.props.onClick as () => void)()
  await nextTick()
  const soft = find(body, (node) => node.props.id === 'appearance-lyrics-scroll-option-2')!
  ;(soft.props.onClick as () => void)()
  await nextTick()
  expect(getLyricsScrollPreset()).toBe('soft')
  expect(find(row, (node) => node.props.role === 'status')?.text).toBe(
    'settings.appearance.lyricsScroll.persistFailed',
  )
  ;(trigger.props.onClick as () => void)()
  await nextTick()
  const standard = find(body, (node) => node.props.id === 'appearance-lyrics-scroll-option-0')!
  const selectedSoft = find(body, (node) => node.props.id === 'appearance-lyrics-scroll-option-2')!
  expect(String(standard.props.class)).not.toContain('is-default')
  expect(String(standard.props.class)).not.toContain('is-active')
  expect(standard.props['aria-selected']).toBe(false)
  expect(String(selectedSoft.props.class)).toContain('is-active')
  expect(selectedSoft.props['aria-selected']).toBe(true)
  app.unmount()
})

it('keeps song font weight selections typed when using the shared listbox', async () => {
  body = new TestNode('body')
  vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('window', {
    innerWidth: 300,
    innerHeight: 300,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  const selected = vi.fn()
  const root = new TestNode('root')
  const app = renderer.createApp({
    render: () =>
      h(SongFontWeightSelect, {
        id: 'weight',
        labelledby: 'weight-label',
        modelValue: 500,
        defaultWeight: 400,
        'onUpdate:modelValue': selected,
      }),
  })
  app.mount(root)
  const trigger = find(root, (node) => node.props.role === 'combobox')!
  expect(find(trigger, (node) => node.props.id === 'weight-value')?.text).toBe(
    'settings.appearance.songFontWeight.options.500',
  )
  ;(trigger.props.onClick as () => void)()
  await nextTick()
  const defaultOption = find(body, (node) => node.props.id === 'weight-option-0')!
  expect(String(defaultOption.props.class)).not.toContain('is-default')
  const weight700 = find(body, (node) => node.props.id === 'weight-option-4')!
  ;(weight700.props.onClick as () => void)()
  expect(selected).toHaveBeenLastCalledWith(700)
  ;(trigger.props.onClick as () => void)()
  await nextTick()
  const defaultOptionAgain = find(body, (node) => node.props.id === 'weight-option-0')!
  ;(defaultOptionAgain.props.onClick as () => void)()
  expect(selected).toHaveBeenLastCalledWith('default')
  app.unmount()
})
