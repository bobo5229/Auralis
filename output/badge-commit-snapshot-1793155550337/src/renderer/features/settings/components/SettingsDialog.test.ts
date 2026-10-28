import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, nextTick, onUnmounted, type Component } from 'vue'
import SettingsDialog from './SettingsDialog.vue'
import { useSettingsDialog } from '../composables/useSettingsDialog'
import { loadSettingsContent } from '../utils/settingsContentLoader'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../utils/settingsContentLoader', () => ({ loadSettingsContent: vi.fn() }))
vi.mock('@renderer/shared/focus/useOverlayFocusTrap', () => ({ useOverlayFocusTrap: vi.fn() }))
vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    Transition: {
      inheritAttrs: false,
      setup(
        _props: unknown,
        { attrs, slots }: { attrs: Record<string, unknown>; slots: { default: () => unknown } },
      ) {
        transitionHooks = attrs
        return () => slots.default()
      },
    },
  }
})

class TestNode {
  style: Record<string, unknown> = {
    removeProperty: (name: string) => delete this.style[name],
  }
  events = new Map<string, (event: unknown) => void>()
  props: Record<string, unknown> = {}
  children: TestNode[] = []
  parent: TestNode | null = null
  text = ''
  scrollTop = 0
  isConnected = true
  constructor(public type = 'node') {}
  matches(): boolean {
    return false
  }
  closest(): null {
    return null
  }
  focus(): void {}
  querySelector(selector: string): TestNode | undefined {
    return find((node) => String(node.props.class).split(' ').includes(selector.slice(1)), this)
  }
  addEventListener(name: string, handler: (event: unknown) => void): void {
    this.events.set(name, handler)
  }
  removeEventListener(name: string): void {
    this.events.delete(name)
  }
  click(): void {
    const handler = this.props.onClick as (event: unknown) => void
    handler?.({ target: this, currentTarget: this })
  }
}

let body: TestNode
let transitionHooks: Record<string, unknown>
let app: ReturnType<typeof renderer.createApp> | undefined
const state = useSettingsDialog()
const unloaded = vi.fn()
const fakeContent = defineComponent({
  props: { section: { type: String, required: true } },
  setup(props) {
    onUnmounted(unloaded)
    return () => h('div', { 'data-content-section': props.section })
  },
})

const renderer = createRenderer<TestNode, TestNode>({
  createElement: (type) => new TestNode(type),
  createText: (text) => Object.assign(new TestNode(), { text }),
  createComment: () => new TestNode(),
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
  patchProp: (node, key, _previous, value) => {
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

function byClass(name: string): TestNode | undefined {
  return find((node) => String(node.props.class).split(' ').includes(name))
}

async function flush(): Promise<void> {
  await nextTick()
  await nextTick()
  await nextTick()
}

async function mount(): Promise<void> {
  app = renderer.createApp(SettingsDialog)
  app.mount(new TestNode('root'))
  await flush()
}

beforeEach(() => {
  vi.clearAllMocks()
  body = new TestNode('body')
  vi.stubGlobal('HTMLElement', TestNode)
  vi.stubGlobal('document', {
    body,
    activeElement: body,
    querySelector: () => null,
    documentElement: { dataset: { reducedMotion: 'false' } },
    fonts: { ready: Promise.resolve() },
  })
  state.closeSettings()
  state.selectSettingsSection('appearance')
  vi.mocked(loadSettingsContent).mockResolvedValue(fakeContent)
})

afterEach(async () => {
  app?.unmount()
  app = undefined
  await flush()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('SettingsDialog component', () => {
  it('keeps late content out of the active fade and mounts it when entry finishes', async () => {
    vi.useFakeTimers()
    const frames = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback)
      return frameId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    let resolve!: (value: Component) => void
    vi.mocked(loadSettingsContent).mockReturnValueOnce(new Promise((done) => (resolve = done)))
    await mount()
    state.openSettings()
    await flush()
    const backdrop = byClass('settings-dialog-backdrop')!
    const panel = byClass('settings-dialog-panel')!
    const done = vi.fn()
    ;(transitionHooks.onBeforeEnter as (node: TestNode) => void)(backdrop)
    ;(transitionHooks.onEnter as (node: TestNode, done: () => void) => void)(backdrop, done)
    vi.advanceTimersByTime(100)
    for (let paint = 0; paint < 3; paint++) {
      const pending = [...frames.values()]
      frames.clear()
      for (const callback of pending) callback(0)
    }
    resolve(fakeContent)
    await flush()
    expect(find((node) => Boolean(node.props['data-content-section']))).toBeUndefined()
    expect(byClass('settings-dialog-content')?.props['aria-busy']).toBe(true)
    panel.events.get('transitionend')!({ target: panel, propertyName: 'opacity' })
    await flush()
    expect(find((node) => node.props['data-content-section'] === 'appearance')).toBeDefined()
    expect(done).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows reduced-motion entry immediately, including reopening an interrupted entry', async () => {
    await mount()
    state.openSettings()
    await flush()
    const backdrop = byClass('settings-dialog-backdrop')!
    const panel = byClass('settings-dialog-panel')!
    panel.style.opacity = '0.01'
    document.documentElement.dataset.reducedMotion = 'true'
    const done = vi.fn()
    ;(transitionHooks.onBeforeEnter as (node: TestNode) => void)(backdrop)
    ;(transitionHooks.onEnter as (node: TestNode, done: () => void) => void)(backdrop, done)
    expect(panel.style.opacity).toBeUndefined()
    expect(done).toHaveBeenCalledOnce()
  })

  it('keeps the shell closable during loading and ignores completion after closing', async () => {
    let resolve!: (value: Component) => void
    vi.mocked(loadSettingsContent).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    await mount()
    state.openSettings()
    await flush()
    expect(byClass('settings-dialog-content')?.props['aria-busy']).toBe(true)
    byClass('settings-dialog-close')!.click()
    await flush()
    resolve(fakeContent)
    await flush()
    expect(state.isSettingsOpen.value).toBe(false)
    expect(find((node) => node.props.role === 'dialog')).toBeUndefined()
    expect(unloaded).not.toHaveBeenCalled()
  })

  it('renders failure feedback and reloads the content from the retry button', async () => {
    vi.mocked(loadSettingsContent).mockRejectedValueOnce(new Error('missing chunk'))
    await mount()
    state.openSettings()
    await flush()
    expect(find((node) => node.props.role === 'alert')).toBeDefined()
    find((node) => node.type === 'button' && node.text === 'settings.dialog.retry')!.click()
    await flush()
    expect(find((node) => node.props['data-content-section'] === 'appearance')).toBeDefined()
    expect(find((node) => node.props.role === 'alert')).toBeUndefined()
    expect(loadSettingsContent).toHaveBeenCalledTimes(2)
  })

  it('changes sections through the navigation and resets content scrolling', async () => {
    await mount()
    state.openSettings()
    await flush()
    byClass('settings-dialog-content')!.scrollTop = 300
    find((node) => node.props['data-settings-section'] === 'library')!.click()
    await flush()
    expect(find((node) => node.props['data-content-section'] === 'library')).toBeDefined()
    expect(byClass('settings-dialog-content')!.scrollTop).toBe(0)
  })

  it('closes from the backdrop, unmounts the content and reopens on the remembered section', async () => {
    await mount()
    state.openSettings('about')
    await flush()
    byClass('settings-dialog-backdrop')!.click()
    await flush()
    expect(state.isSettingsOpen.value).toBe(false)
    expect(unloaded).toHaveBeenCalledOnce()
    state.openSettings()
    await flush()
    expect(find((node) => node.props['data-content-section'] === 'about')).toBeDefined()
    expect(byClass('settings-dialog-content')!.scrollTop).toBe(0)
  })
})
