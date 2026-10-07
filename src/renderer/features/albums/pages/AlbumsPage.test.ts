import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, h, KeepAlive, markRaw, nextTick, ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import AlbumsPage from './AlbumsPage.vue'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'

const fixture = vi.hoisted(() => ({
  tracks: [] as TrackListItem[],
  changed: null as null | ((event: { reason: string }) => void),
  route: { name: 'albums' },
}))
vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: {
    library: {
      getTracks: async () => fixture.tracks,
      onChanged: (callback: typeof fixture.changed) => {
        fixture.changed = callback
        return () => {
          fixture.changed = null
        }
      },
    },
  },
}))
vi.mock('vue-router', () => ({
  useRoute: () => fixture.route,
  useRouter: () => ({ push: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { error: vi.fn(), warn: vi.fn() },
}))
vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: () => ({ state: { currentTrackId: null }, playTrackFromQueue: vi.fn() }),
}))
vi.mock('@renderer/features/playback/composables/usePlayerDisplayMode', async () => {
  const { ref } = await import('vue')
  return { usePlayerDisplayMode: () => ({ displayMode: ref('normal') }) }
})
vi.mock('@renderer/features/playback/composables/useArtworkPalette', () => ({
  prefetchArtworkPalette: vi.fn(),
}))
vi.mock('../components/AlbumCard.vue', async () => {
  const { h } = await import('vue')
  return { default: { render: () => h('div') } }
})
vi.mock('../components/AlbumGridTransitionLayer.vue', () => ({
  default: { methods: { clear: vi.fn() }, render: () => null },
}))
vi.mock('../components/AlbumDropTransitionLayer.vue', () => ({
  default: { methods: { cancel: vi.fn() }, render: () => null },
}))
vi.mock('@renderer/app/layout/MainPageStatus.vue', () => ({ default: { render: () => null } }))
// The custom renderer exercises the page and real grid layout. DOM animation and
// virtualizer observers are covered separately by the isolated Chrome probe.
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    Transition: {
      inheritAttrs: false,
      setup: (_props: unknown, { slots }: { slots: { default: () => unknown } }) => slots.default,
    },
  }
})
vi.mock('@tanstack/vue-virtual', async () => {
  const { computed } = await import('vue')
  return {
    observeElementRect: vi.fn(),
    observeElementOffset: vi.fn(),
    useVirtualizer: (options: { value: { count: number; estimateSize: () => number } }) =>
      computed(() => ({
        measure: vi.fn(),
        scrollToIndex: vi.fn(),
        getTotalSize: () => options.value.count * options.value.estimateSize(),
        getVirtualItems: () =>
          Array.from({ length: options.value.count }, (_, index) => ({
            index,
            key: index,
            size: options.value.estimateSize(),
            start: index * options.value.estimateSize(),
          })),
      })),
  }
})

class TestElement {
  props: Record<string, unknown> = {}
  children: TestElement[] = []
  parent: TestElement | null = null
  clientWidth = 985
  clientHeight = 650
  scrollTop = 0
  value = ''
  text = ''
  isContentEditable = false
  constructor(public tagName = 'div') {
    markRaw(this)
  }
  get isConnected(): boolean {
    return this === body || Boolean(this.parent?.isConnected)
  }
  get className(): string {
    return String(this.props.class ?? '')
  }
  focus(): void {
    doc.activeElement = this
    ;(this.props.onFocus as (() => void) | undefined)?.()
  }
  blur(): void {
    doc.activeElement = body
    ;(this.props.onBlur as (() => void) | undefined)?.()
  }
  contains(target: unknown): boolean {
    return target === this || this.children.some((child) => child.contains(target))
  }
  matches(selector: string): boolean {
    return selector.split(', ').includes(this.tagName.toLowerCase())
  }
  querySelector(): null {
    return null
  }
  querySelectorAll(): [] {
    return []
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, right: 800, bottom: 650 }
  }
  getRootNode() {
    return doc
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}
const body = new TestElement('body')
const doc = Object.assign(new EventTarget(), {
  activeElement: body,
  body,
  querySelector: () => null,
})
const observers: Array<{
  callback: () => void
  element: TestElement | null
  disconnect: ReturnType<typeof vi.fn>
}> = []
const renderer = createRenderer<TestElement, TestElement>({
  createElement: (tag) => new TestElement(tag),
  createText: () => new TestElement('#text'),
  createComment: () => new TestElement('#comment'),
  setText: (element, text) => {
    element.text = text
  },
  setElementText: (element, text) => {
    element.text = text
  },
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index >= 0) parent.children.splice(index, 0, child)
    else parent.children.push(child)
  },
  remove: (child) => {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = null
  },
  parentNode: (child) => child.parent,
  nextSibling: (child) => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  patchProp: (element, key, _previous, value) => {
    element.props[key] = value
  },
  querySelector: () => body,
})
let unmount: (() => void) | null = null
beforeEach(() => {
  fixture.tracks = []
  fixture.route.name = 'albums'
  observers.length = 0
  body.children = []
  doc.activeElement = body
  vi.stubGlobal('HTMLElement', TestElement)
  vi.stubGlobal('Element', TestElement)
  vi.stubGlobal('Node', TestElement)
  vi.stubGlobal('Document', EventTarget)
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout, clearTimeout }))
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: vi.fn() })
  vi.stubGlobal('getComputedStyle', () => ({ paddingTop: '24px', paddingBottom: '32px' }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      state: (typeof observers)[number]
      constructor(callback: () => void) {
        this.state = { callback, element: null, disconnect: vi.fn() }
        observers.push(this.state)
      }
      observe(element: TestElement): void {
        this.state.element = element
      }
      disconnect(): void {
        this.state.disconnect()
      }
    },
  )
})
afterEach(() => {
  try {
    unmount?.()
  } finally {
    unmount = null
    useChineseTextDisplay().setSongInfoScript('simplified')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick()
}
async function mountPage() {
  const active = ref(true)
  const app = renderer.createApp({
    render: () =>
      h(KeepAlive, null, [active.value ? h(AlbumsPage) : h({ render: () => h('div') })]),
  })
  unmount = () => app.unmount()
  app.mount(body)
  await settle()
  return active
}
function find(className: string, node = body): TestElement | undefined {
  if (node.className.split(/\s+/).includes(className)) return node
  for (const child of node.children) {
    const result = find(className, child)
    if (result) return result
  }
  return undefined
}
async function setAlbums(count: number): Promise<void> {
  fixture.tracks = Array.from(
    { length: count },
    (_, index) =>
      ({
        id: index + 1,
        album: `Album ${index}`,
        albumArtist: 'Artist',
        artist: 'Artist',
        title: 'Song',
      }) as TrackListItem,
  )
  fixture.changed?.({ reason: 'metadata-refresh' })
  await settle()
}
function shortcut(target?: TestElement): KeyboardEvent {
  const event = new Event('keydown', { cancelable: true })
  Object.assign(event, {
    key: 'f',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
  })
  if (target) Object.defineProperty(event, 'target', { value: target })
  doc.dispatchEvent(event)
  return event as KeyboardEvent
}

function escape(target: TestElement = doc.activeElement, flags: object = {}): KeyboardEvent {
  const event = new Event('keydown', { cancelable: true })
  Object.assign(event, { key: 'Escape', ...flags })
  Object.defineProperty(event, 'target', { value: target })
  return event as KeyboardEvent
}

function setSearchQuery(input: TestElement, value: string): void {
  ;(input.props['onUpdate:modelValue'] as (value: string) => void)(value)
}

describe('AlbumsPage grid connection', () => {
  it('measures an empty catalog import and observes each replacement container', async () => {
    await mountPage()
    expect(find('albums-scroll')).toBeUndefined()
    await setAlbums(40)
    const first = find('albums-scroll')!
    expect(observers.at(-1)?.element).toBe(first)
    expect(find('albums-grid-row')?.props.style).toMatchObject({
      height: '271px',
      gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
    })
    const previousObserver = observers.at(-1)!
    await setAlbums(0)
    expect(previousObserver.disconnect).toHaveBeenCalled()
    await setAlbums(40)
    const replacement = find('albums-scroll')!
    expect(replacement).not.toBe(first)
    replacement.clientWidth = 685
    previousObserver.callback()
    expect(find('albums-grid-row')?.props.style).toMatchObject({
      gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
    })
    observers.at(-1)!.callback()
    await settle()
    expect(find('albums-grid-row')?.props.style).toMatchObject({
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    })
  })
  it('keeps the live scroll offset on refresh and reconnects after KeepAlive', async () => {
    const active = await mountPage()
    await setAlbums(40)
    const element = find('albums-scroll')!
    element.scrollTop = 420
    const observerCount = observers.length
    await setAlbums(41)
    expect(element.scrollTop).toBe(420)
    expect(observers.length).toBe(observerCount)
    active.value = false
    await settle()
    expect(observers.at(-1)?.disconnect).toHaveBeenCalled()
    active.value = true
    await settle()
    expect(observers.at(-1)?.element).toBe(element)
  })
})

describe('AlbumsPage keyboard search', () => {
  it('locates original and displayed album prefixes without changing catalog identities', async () => {
    await mountPage()
    fixture.tracks = [
      {
        id: 1,
        album: '苧與音樂',
        albumArtist: '萧敬腾',
        artist: '萧敬腾',
        title: '歌曲',
      } as TrackListItem,
    ]
    const original = structuredClone(fixture.tracks)
    fixture.changed?.({ reason: 'metadata-refresh' })
    await settle()
    shortcut()
    await settle()
    const input = find('library-search-input')!
    const preference = useChineseTextDisplay()
    for (const script of ['simplified', 'traditional'] as const) {
      preference.setSongInfoScript(script)
      for (const query of [
        '苧與音樂',
        preference.songText('苧與音樂'),
        preference.songText('萧敬腾'),
      ]) {
        setSearchQuery(input, query)
        await settle()
        ;(input.props.onKeydown as (event: object) => void)({
          key: 'Enter',
          preventDefault: vi.fn(),
        })
        await settle()
        expect(find('library-search-outcome')?.text).toBe('albums.search.matched')
      }
    }
    expect(fixture.tracks).toEqual(original)
  })
  it('clears and closes unfocused search on page Escape while preserving the outside focus and scroll', async () => {
    await mountPage()
    await setAlbums(40)
    shortcut()
    await settle()
    const input = find('library-search-input')!
    setSearchQuery(input, 'Album')
    await settle()
    ;(input.props.onKeydown as (event: object) => void)({ key: 'Enter', preventDefault: vi.fn() })
    await settle()
    expect(find('library-search-outcome')).toBeDefined()
    const scroll = find('albums-scroll')!
    scroll.scrollTop = 420
    const pointer = new Event('pointerdown')
    Object.defineProperty(pointer, 'target', { value: scroll })
    doc.dispatchEvent(pointer)
    input.blur()
    scroll.focus()
    await settle()
    expect(find('library-search-input')).toBe(input)
    const event = escape(scroll)
    doc.dispatchEvent(event)
    await settle()
    expect(event.defaultPrevented).toBe(true)
    expect(find('library-search-input')).toBeUndefined()
    expect(doc.activeElement).toBe(scroll)
    expect(scroll.scrollTop).toBe(420)
    shortcut()
    await settle()
    expect(find('library-search-input')?.value).toBe('')
    expect(find('library-search-outcome')).toBeUndefined()
  })

  it('keeps the first focused Escape in the editor and closes on the second', async () => {
    await mountPage()
    shortcut()
    await settle()
    const input = find('library-search-input')!
    setSearchQuery(input, 'Album')
    const first = escape(input)
    ;(input.props.onKeydown as (event: object) => void)(first)
    doc.dispatchEvent(first)
    await settle()
    expect(find('library-search-input')).toBe(input)
    expect(input.value).toBe('')
    expect(doc.activeElement).toBe(input)
    const second = escape(input)
    ;(input.props.onKeydown as (event: object) => void)(second)
    doc.dispatchEvent(second)
    await settle()
    expect(find('library-search-input')).toBeUndefined()
  })

  it.each([{ isComposing: true }, { keyCode: 229 }])(
    'leaves focused Escape to the IME: %j',
    async (flags) => {
      await mountPage()
      shortcut()
      await settle()
      const input = find('library-search-input')!
      setSearchQuery(input, 'Album')
      const event = escape(input, flags)
      ;(input.props.onKeydown as (event: object) => void)(event)
      doc.dispatchEvent(event)
      await settle()
      expect(event.defaultPrevented).toBe(false)
      expect(input.value).toBe('Album')
      expect(doc.activeElement).toBe(input)
    },
  )

  it('preserves an unfocused query for other editors, overlays and inactive pages', async () => {
    const active = await mountPage()
    shortcut()
    await settle()
    const input = find('library-search-input')!
    setSearchQuery(input, 'Album')
    input.blur()
    await settle()
    const editor = new TestElement('input')
    editor.focus()
    const editorEscape = escape(editor)
    doc.dispatchEvent(editorEscape)
    expect(editorEscape.defaultPrevented).toBe(false)
    const querySelector = vi.spyOn(doc, 'querySelector').mockReturnValue({} as never)
    const overlayEscape = escape(body)
    doc.dispatchEvent(overlayEscape)
    expect(overlayEscape.defaultPrevented).toBe(false)
    querySelector.mockRestore()
    expect(input.value).toBe('Album')
    active.value = false
    await settle()
    const inactiveEscape = escape(body)
    doc.dispatchEvent(inactiveEscape)
    expect(inactiveEscape.defaultPrevented).toBe(false)
  })

  it('dismisses hover search until the pointer leaves and reenters its zone', async () => {
    await mountPage()
    const page = find('albums-page')!
    const move = (clientX: number, clientY: number) =>
      (page.props.onMousemove as (event: object) => void)({ currentTarget: page, clientX, clientY })
    move(400, 15)
    await settle()
    expect(find('library-search-input')).toBeDefined()
    doc.dispatchEvent(escape(body))
    await settle()
    expect(find('library-search-input')).toBeUndefined()
    move(401, 15)
    await settle()
    expect(find('library-search-input')).toBeUndefined()
    move(50, 100)
    move(400, 15)
    await settle()
    expect(find('library-search-input')).toBeDefined()
  })

  it('opens from the focusable entry and returns focus on Escape without reopening', async () => {
    await mountPage()
    const trigger = find('albums-search-trigger')!
    trigger.focus()
    expect(find('library-search-input')).toBeUndefined()
    await (trigger.props.onClick as () => Promise<void>)()
    await settle()
    const input = find('library-search-input')!
    expect(doc.activeElement).toBe(input)
    const event = { key: 'Escape', preventDefault: vi.fn() }
    ;(input.props.onKeydown as (event: object) => void)(event)
    await settle()
    expect(doc.activeElement).toBe(trigger)
    expect(find('library-search-input')).toBeUndefined()
  })
  it('handles the active page shortcut but preserves other input and menu focus', async () => {
    const active = await mountPage()
    expect(shortcut(new TestElement('input')).defaultPrevented).toBe(false)
    expect(shortcut().defaultPrevented).toBe(true)
    await settle()
    expect(doc.activeElement).toBe(find('library-search-input'))
    const querySelector = vi.spyOn(doc, 'querySelector').mockReturnValue({} as never)
    expect(shortcut().defaultPrevented).toBe(false)
    querySelector.mockRestore()
    active.value = false
    await settle()
    expect(shortcut().defaultPrevented).toBe(false)
  })
})
