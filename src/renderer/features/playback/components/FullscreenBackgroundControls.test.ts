import { createRenderer, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FullscreenLyricsTypography } from '@renderer/features/lyrics/constants/fullscreenLyricsTypography'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../composables/useFullscreenBackground', () => ({
  useFullscreenBackground: () => backgroundState,
}))
vi.mock('@renderer/features/lyrics/composables/useFullscreenLyricsTypography', () => ({
  useFullscreenLyricsTypography: () => typographyState,
}))
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    Transition: {
      inheritAttrs: false,
      setup(_props: unknown, { slots }: { slots: { default: () => unknown } }) {
        return () => slots.default()
      },
    },
  }
})

const typographyState = {
  preference: ref<FullscreenLyricsTypography>({
    fontSizePercent: 100,
    fontWeight: 800,
    lineGapPercent: 100,
  }),
  persistFailed: ref(false),
  setPreference: vi.fn((patch: Partial<FullscreenLyricsTypography>) => {
    typographyState.preference.value = { ...typographyState.preference.value, ...patch }
  }),
  resetPreference: vi.fn(() => {
    typographyState.preference.value = {
      fontSizePercent: 100,
      fontWeight: 800,
      lineGapPercent: 100,
    }
  }),
}

const backgroundState = {
  backgroundMode: ref<'metal' | 'fluid'>('metal'),
  backgroundMotionPaused: ref(false),
  metalSettings: ref({ speed: 0.5, folds: 0.5, roughness: 0.5 }),
  setBackgroundMode: vi.fn(
    (mode: 'metal' | 'fluid') => (backgroundState.backgroundMode.value = mode),
  ),
  setBackgroundMotionPaused: vi.fn(),
  setMetalSettings: vi.fn(),
  resetMetalSettings: vi.fn(),
}

class TestNode {
  props: Record<string, unknown> = {}
  children: TestNode[] = []
  parent: TestNode | null = null
  text = ''

  constructor(public type = 'node') {}

  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join('')
  }

  focus(): void {
    ;(document as unknown as { activeElement: TestNode }).activeElement = this
  }

  getBoundingClientRect(): {
    left: number
    right: number
    top: number
    bottom: number
    width: number
    height: number
  } {
    return { left: 100, right: 248, top: 100, bottom: 130, width: 148, height: 30 }
  }

  closest(): null {
    return null
  }

  querySelector(): null {
    return null
  }
}

let body: TestNode
let app: ReturnType<typeof renderer.createApp> | undefined
let controlsInstance: { close: (restoreFocus?: boolean) => boolean } | null = null

const renderer = createRenderer<TestNode, TestNode>({
  createElement: (type) => new TestNode(type),
  createText: (text) => Object.assign(new TestNode('#text'), { text }),
  createComment: () => new TestNode('#comment'),
  insert(child, parent, anchor) {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(child)
    else parent.children.splice(index, 0, child)
  },
  remove(child) {
    if (!child.parent) return
    child.parent.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = null
  },
  setText: (node, text) => (node.text = text),
  setElementText: (node, text) => {
    node.text = text
    node.children = []
  },
  parentNode: (node) => node.parent,
  nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  patchProp: (node, key, _previous, value) => (node.props[key] = value),
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

async function flush(): Promise<void> {
  await nextTick()
  await nextTick()
}

async function mount(): Promise<void> {
  const { default: loaded } = await import('./FullscreenBackgroundControls.vue')
  const componentRef = ref<{ close: (restoreFocus?: boolean) => boolean } | null>(null)
  app = renderer.createApp({
    setup: () => () => h(loaded, { ref: componentRef }),
  })
  app.directive('tooltip', {})
  body = new TestNode('root')
  app.mount(body)
  controlsInstance = componentRef.value
  await flush()
  trigger(
    find((node) => node.props['aria-controls'] === 'fullscreen-background-panel'),
    'Click',
    {},
  )
  await flush()
}

function trigger(node: TestNode | undefined, event: string, payload: unknown): void {
  const handler = node?.props[`on${event}`]
  if (typeof handler === 'function') (handler as (event: unknown) => void)(payload)
}

beforeEach(() => {
  body = new TestNode('body')
  typographyState.preference.value = { fontSizePercent: 100, fontWeight: 800, lineGapPercent: 100 }
  typographyState.persistFailed.value = false
  typographyState.setPreference.mockClear()
  typographyState.resetPreference.mockClear()
  backgroundState.backgroundMode.value = 'metal'
  backgroundState.setBackgroundMode.mockClear()
  vi.stubGlobal('Node', TestNode)
  vi.stubGlobal('HTMLElement', TestNode)
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 900,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  vi.stubGlobal('document', {
    body,
    activeElement: body,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

afterEach(async () => {
  app?.unmount()
  app = undefined
  controlsInstance = null
  await flush()
  vi.unstubAllGlobals()
})

describe('FullscreenBackgroundControls lyrics typography group', () => {
  it('renders the lyrics group after background and sends typed input updates', async () => {
    await mount()
    const headers = [] as string[]
    const backgroundHeader = find((node) => node.props.class === 'settings-group-title')
    if (backgroundHeader) headers.push(backgroundHeader.textContent)
    const lyricsHeader = find((node) => node.textContent === 'fullscreen.lyrics.section')
    if (lyricsHeader) headers.push(lyricsHeader.textContent)
    expect(headers).toEqual(['fullscreen.background.section', 'fullscreen.lyrics.section'])

    trigger(
      find((node) => node.props['data-lyrics-typography'] === 'font-size'),
      'Input',
      { target: { value: '125' } },
    )
    trigger(
      find((node) => node.props.id === 'fullscreen-lyrics-font-weight'),
      'Click',
      {},
    )
    await flush()
    const weightMenu = find((node) => node.props.id === 'fullscreen-lyrics-font-weight-menu')
    expect(weightMenu?.props.role).toBe('listbox')
    expect(weightMenu?.props.style).toMatchObject({ width: '148px', left: '100px' })
    expect(weightMenu?.parent?.props.class).toBe('fullscreen-background-controls')
    trigger(
      find(
        (node) =>
          node.props.role === 'option' && node.textContent === 'fullscreen.lyrics.weights.600',
      ),
      'Click',
      {},
    )
    await flush()
    expect(find((node) => node.props.id === 'fullscreen-lyrics-font-weight-menu')).toBeUndefined()
    expect(find((node) => node.props.id === 'fullscreen-background-panel')).toBeDefined()
    trigger(
      find((node) => node.props['data-lyrics-typography'] === 'line-gap'),
      'Input',
      { target: { value: '80' } },
    )

    expect(typographyState.setPreference.mock.calls).toEqual([
      [{ fontSizePercent: 125 }],
      [{ fontWeight: 600 }],
      [{ lineGapPercent: 80 }],
    ])
  })

  it('resets only lyrics, keeps controls available for both backgrounds and shows save feedback', async () => {
    await mount()
    typographyState.preference.value = { fontSizePercent: 125, fontWeight: 600, lineGapPercent: 80 }
    await flush()
    trigger(
      find((node) => node.props['data-background-mode'] === 'fluid'),
      'Click',
      {},
    )
    await flush()
    expect(find((node) => node.props['data-lyrics-typography'] === 'font-size')).toBeDefined()

    trigger(
      find((node) => node.props['data-lyrics-typography-reset'] !== undefined),
      'Click',
      {},
    )
    await flush()
    expect(typographyState.resetPreference).toHaveBeenCalledOnce()
    expect(backgroundState.setBackgroundMode).toHaveBeenCalledWith('fluid')
    expect(
      find((node) => node.props['data-lyrics-typography-status'] !== undefined)?.textContent,
    ).toBe('fullscreen.lyrics.resetStatus')

    typographyState.persistFailed.value = true
    await flush()
    expect(
      find((node) => node.props['data-lyrics-typography-status'] !== undefined)?.textContent,
    ).toBe('fullscreen.lyrics.persistFailed')
  })

  it('supports silent close for overlay handoff and preserves default focus restoration', async () => {
    await mount()
    const toggle = find((node) => node.props['aria-controls'] === 'fullscreen-background-panel')!
    const outside = new TestNode('outside')
    const documentStub = document as unknown as { activeElement: TestNode }

    documentStub.activeElement = outside
    expect(controlsInstance?.close(false)).toBe(true)
    await flush()
    expect(documentStub.activeElement).toBe(outside)

    trigger(toggle, 'Click', {})
    await flush()
    documentStub.activeElement = outside
    expect(controlsInstance?.close()).toBe(true)
    await flush()
    expect(documentStub.activeElement?.props['aria-controls']).toBe('fullscreen-background-panel')
  })
})
