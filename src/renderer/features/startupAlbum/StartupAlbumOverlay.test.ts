import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRenderer, h, markRaw, nextTick } from 'vue'
import StartupAlbumOverlay from './StartupAlbumOverlay.vue'
import type { StartupAlbumPresentation } from './useStartupAlbum'
import type { CardSnapshot, createCardScene } from './rendering/scene'

const mocks = vi.hoisted(() => ({
  focusTrap: vi.fn(),
  onVisibility: vi.fn(),
  getVisibility: vi.fn(),
  play: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/app/layout/WindowTrafficLights.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@renderer/shared/focus/useOverlayFocusTrap', () => ({
  useOverlayFocusTrap: mocks.focusTrap,
}))
vi.mock('@renderer/shared/animation/motionPreference', () => ({
  createReducedMotionQuery: () => ({ matches: false }),
}))
vi.mock('@renderer/features/appearance/composables/useChineseTextDisplay', () => ({
  useChineseTextDisplay: () => ({ songText: (s: string) => s, songValues: (s: string) => s }),
}))
vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: () => ({ playTrackFromQueue: mocks.play }),
}))
vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: {
    window: { onVisibilityChanged: mocks.onVisibility, getVisibility: mocks.getVisibility },
  },
}))
vi.mock('./rendering/cardArtwork', () => ({ drawCardCanvas: vi.fn() }))
vi.mock('./rendering/cardAppearance', () => ({ createCardAppearance: () => ({}) }))
vi.mock('./rendering/cardTypography', () => ({
  cardTitleFamily: 'sans-serif',
  cardArtistFamily: 'sans-serif',
  loadCardFonts: () => Promise.resolve(),
}))

class TestNode {
  parent: TestNode | null = null
  children: TestNode[] = []
  props: Record<string, unknown> = {}
  style = { setProperty: vi.fn(), opacity: '' }
  textContent = ''
  focus = vi.fn()
  replaceChildren = vi.fn()
  constructor(public type: string) {}
}
const body = new TestNode('body')
const renderer = createRenderer<TestNode, TestNode>({
  createElement: (type) => markRaw(new TestNode(type)),
  createText: (text) => Object.assign(new TestNode('text'), { textContent: text }),
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
    node.textContent = text
  },
  setElementText: (node, text) => {
    node.textContent = text
  },
  parentNode: (node) => node.parent,
  nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  patchProp: (node, key, _old, value) => {
    node.props[key] = value
  },
  querySelector: () => body,
})
function find(node: TestNode, predicate: (node: TestNode) => boolean): TestNode | undefined {
  if (predicate(node)) return node
  for (const child of node.children) {
    const result = find(child, predicate)
    if (result) return result
  }
  return undefined
}
const frames = new Map<number, FrameRequestCallback>()
const documentVisibilityState = { hidden: false }
let frameId = 0
let visibility: (value: { isVisible: boolean }) => void
let documentVisibility: () => void
let unmount: (() => void) | undefined
const unsubscribe = vi.fn()
const canvas = { width: 0, height: 0, toDataURL: vi.fn(() => 'data:image/png;base64,fixture') }

async function flush() {
  for (let i = 0; i < 8; i++) await nextTick()
}
async function paint() {
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach((callback) => callback(performance.now()))
  await flush()
}
async function mount(createScene: StartupAlbumPresentation['createScene']) {
  const shown = vi.fn()
  const close = vi.fn()
  const app = renderer.createApp({
    render: () =>
      h(StartupAlbumOverlay, {
        presentation: {
          album: { albumArtist: 'Artist', album: 'Album', tracks: [{ id: 1 }] },
          cover: null,
          createScene,
        } as StartupAlbumPresentation,
        onShown: shown,
        onClose: close,
      }),
  })
  app.mount(new TestNode('root'))
  unmount = () => app.unmount()
  await flush()
  return { shown, close }
}
function sceneFixture(initial?: Partial<CardSnapshot>) {
  let notify: (value: CardSnapshot) => void
  const state = {
    frames: 0,
    cardRendered: false,
    disposed: false,
    contextLost: false,
    dropping: false,
    shattering: false,
    entering: true,
    entranceProgress: 0,
    ...initial,
  } as CardSnapshot
  const instance = {
    setVisible: vi.fn(),
    dispose: vi.fn(),
    getArtworkCanvas: () => canvas,
    shatter: vi.fn(() => true),
  }
  const createScene = vi.fn((_host: HTMLElement, onChange: (value: CardSnapshot) => void) => {
    notify = onChange
    notify({ ...state }) // Production construction sends a synchronous initial snapshot.
    return instance
  }) as unknown as typeof createCardScene
  return {
    createScene,
    instance,
    notify(patch: Partial<CardSnapshot>) {
      Object.assign(state, patch)
      notify({ ...state })
    },
  }
}

beforeEach(() => {
  body.children = []
  frames.clear()
  frameId = 0
  documentVisibilityState.hidden = false
  mocks.focusTrap.mockClear()
  mocks.getVisibility.mockResolvedValue({ isVisible: true })
  mocks.onVisibility.mockImplementation((listener) => {
    visibility = listener
    return unsubscribe
  })
  canvas.toDataURL.mockReset().mockReturnValue('data:image/png;base64,fixture')
  vi.stubGlobal('document', {
    get hidden() {
      return documentVisibilityState.hidden
    },
    createElement: () => canvas,
    querySelector: () => null,
    addEventListener: (name: string, listener: () => void) => {
      if (name === 'visibilitychange') documentVisibility = listener
    },
    removeEventListener: vi.fn(),
  })
  vi.stubGlobal('getComputedStyle', () => ({ opacity: '0', getPropertyValue: () => '0' }))
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})
afterEach(() => {
  unmount?.()
  unmount = undefined
  vi.unstubAllGlobals()
})

it('records only the first drawn WebGL card, including synchronous scene callbacks', async () => {
  const fixture = sceneFixture()
  const { shown } = await mount(fixture.createScene)
  expect(shown).not.toHaveBeenCalled()
  fixture.notify({ frames: 1 }) // An empty scene frame is not a shown card.
  await flush()
  expect(shown).not.toHaveBeenCalled()
  fixture.notify({ frames: 2, cardRendered: true })
  await flush()
  expect(shown).toHaveBeenCalledTimes(1)
  fixture.notify({ contextLost: true })
  fixture.notify({ frames: 3, contextLost: false })
  await flush()
  expect(shown).toHaveBeenCalledTimes(1)
  unmount?.()
  unmount = undefined
  expect(
    (await mount(sceneFixture({ frames: 1, cardRendered: true }).createScene)).shown,
  ).toHaveBeenCalledTimes(1)
})

it.each(['escape', 'unmount'])(
  'does not record a card cancelled before its first draw: %s',
  async (action) => {
    const fixture = sceneFixture()
    const { shown } = await mount(fixture.createScene)
    if (action === 'unmount') {
      unmount?.()
      unmount = undefined
    } else if (action === 'escape') {
      mocks.focusTrap.mock.calls.at(-1)![0].onEscape()
    }
    fixture.notify({ frames: 1, cardRendered: true })
    await flush()
    expect(shown).not.toHaveBeenCalled()
  },
)

function actions() {
  return ['play', 'skip'].map((action) =>
    find(body, (node) => node.props[`data-startup-${action}`] !== undefined),
  )
}

it.each([false, true])(
  'waits for the drawn entrance completion (reduced motion: %s)',
  async (reducedMotion) => {
    const fixture = sceneFixture({ reducedMotion })
    const { shown } = await mount(fixture.createScene)
    expect(actions()).toEqual([undefined, undefined])
    fixture.notify({ frames: 1, cardRendered: true, entranceProgress: 0.5 })
    await flush()
    expect(shown).toHaveBeenCalledTimes(1)
    expect(actions()).toEqual([undefined, undefined])
    // A state notification without a new rendered frame cannot reveal the buttons.
    fixture.notify({ entering: false, entranceProgress: 1 })
    await flush()
    expect(actions()).toEqual([undefined, undefined])
    visibility({ isVisible: false })
    fixture.notify({ frames: 2 })
    await flush()
    expect(actions()).toEqual([undefined, undefined])
    visibility({ isVisible: true })
    fixture.notify({ frames: 3 })
    await flush()
    expect(actions().every(Boolean)).toBe(true)
    expect(shown).toHaveBeenCalledTimes(1)
  },
)

it.each([true, false])(
  'hands focus to actions only from the entrance root (root focused: %s)',
  async (rootFocused) => {
    const fixture = sceneFixture()
    await mount(fixture.createScene)
    const root = find(body, (node) => node.props.role === 'dialog')!
    expect(mocks.focusTrap.mock.calls.at(-1)![0].initialFocus()).toBe(root)
    Object.assign(document, { activeElement: rootFocused ? root : new TestNode('button') })
    fixture.notify({ frames: 1, cardRendered: true, entering: false, entranceProgress: 1 })
    await flush()
    expect(actions()[0]!.focus).toHaveBeenCalledTimes(rootFocused ? 1 : 0)
  },
)

it.each(['play', 'skip'])(
  'hides actions and rejects repeated %s after entrance',
  async (action) => {
    const fixture = sceneFixture()
    await mount(fixture.createScene)
    fixture.notify({ frames: 1, cardRendered: true, entering: false, entranceProgress: 1 })
    await flush()
    const click = actions()[action === 'play' ? 0 : 1]!.props.onClick as () => void
    mocks.play.mockClear()
    click()
    click()
    await flush()
    expect(actions()).toEqual([undefined, undefined])
    expect(mocks.play).toHaveBeenCalledTimes(action === 'play' ? 1 : 0)
    expect(fixture.instance.shatter).toHaveBeenCalledTimes(action === 'skip' ? 1 : 0)
  },
)

it('does not record a hidden card and waits for a visible frame on resume', async () => {
  const fixture = sceneFixture()
  const { shown } = await mount(fixture.createScene)
  expect(actions()).toEqual([undefined, undefined])
  visibility({ isVisible: false })
  fixture.notify({ frames: 1, cardRendered: true })
  await flush()
  expect(shown).not.toHaveBeenCalled()
  visibility({ isVisible: true })
  await flush()
  expect(shown).not.toHaveBeenCalled()
  documentVisibilityState.hidden = true
  fixture.notify({ frames: 2 })
  await flush()
  expect(shown).not.toHaveBeenCalled()
  documentVisibilityState.hidden = false
  documentVisibility()
  fixture.notify({ frames: 3 })
  await flush()
  expect(shown).toHaveBeenCalledTimes(1)
})

it('waits for static PNG loading and a paint, then records once across context restoration', async () => {
  const fixture = sceneFixture({ contextLost: true })
  const { shown } = await mount(fixture.createScene)
  await paint()
  await paint()
  expect(shown).not.toHaveBeenCalled()
  const image = find(body, (node) => node.type === 'img')!
  ;(image.props.onLoad as () => void)()
  await flush()
  await paint()
  expect(shown).not.toHaveBeenCalled()
  expect(actions()).toEqual([undefined, undefined])
  await paint()
  expect(shown).toHaveBeenCalledTimes(1)
  expect(actions().every(Boolean)).toBe(true)
  fixture.notify({ frames: 1, cardRendered: true, contextLost: false })
  await flush()
  expect(shown).toHaveBeenCalledTimes(1)
  expect(actions()).toEqual([undefined, undefined])
  fixture.notify({ frames: 2, entering: false, entranceProgress: 1 })
  await flush()
  expect(actions().every(Boolean)).toBe(true)
})

it('cancels a pending static paint when hidden or closed and resumes only while open', async () => {
  const { shown } = await mount(null)
  const image = find(body, (node) => node.type === 'img')!
  ;(image.props.onLoad as () => void)()
  await flush()
  await paint()
  visibility({ isVisible: false })
  await paint()
  expect(shown).not.toHaveBeenCalled()
  visibility({ isVisible: true })
  await flush()
  await paint()
  mocks.focusTrap.mock.calls.at(-1)![0].onEscape()
  await paint()
  expect(shown).not.toHaveBeenCalled()
})

it('records the painted HTML fallback if PNG readback or decoding fails', async () => {
  canvas.toDataURL.mockImplementationOnce(() => {
    throw new Error('readback unavailable')
  })
  const first = await mount(null)
  await paint()
  expect(first.shown).not.toHaveBeenCalled()
  await paint()
  expect(first.shown).toHaveBeenCalledTimes(1)
  unmount?.()
  unmount = undefined
  const second = await mount(null)
  const image = find(body, (node) => node.type === 'img')!
  ;(image.props.onError as () => void)()
  await flush()
  await paint()
  await paint()
  expect(second.shown).toHaveBeenCalledTimes(1)
})
