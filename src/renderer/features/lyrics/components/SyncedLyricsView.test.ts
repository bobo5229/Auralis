import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, ref } from 'vue'
import SyncedLyricsView from './SyncedLyricsView.vue'
import { setLyricsScrollPreset } from '../lyricsScrollPreset'
import { useLyricsCountdownPreference } from '../lyricsCountdownPreference'
import { parseLrc } from '../utils/parseLrc'
import { getActiveLyricSegment } from '../utils/getActiveLyricSegment'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: () => ({ seekTo: vi.fn() }),
}))
vi.mock('@renderer/features/playback/composables/usePlayerDisplayMode', async () => {
  const { ref } = await import('vue')
  return { usePlayerDisplayMode: () => ({ displayMode: ref('normal') }) }
})
const reduced = ref(false)
vi.mock('../composables/useReducedMotion', () => ({
  useReducedMotion: () => ({ matches: reduced, dispose: vi.fn() }),
}))

class TestNode {
  parent: TestNode | null = null
  children: TestNode[] = []
  props: Record<string, unknown> = {}
  style = { transform: '' }
  scrollTop = 0
  scrollHeight = 400
  clientHeight = 100
  textContent = ''
  get offsetHeight(): number {
    return this.props['data-lyric-index'] !== undefined && this.getTextContent().length > 12
      ? 80
      : 20
  }
  get offsetTop(): number {
    return 80 + Number(this.props['data-lyric-index'] ?? 0) * 100
  }
  animate = vi.fn(() => ({
    cancel: vi.fn(),
    finished: new Promise<void>(() => undefined),
  }))
  constructor(public type: string) {}
  querySelectorAll(selector: string): TestNode[] {
    const matches: TestNode[] = []
    const visit = (node: TestNode): void => {
      if (selector === '[data-lyric-index]' && node.props['data-lyric-index'] !== undefined) {
        matches.push(node)
      }
      node.children.forEach(visit)
    }
    this.children.forEach(visit)
    return matches
  }
  querySelector(): TestNode | null {
    return null
  }
  getTextContent(): string {
    return this.textContent + this.children.map((child) => child.getTextContent()).join('')
  }
}

const renderer = createRenderer<TestNode, TestNode>({
  createElement: (type) => new TestNode(type),
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
})

function find(node: TestNode, className: string): TestNode | undefined {
  if (String(node.props.class).split(' ').includes(className)) return node
  for (const child of node.children) {
    const result = find(child, className)
    if (result) return result
  }
  return undefined
}

function findAll(node: TestNode, className: string): TestNode[] {
  const matches: TestNode[] = []
  const visit = (current: TestNode): void => {
    if (String(current.props.class).split(' ').includes(className)) matches.push(current)
    current.children.forEach(visit)
  }
  visit(node)
  return matches
}

afterEach(() => {
  setLyricsScrollPreset('standard')
  useLyricsCountdownPreference().setEffect('lighting')
  reduced.value = false
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

beforeEach(() => {
  vi.stubGlobal('document', {
    hidden: false,
    fonts: { ready: Promise.resolve() },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  vi.stubGlobal('getComputedStyle', () => ({ transform: 'none' }))
})

it('updates enhanced words inside a memoized row and resets on backward seeks without rebuilding it', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const lines = parseLrc('[00:01]<00:01>A <00:02>B<00:03>')
  const time = ref(1.5)
  const root = new TestNode('root')
  const app = renderer.createApp({
    setup: () => () => {
      const state = getActiveLyricSegment(lines[0], time.value)
      return h(SyncedLyricsView, {
        lines,
        activeIndex: 0,
        startedSegmentIndex: state.startedIndex,
        activeSegmentIndex: state.activeIndex,
        isPrelude: false,
        showPrelude: false,
        preludeLitDotCount: 0,
      })
    },
  })
  app.mount(root)
  await nextTick()
  const row = root.querySelectorAll('[data-lyric-index]')[0]
  const pending = () => find(row, 'lyric-segment-pending')
  expect(row.getTextContent()).toBe('A B')
  expect(pending()?.getTextContent()).toBe('B')
  time.value = 2
  await nextTick()
  expect(root.querySelectorAll('[data-lyric-index]')[0]).toBe(row)
  expect(pending()).toBeUndefined()
  time.value = 1
  await nextTick()
  expect(pending()?.getTextContent()).toBe('B')
  time.value = 0
  await nextTick()
  expect(pending()?.getTextContent()).toBe('A ')
  app.unmount()
})

it('applies the selected curve on the next normal-panel lyric transition and skips motion when reduced', async () => {
  vi.stubGlobal('localStorage', { setItem: vi.fn() })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const lines = [
    { id: '0', text: 'First', timeSeconds: 0 },
    { id: '1', text: 'Second', timeSeconds: 2 },
  ]
  const activeIndex = ref(0)
  const root = new TestNode('root')
  const app = renderer.createApp({
    setup: () => () =>
      h(SyncedLyricsView, {
        lines,
        activeIndex: activeIndex.value,
        isPrelude: false,
        showPrelude: false,
        preludeLitDotCount: 0,
      }),
  })
  app.mount(root)
  await nextTick()
  await nextTick()
  const track = find(root, 'synced-lyrics-track')!
  setLyricsScrollPreset('quick')
  activeIndex.value = 1
  await nextTick()
  await nextTick()
  expect(track.animate).toHaveBeenCalledWith(
    expect.any(Array),
    expect.objectContaining({ easing: 'cubic-bezier(0, 0, 0.2, 1)' }),
  )

  reduced.value = true
  activeIndex.value = 0
  await nextTick()
  await nextTick()
  expect(track.animate).toHaveBeenCalledTimes(1)
  app.unmount()
})

it('remeasures and immediately aligns a same-length replacement with new line geometry', async () => {
  vi.stubGlobal('localStorage', { setItem: vi.fn() })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const lines = ref([
    { id: '0', text: 'Short', timeSeconds: 0 },
    { id: '1', text: 'Second', timeSeconds: 2 },
  ])
  const root = new TestNode('root')
  const app = renderer.createApp({
    setup: () => () =>
      h(SyncedLyricsView, {
        lines: lines.value,
        activeIndex: 0,
        isPrelude: false,
        showPrelude: false,
        preludeLitDotCount: 0,
      }),
  })
  app.mount(root)
  await nextTick()
  await nextTick()
  const track = find(root, 'synced-lyrics-track')!
  expect(track.style.transform).toBe('translate3d(0, -60px, 0)')

  lines.value = [
    { id: '0', text: 'A much longer replacement line', timeSeconds: 0 },
    { id: '1', text: 'Second', timeSeconds: 2 },
  ]
  await nextTick()
  await nextTick()

  expect(track.style.transform).toBe('translate3d(0, -90px, 0)')
  expect(track.animate).not.toHaveBeenCalled()

  const scroll = find(root, 'synced-lyrics-scroll')!
  const onWheel = scroll.props.onWheel
  if (typeof onWheel === 'function') onWheel({})
  scroll.scrollTop = 17
  lines.value = [
    { id: '0', text: 'Short again', timeSeconds: 0 },
    { id: '1', text: 'Second', timeSeconds: 2 },
  ]
  await nextTick()
  await nextTick()
  expect(scroll.scrollTop).toBe(17)

  app.unmount()
})

it('cancels hidden-window follow and realigns the latest replacement when the native window returns', async () => {
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
  const disconnect = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect = disconnect
    },
  )
  const lines = ref([
    { id: '0', text: 'First', timeSeconds: 0 },
    { id: '1', text: 'Second', timeSeconds: 2 },
  ])
  const activeIndex = ref(0)
  const root = new TestNode('root')
  const app = renderer.createApp({
    setup: () => () =>
      h(SyncedLyricsView, {
        lines: lines.value,
        activeIndex: activeIndex.value,
        isPrelude: false,
        showPrelude: false,
        preludeLitDotCount: 0,
      }),
  })
  app.mount(root)
  await nextTick()
  await nextTick()
  await nextTick()
  const track = find(root, 'synced-lyrics-track')!
  expect(track.style.transform).toBe('translate3d(0, -60px, 0)')
  activeIndex.value = 1
  await nextTick()
  await nextTick()
  expect(track.animate).toHaveBeenCalledTimes(1)
  const running = track.animate.mock.results[0].value
  visibility({ isVisible: false })
  await nextTick()
  expect(document.hidden).toBe(false)
  expect(running.cancel).toHaveBeenCalledOnce()
  expect(disconnect).toHaveBeenCalled()
  expect(String(find(root, 'synced-lyrics-scroll')!.props.class)).toContain(
    'synced-lyrics-scroll--inactive',
  )
  lines.value = [{ id: 'replacement', text: 'A much longer replacement line', timeSeconds: 4 }]
  activeIndex.value = 0
  await nextTick()
  await nextTick()
  expect(track.animate).toHaveBeenCalledTimes(1)
  expect(track.querySelectorAll('[data-lyric-index]').map((line) => line.getTextContent())).toEqual(
    ['A much longer replacement line'],
  )
  visibility({ isVisible: true })
  await nextTick()
  await nextTick()
  expect(track.style.transform).toBe('translate3d(0, -90px, 0)')
  expect(String(find(root, 'synced-lyrics-scroll')!.props.class)).not.toContain(
    'synced-lyrics-scroll--inactive',
  )
  expect(track.animate).toHaveBeenCalledTimes(1)
  app.unmount()
  expect(unsubscribe).toHaveBeenCalledOnce()
})

it('respects panel activity, resumes manual scrolling, and remains usable without a preload API', async () => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const active = ref(true)
  const activeIndex = ref(0)
  const lines = [
    { id: '0', text: 'First', timeSeconds: 0 },
    { id: '1', text: 'Second', timeSeconds: 2 },
  ]
  const root = new TestNode('root')
  const app = renderer.createApp({
    setup: () => () =>
      h(SyncedLyricsView, {
        active: active.value,
        lines,
        activeIndex: activeIndex.value,
        isPrelude: false,
        showPrelude: false,
        preludeLitDotCount: 0,
      }),
  })
  app.mount(root)
  await nextTick()
  await nextTick()
  const track = find(root, 'synced-lyrics-track')!
  const scroll = find(root, 'synced-lyrics-scroll')!
  ;(scroll.props.onWheel as () => void)()
  scroll.scrollTop = 17
  activeIndex.value = 1
  await nextTick()
  await nextTick()
  expect(scroll.scrollTop).toBe(17)
  expect(track.animate).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(3000)
  expect(scroll.scrollTop).toBe(0)
  expect(track.animate).toHaveBeenCalledOnce()
  ;(scroll.props.onWheel as () => void)()
  active.value = false
  await nextTick()
  expect(vi.getTimerCount()).toBe(0)
  activeIndex.value = 0
  await nextTick()
  await nextTick()
  expect(track.animate).toHaveBeenCalledOnce()
  active.value = true
  await nextTick()
  await nextTick()
  expect(track.style.transform).toBe('translate3d(0, -60px, 0)')
  expect(track.animate).toHaveBeenCalledOnce()
  app.unmount()
  expect(document.removeEventListener).toHaveBeenCalledWith(
    'visibilitychange',
    expect.any(Function),
  )
})

it('positions before display while interaction is disabled and keeps following without a scroll animation', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const interactive = ref(false)
  const activeIndex = ref(1)
  const view = ref<InstanceType<typeof SyncedLyricsView> | null>(null)
  const lines = [
    { id: '0', text: 'First', timeSeconds: 0 },
    { id: '1', text: 'Second', timeSeconds: 2 },
    { id: '2', text: 'Third', timeSeconds: 4 },
  ]
  const root = new TestNode('root')
  const app = renderer.createApp({
    setup: () => () =>
      h(SyncedLyricsView, {
        ref: view,
        active: true,
        interactive: interactive.value,
        lines,
        activeIndex: activeIndex.value,
        isPrelude: false,
        showPrelude: false,
        preludeLitDotCount: 0,
      }),
  })
  app.mount(root)
  await nextTick()
  await view.value?.prepareForDisplay()
  const track = find(root, 'synced-lyrics-track')!
  const scroll = find(root, 'synced-lyrics-scroll')!
  expect(track.style.transform).toBe('translate3d(0, -160px, 0)')
  expect(track.animate).not.toHaveBeenCalled()
  ;(scroll.props.onWheel as () => void)()
  activeIndex.value = 2
  await nextTick()
  await nextTick()
  expect(track.style.transform).toBe('translate3d(0, -260px, 0)')
  expect(track.animate).not.toHaveBeenCalled()
  interactive.value = true
  await nextTick()
  activeIndex.value = 1
  await nextTick()
  await nextTick()
  expect(track.animate).toHaveBeenCalledOnce()
  app.unmount()
})

it('uses the saved particle effect in the normal lyrics panel and follows playback time on seek', async () => {
  vi.stubGlobal('localStorage', { setItem: vi.fn() })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const preference = useLyricsCountdownPreference()
  preference.setEffect('fracture')
  const elapsed = ref(0)
  const showPrelude = ref(true)
  const root = new TestNode('root')
  const app = renderer.createApp({
    setup: () => () =>
      h(SyncedLyricsView, {
        lines: [{ id: 'first', text: 'First line', timeSeconds: 3 }],
        activeIndex: -1,
        isPrelude: true,
        showPrelude: showPrelude.value,
        preludeLitDotCount: 1,
        preludeElapsed: elapsed.value,
      }),
  })
  app.mount(root)
  await nextTick()
  const intact = findAll(root, 'lyrics-fracture-dot')
  expect(intact.map((dot) => dot.props['data-fracture-progress'])).toEqual([0, 0, 0])
  expect(find(root, 'lyric-dot')).toBeUndefined()
  elapsed.value = 0.775
  await nextTick()
  const breaking = findAll(root, 'lyrics-fracture-dot')
  expect(Number(breaking[2].props['data-fracture-progress'])).toBeCloseTo(0.5)
  expect(Number(breaking[0].props['data-fracture-progress'])).toBe(0)
  expect(find(root, 'lyrics-fracture-particles')).toBeDefined()
  elapsed.value = 0
  await nextTick()
  expect(find(root, 'lyrics-fracture-particles')).toBeUndefined()
  preference.setEffect('lighting')
  await nextTick()
  expect(find(root, 'lyrics-fracture-dot')).toBeUndefined()
  expect(find(root, 'lyric-dot')).toBeDefined()
  showPrelude.value = false
  await nextTick()
  expect(find(root, 'lyric-prelude')).toBeUndefined()
  app.unmount()
})
