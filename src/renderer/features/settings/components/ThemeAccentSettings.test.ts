import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, nextTick } from 'vue'
import { useTheme } from '@renderer/composables/useTheme'
import { useDarkAccent } from '@renderer/features/appearance/composables/useDarkAccent'
import { useLightAccent } from '@renderer/features/appearance/composables/useLightAccent'
import ThemeAccentSettings from './ThemeAccentSettings.vue'

vi.mock('@vueuse/core', () => ({ useEventListener: vi.fn() }))

vi.mock('vue-i18n', async () => {
  const { ref } = await import('vue')
  const messages: Record<string, string> = {
    'settings.appearance.themeLight': '浅色',
    'settings.appearance.themeDark': '深色',
    'settings.appearance.accent.title': '强调色',
    'settings.appearance.accent.change': '更改',
    'settings.appearance.accent.close': '收起',
    'settings.appearance.accent.restoreDefault': '恢复默认',
    'settings.appearance.accent.preview': '效果预览',
    'settings.appearance.accent.previewSample': 'Aa 123',
    'settings.appearance.accent.alphaRejected': '强调色需为不透明颜色。',
    'settings.appearance.accent.invalidColor': '请输入有效的六位 HEX 颜色。',
    'settings.appearance.accent.persistFailed': '颜色已在本次会话中保留，保存未完成。',
    'settings.appearance.accent.pickerLabel': '{theme}强调色选择器',
    'settings.appearance.accent.presetColor': '预设颜色',
    'settings.appearance.accent.currentColor': '当前颜色：{color}',
    'settings.appearance.accent.hexField': '十六进制颜色',
    'settings.appearance.accent.saturationBrightnessSlider': '饱和度和明度',
    'settings.appearance.accent.saturationBrightnessValue':
      '饱和度：{saturation}%，明度：{brightness}%',
    'settings.appearance.accent.presetListLabel': '选择要应用的预设颜色',
  }
  const t = (key: string, values?: Record<string, unknown>): string => {
    let message = messages[key] ?? key
    for (const [name, value] of Object.entries(values ?? {})) {
      message = message.replace(`{${name}}`, String(value))
    }
    return message
  }
  const locale = ref('zh-Hans')
  return { useI18n: () => ({ locale, t }) }
})

vi.mock('vue-color', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-color')>()
  const { defineComponent, h } = await import('vue')
  const SketchPicker = defineComponent({
    props: {
      tinyColor: { type: Object, required: true },
      presetColors: { type: Array, default: () => [] },
      disableAlpha: { type: Boolean, default: false },
    },
    emits: ['update:tinyColor'],
    setup(props, { emit }) {
      return () =>
        h('div', { class: 'vc-sketch-picker' }, [
          h('div', { role: 'application' }),
          h('div', { class: 'vc-saturation-slider', role: 'application' }, [
            h('div', {
              role: 'slider',
              'aria-label': 'Saturation and Brightness',
              'aria-valuetext': 'Saturation: 50%, brightness: 50%',
            }),
          ]),
          h(
            'div',
            { class: 'presets', role: 'listbox' },
            (props.presetColors as string[]).map((color) =>
              h(
                'button',
                {
                  type: 'button',
                  class: 'preset-color',
                  role: 'option',
                  title: color,
                  onClick: () => emit('update:tinyColor', actual.tinycolor(color)),
                },
                color,
              ),
            ),
          ),
          h('div', { class: 'active-color' }),
          h('input', {
            class: 'vc-input-input',
            'aria-label': 'Hex',
            value: (props.tinyColor as { toHexString(): string }).toHexString(),
            onInput: (event: { target: { value: string } }) =>
              emit('update:tinyColor', actual.tinycolor(event.target.value)),
          }),
        ])
    },
  })
  return { ...actual, SketchPicker }
})

interface TestNode {
  type: string
  props: Record<string, unknown>
  children: TestNode[]
  parent: TestNode | null
  ownerDocument: { body: { offsetHeight: number } }
  classList: {
    add(...tokens: string[]): void
    remove(...tokens: string[]): void
    contains(token: string): boolean
  }
  text?: string
  focused?: boolean
  querySelector(selector: string): TestNode | null
  querySelectorAll(selector: string): TestNode[]
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  closest(selector: string): TestNode | null
  focus(): void
  click(): void
}

function classNames(node: TestNode): string[] {
  const value = node.props.class
  if (typeof value === 'string') return value.split(/\s+/u).filter(Boolean)
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([name]) => name)
  }
  return []
}

function matchesSimpleSelector(node: TestNode, selector: string): boolean {
  const requiredClasses = Array.from(selector.matchAll(/\.([\w-]+)/gu), (match) => match[1])
  if (!requiredClasses.every((name) => classNames(node).includes(name))) return false

  const requiredAttributes = Array.from(
    selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/gu),
    (match) => [match[1], match[2]] as const,
  )
  return requiredAttributes.every(([name, value]) => {
    const actual = node.getAttribute(name)
    return actual !== null && (value === undefined || actual === value)
  })
}

function matchesSelector(node: TestNode, selector: string): boolean {
  const parts = selector.trim().split(/\s+/u)
  if (!matchesSimpleSelector(node, parts.at(-1) ?? '')) return false

  let ancestor = node.parent
  for (let index = parts.length - 2; index >= 0; index -= 1) {
    while (ancestor && !matchesSimpleSelector(ancestor, parts[index])) ancestor = ancestor.parent
    if (!ancestor) return false
    ancestor = ancestor.parent
  }
  return true
}

function descendants(node: TestNode): TestNode[] {
  return node.children.flatMap((child) => [child, ...descendants(child)])
}

function invokeProp(node: TestNode, name: string, event?: unknown): void {
  const handler = node.props[name]
  if (Array.isArray(handler)) {
    handler.forEach((entry) => {
      if (typeof entry === 'function') entry(event)
    })
  } else if (typeof handler === 'function') {
    handler(event)
  }
}

function closestNode(node: TestNode, selector: string): TestNode | null {
  let candidate: TestNode | null = node
  while (candidate) {
    if (matchesSimpleSelector(candidate, selector)) return candidate
    candidate = candidate.parent
  }
  return null
}

function createTestNode(type: string): TestNode {
  const transitionClasses = new Set<string>()
  const node: TestNode = {
    type,
    props: {},
    children: [],
    parent: null,
    ownerDocument: { body: { offsetHeight: 0 } },
    classList: {
      add: (...tokens) => tokens.forEach((token) => transitionClasses.add(token)),
      remove: (...tokens) => tokens.forEach((token) => transitionClasses.delete(token)),
      contains: (token) => transitionClasses.has(token),
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null
    },
    querySelectorAll(selector) {
      return descendants(this).filter((candidate) => matchesSelector(candidate, selector))
    },
    getAttribute(name) {
      const value = this.props[name]
      return value === undefined || value === null ? null : String(value)
    },
    setAttribute(name, value) {
      this.props[name] = value
    },
    closest(selector) {
      return closestNode(this, selector)
    },
    focus() {
      this.focused = true
    },
    click() {
      invokeProp(this, 'onClick', { target: this })
    },
  }
  return node
}

const renderer = createRenderer<TestNode, TestNode>({
  patchProp(element, key, _previous, next) {
    element.props[key] = next
  },
  insert(element, parent, anchor) {
    element.parent = parent
    const anchorIndex = anchor ? parent.children.indexOf(anchor) : -1
    if (anchorIndex < 0) parent.children.push(element)
    else parent.children.splice(anchorIndex, 0, element)
  },
  remove(element) {
    if (element.parent) {
      element.parent.children = element.parent.children.filter((child) => child !== element)
      element.parent = null
    }
  },
  createElement: createTestNode,
  createText(text) {
    const node = createTestNode('#text')
    node.text = text
    return node
  },
  createComment(text) {
    const node = createTestNode('#comment')
    node.text = text
    return node
  },
  setText(node, text) {
    node.text = text
  },
  setElementText(node, text) {
    node.text = text
    node.children = []
  },
  parentNode(node) {
    return node.parent
  },
  nextSibling(node) {
    if (!node.parent) return null
    return node.parent.children[node.parent.children.indexOf(node) + 1] ?? null
  },
})

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>()
  readonly writes: string[] = []
  failWrites = false

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.writes.push(key)
    if (this.failWrites) throw new Error('write blocked')
    this.values.set(key, String(value))
  }
}

function findAll(root: TestNode, predicate: (node: TestNode) => boolean): TestNode[] {
  return descendants(root).filter(predicate)
}

function findClass(root: TestNode, className: string): TestNode | undefined {
  return findAll(root, (node) => classNames(node).includes(className))[0]
}

function nodeText(node: TestNode): string {
  return `${node.text ?? ''}${node.children.map(nodeText).join('')}`
}

function dispatchKey(target: TestNode, key: string) {
  let prevented = false
  let stopped = false
  const event = {
    key,
    target,
    get prevented() {
      return prevented
    },
    get stopped() {
      return stopped
    },
    preventDefault() {
      prevented = true
    },
    stopPropagation() {
      stopped = true
    },
  }
  let current: TestNode | null = target
  while (current) {
    invokeProp(current, 'onKeydown', event)
    if (event.stopped) break
    current = current.parent
  }
  return event
}

let storage: MemoryStorage
let mountedApps: Array<{ unmount(): void }>
const darkState = useDarkAccent()
const lightState = useLightAccent()
const themeState = useTheme()

async function mountSettings(): Promise<TestNode> {
  const root = createTestNode('root')
  const app = renderer.createApp(ThemeAccentSettings)
  mountedApps.push(app)
  app.mount(root)
  await nextTick()
  return root
}

async function clickAndFlush(node: TestNode): Promise<void> {
  node.click()
  await nextTick()
  await nextTick()
}

beforeEach(async () => {
  storage = new MemoryStorage()
  mountedApps = []
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      getComputedStyle: () => ({
        transitionDelay: '0s',
        transitionDuration: '0s',
        transitionProperty: 'none',
        animationDelay: '0s',
        animationDuration: '0s',
      }),
    }),
  )
  vi.stubGlobal(
    'document',
    Object.assign(new EventTarget(), {
      body: { offsetHeight: 0 },
      documentElement: {
        dataset: {} as Record<string, string>,
        style: { colorScheme: '', setProperty: vi.fn() },
      },
    }),
  )
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })

  darkState.resetDarkAccent()
  darkState.setDarkAccent('#22D3EE')
  lightState.resetLightAccent()
  lightState.setLightAccent('#FB7185')
  await themeState.setTheme('light')
  storage.writes.length = 0
})

afterEach(() => {
  mountedApps.forEach((app) => app.unmount())
  vi.unstubAllGlobals()
})

describe('ThemeAccentSettings', () => {
  it('follows the app theme immediately and removes the editing theme selector', async () => {
    const root = await mountSettings()
    await clickAndFlush(findClass(root, 'dark-accent-toggle')!)
    expect(findAll(root, (node) => node.getAttribute('role') === 'radio')).toHaveLength(0)
    expect(findClass(root, 'dark-accent-editor-row')).toBeUndefined()
    expect(findClass(root, 'vc-input-input')?.getAttribute('value')).toBe('#fb7185')
    const oldPicker = findClass(root, 'vc-sketch-picker')!

    await themeState.setTheme('dark')
    await nextTick()
    await nextTick()
    expect(findClass(root, 'vc-sketch-picker')).not.toBe(oldPicker)
    expect(findClass(root, 'vc-input-input')?.getAttribute('value')).toBe('#22d3ee')
    expect(findClass(root, 'dark-accent-picker-host')?.getAttribute('aria-label')).toContain('深色')
    expect((document.documentElement as HTMLElement).dataset.theme).toBe('dark')
    expect(storage.writes).toEqual(['auralis-theme'])
  })

  it('reopens with the current application theme', async () => {
    const root = await mountSettings()
    await clickAndFlush(findClass(root, 'dark-accent-toggle')!)
    await clickAndFlush(findClass(root, 'dark-accent-toggle')!)
    expect(findClass(root, 'dark-accent-toggle')?.getAttribute('aria-expanded')).toBe('false')
    await themeState.setTheme('dark')
    await clickAndFlush(findClass(root, 'dark-accent-toggle')!)
    expect(findClass(root, 'vc-input-input')?.getAttribute('value')).toBe('#22d3ee')
  })

  it.each(['light', 'dark'] as const)('writes only the %s application accent', async (mode) => {
    await themeState.setTheme(mode)
    storage.writes.length = 0
    const root = await mountSettings()
    await clickAndFlush(findClass(root, 'dark-accent-toggle')!)
    invokeProp(findClass(root, 'vc-input-input')!, 'onInput', { target: { value: '#60A5FA' } })
    await nextTick()
    expect(mode === 'light' ? lightState.lightAccent.value : darkState.darkAccent.value).toBe(
      '#60A5FA',
    )
    expect(mode === 'light' ? darkState.darkAccent.value : lightState.lightAccent.value).toBe(
      mode === 'light' ? '#22D3EE' : '#FB7185',
    )
    expect(storage.writes).toEqual([`auralis-${mode}-accent`])
  })

  it('ignores a stale picker update during an application theme change', async () => {
    const root = await mountSettings()
    await clickAndFlush(findClass(root, 'dark-accent-toggle')!)
    const oldInput = findClass(root, 'vc-input-input')!
    const changedTheme = themeState.setTheme('dark')
    invokeProp(oldInput, 'onInput', { target: { value: '#60A5FA' } })
    await changedTheme
    await nextTick()
    expect(lightState.lightAccent.value).toBe('#FB7185')
    expect(darkState.darkAccent.value).toBe('#22D3EE')
    expect(storage.writes).toEqual(['auralis-theme'])
  })

  it('clears invalid input and refreshes accessibility when the app theme changes', async () => {
    const root = await mountSettings()
    await clickAndFlush(findClass(root, 'dark-accent-toggle')!)
    invokeProp(findClass(root, 'vc-input-input')!, 'onInput', { target: { value: 'not-a-color' } })
    await nextTick()
    expect(nodeText(root)).toContain('请输入有效的六位 HEX 颜色。')
    await themeState.setTheme('dark')
    await nextTick()
    await nextTick()
    expect(nodeText(root)).not.toContain('请输入有效的六位 HEX 颜色。')
    expect(findClass(root, 'vc-input-input')?.getAttribute('value')).toBe('#22d3ee')
    expect(findClass(root, 'vc-input-input')?.getAttribute('aria-label')).toBe('十六进制颜色')
  })

  it.each(['light', 'dark'] as const)('resets only the %s application accent', async (mode) => {
    await themeState.setTheme(mode)
    storage.writes.length = 0
    const root = await mountSettings()
    await clickAndFlush(findClass(root, 'dark-accent-toggle')!)
    await clickAndFlush(findClass(root, 'dark-accent-reset')!)
    expect(mode === 'light' ? lightState.lightAccent.value : darkState.darkAccent.value).toBe(
      mode === 'light' ? '#585B5F' : '#1DD55F',
    )
    expect(mode === 'light' ? darkState.darkAccent.value : lightState.lightAccent.value).toBe(
      mode === 'light' ? '#22D3EE' : '#FB7185',
    )
    expect(storage.writes).toEqual([`auralis-${mode}-accent`])
  })

  it('shows write failures only for the current app theme', async () => {
    const root = await mountSettings()
    await clickAndFlush(findClass(root, 'dark-accent-toggle')!)
    await themeState.setTheme('dark')
    await nextTick()
    storage.failWrites = true
    invokeProp(findClass(root, 'vc-input-input')!, 'onInput', { target: { value: '#F472B6' } })
    await nextTick()
    expect(nodeText(root)).toContain('颜色已在本次会话中保留，保存未完成。')
    await themeState.setTheme('light')
    await nextTick()
    expect(nodeText(root)).not.toContain('颜色已在本次会话中保留，保存未完成。')
    await themeState.setTheme('dark')
    await nextTick()
    expect(nodeText(root)).toContain('颜色已在本次会话中保留，保存未完成。')
  })

  it('handles Escape and returns focus to the trigger', async () => {
    const root = await mountSettings()
    const trigger = findClass(root, 'dark-accent-toggle')!
    await clickAndFlush(trigger)
    dispatchKey(findClass(root, 'dark-accent-preview-card')!, 'Escape')
    await nextTick()
    await nextTick()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.focused).toBe(true)
  })

  it.each(['light', 'dark'] as const)('previews the %s application accent', async (mode) => {
    await themeState.setTheme(mode)
    const root = await mountSettings()
    await clickAndFlush(findClass(root, 'dark-accent-toggle')!)
    const card = findClass(root, 'dark-accent-preview-card')!
    const style = card.props.style as Record<string, unknown>
    expect(style['--dark-accent-preview']).toBe(
      mode === 'light' ? lightState.resolution.value.display : darkState.resolution.value.display,
    )
    expect(style['--dark-accent-on-preview']).toBe(mode === 'light' ? '#FFFFFF' : '#121212')
  })
})
