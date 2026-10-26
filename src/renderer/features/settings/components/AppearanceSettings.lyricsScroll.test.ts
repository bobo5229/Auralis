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
const localeApi = vi.hoisted(() => ({ setUiLocale: vi.fn() }))
vi.mock('@renderer/shared/ipc/client', () => ({ auralis: { window: windowApi } }))
vi.mock('@renderer/features/startupAlbum/startupAlbumPreference', () => ({
  useStartupAlbumPreference: () => ({
    enabled: ref(false),
    persistFailed: ref(false),
    setEnabled: vi.fn(),
  }),
}))
vi.mock('@renderer/i18n', () => ({
  useUiLocale: () => {
    const locale = ref('zh-Hans')
    localeApi.setUiLocale.mockImplementation((value: string) => {
      locale.value = value
    })
    return {
      locale,
      persistFailed: ref(false),
      nativeSyncFailed: ref(false),
      setUiLocale: localeApi.setUiLocale,
    }
  },
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
  const tray = find(body, (node) => node.props.id === 'window-close-behavior-option-1')!
  const listbox = find(body, (node) => node.props.role === 'listbox')!
  expect(listbox.children.filter((node) => node.props.role === 'option')).toHaveLength(2)
  expect(tray.props['aria-disabled']).toBe(true)
  ;(tray.props.onClick as () => void)()
  expect(windowApi.setCloseBehavior).not.toHaveBeenCalled()
  const key = trigger.props.onKeydown as (event: unknown) => void
  key({ key: 'End', preventDefault: vi.fn() })
  await nextTick()
  expect(trigger.props['aria-activedescendant']).toBe('window-close-behavior-option-0')
  key({ key: 'ArrowDown', preventDefault: vi.fn() })
  await nextTick()
  expect(trigger.props['aria-activedescendant']).toBe('window-close-behavior-option-0')
  key({ key: 'Enter', preventDefault: vi.fn() })
  await Promise.resolve()
  await nextTick()
  expect(windowApi.setCloseBehavior).toHaveBeenCalledWith('quit')
  expect(find(root, (node) => node.props.id === 'window-close-behavior-value')?.text).toBe(
    'settings.appearance.windowBehavior.quit',
  )
  app.unmount()
})

it('shows scroll presets and preserves keyboard navigation, persistence and failure feedback', async () => {
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
  const group = find(row, (node) => node.props.role === 'radiogroup')!
  expect(group.props['aria-labelledby']).toBe('appearance-lyrics-scroll-label')
  expect(group.props['aria-describedby']).toBe('appearance-lyrics-scroll-description')
  const options = group.children.filter((node) => node.props.role === 'radio')
  expect(options.map((node) => node.text)).toEqual([
    'settings.appearance.lyricsScroll.standard',
    'settings.appearance.lyricsScroll.quick',
    'settings.appearance.lyricsScroll.soft',
    'settings.appearance.lyricsScroll.emphasized',
  ])
  expect(options[0].props['aria-checked']).toBe(true)
  expect(options[0].props.tabindex).toBe(0)

  const preventDefault = vi.fn()
  ;(options[0].props.onKeydown as (event: unknown) => void)({ key: 'ArrowRight', preventDefault })
  await nextTick()
  expect(getLyricsScrollPreset()).toBe('quick')
  expect(setItem).toHaveBeenCalledWith('auralis-lyrics-scroll-preset', 'quick')
  expect(options[1].props['aria-checked']).toBe(true)
  expect(options[1].props.tabindex).toBe(0)
  expect(options[1].focused).toBe(true)
  ;(options[1].props.onKeydown as (event: unknown) => void)({ key: 'End', preventDefault })
  await nextTick()
  expect(getLyricsScrollPreset()).toBe('emphasized')
  expect(options[3].focused).toBe(true)
  ;(options[3].props.onKeydown as (event: unknown) => void)({ key: 'Home', preventDefault })
  await nextTick()
  expect(getLyricsScrollPreset()).toBe('standard')
  expect(options[0].focused).toBe(true)
  expect(preventDefault).toHaveBeenCalledTimes(3)

  setItem.mockImplementation(() => {
    throw new Error('storage unavailable')
  })
  ;(options[2].props.onClick as () => void)()
  await nextTick()
  expect(getLyricsScrollPreset()).toBe('soft')
  expect(find(row, (node) => node.props.role === 'status')?.text).toBe(
    'settings.appearance.lyricsScroll.persistFailed',
  )
  expect(options[0].props['aria-checked']).toBe(false)
  expect(String(options[0].props.class)).not.toContain('is-selected')
  expect(options[2].props['aria-checked']).toBe(true)
  expect(String(options[2].props.class)).toContain('is-selected')
  app.unmount()
})

it('uses the existing locale setter from the language dropdown and retains stored scroll settings', async () => {
  vi.stubGlobal('localStorage', { setItem: vi.fn() })
  setLyricsScrollPreset('emphasized')
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
  expect(getLyricsScrollPreset()).toBe('emphasized')
  const scrollGroup = find(root, (node) => node.props.id === 'appearance-lyrics-scroll')!
  const scrollOptions = scrollGroup.children.filter((node) => node.props.role === 'radio')
  expect(scrollOptions[3].props['aria-checked']).toBe(true)

  const trigger = find(root, (node) => node.props.id === 'appearance-language')!
  expect(trigger.props.role).toBe('combobox')
  expect(find(trigger, (node) => node.props.id === 'appearance-language-value')?.text).toBe(
    '简体中文',
  )
  ;(trigger.props.onClick as () => void)()
  await nextTick()
  const english = find(body, (node) => node.props.id === 'appearance-language-option-1')!
  ;(english.props.onClick as () => void)()
  await nextTick()
  expect(localeApi.setUiLocale).toHaveBeenLastCalledWith('en')
  const value = find(trigger, (node) => node.props.id === 'appearance-language-value')!
  expect(value.text).toBe('English')
  expect(value.props.lang).toBe('en')
  expect(trigger.focused).toBe(true)
  expect(trigger.props['aria-expanded']).toBe(false)
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
