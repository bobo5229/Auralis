import { afterEach, expect, it, vi } from 'vitest'
import { createRenderer, h, markRaw, nextTick } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { TrackListItem } from '@shared/types/libraryScan'
import { rememberCdIndexDeparture } from '../utils/cdAlbumIndexReturn'
import CdAlbumIndexPage from './CdAlbumIndexPage.vue'

const library = vi.hoisted(() => ({
  getTracks: vi.fn<AuralisApi['library']['getTracks']>(),
  onChanged: vi.fn<AuralisApi['library']['onChanged']>(),
}))
const virtualizer = vi.hoisted(() => ({
  measure: vi.fn(),
  scrollToOffset: vi.fn(),
  scrollToIndex: vi.fn(),
}))
vi.mock('@renderer/shared/ipc/client', () => ({ auralis: { library } }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), currentRoute: { value: { name: 'albums' } } }),
}))
vi.mock('@tanstack/vue-virtual', async () => {
  const { shallowRef } = await import('vue')
  return {
    useVirtualizer: (options: {
      value: { count: number; estimateSize: (index: number) => number }
    }) =>
      shallowRef({
        getVirtualItems: () =>
          Array.from({ length: options.value.count }, (_, index) => ({
            index,
            start: index * 300,
            size: options.value.estimateSize(index),
          })),
        getTotalSize: () => options.value.count * 300,
        ...virtualizer,
      }),
  }
})

interface TestNode {
  tag: string
  props: Record<string, unknown>
  children: TestNode[]
  parent: TestNode | null
  text: string
  isConnected: boolean
  clientWidth: number
  scrollTop: number
}
let initialWidth = 1000
const node = (tag = '#text', text = ''): TestNode =>
  markRaw({
    tag,
    props: {},
    children: [],
    parent: null,
    text,
    isConnected: true,
    clientWidth: initialWidth,
    scrollTop: 0,
  })
const renderer = createRenderer<TestNode, TestNode>({
  createElement: (tag) => node(tag),
  createText: (text) => node('#text', text),
  createComment: () => node('#comment'),
  insert(child, parent, anchor) {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = parent
    child.isConnected = true
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(child)
    else parent.children.splice(index, 0, child)
  },
  remove(child) {
    child.parent?.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = null
    child.isConnected = false
  },
  setText: (element, text) => {
    element.text = text
  },
  setElementText: (element, text) => {
    element.text = text
    element.children = []
  },
  parentNode: (element) => element.parent,
  nextSibling: (element) => {
    const siblings = element.parent?.children
    return siblings?.[siblings.indexOf(element) + 1] ?? null
  },
  patchProp: (element, key, _previous, value) => {
    element.props[key] = value
  },
})
interface Observer {
  targets: Set<TestNode>
  disconnected: boolean
  fire: () => void
}
const observers: Observer[] = []
const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  observers.splice(0)
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  initialWidth = 1000
})
const key = (seed: string) => `v2-${seed.repeat(64)}.webp`
function song(artwork: string | null = key('a'), id = 1): TrackListItem {
  return {
    id,
    title: 'Song',
    artist: 'Artist',
    albumArtist: 'Artist',
    album: `Album ${id}`,
    artworkCacheKey: artwork,
    trackNo: 1,
    discNo: 1,
    durationSeconds: 180,
    releaseDate: null,
    copyright: null,
    composer: null,
    bitrateBps: null,
    genre: null,
    playCount: 0,
    lastPlayedAt: null,
    availability: 'available',
    createdAt: '2025-01-01T00:00:00.000Z',
  }
}
function find(root: TestNode, predicate: (node: TestNode) => boolean): TestNode[] {
  return [
    ...(predicate(root) ? [root] : []),
    ...root.children.flatMap((child) => find(child, predicate)),
  ]
}
function hasClass(element: TestNode, name: string): boolean {
  return String(element.props.class).split(' ').includes(name)
}
async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount(tracks: TrackListItem[] = [song()]) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      state: Observer
      constructor(callback: () => void) {
        this.state = { targets: new Set(), disconnected: false, fire: callback }
        observers.push(this.state)
      }
      observe(target: TestNode) {
        this.state.targets.add(target)
      }
      disconnect() {
        this.state.disconnected = true
        this.state.targets.clear()
      }
    },
  )
  library.getTracks.mockResolvedValue(tracks)
  let changed!: Parameters<AuralisApi['library']['onChanged']>[0]
  library.onChanged.mockImplementation((callback) => {
    changed = callback
    return () => {}
  })
  const app = renderer.createApp(() => h(CdAlbumIndexPage))
  app.directive('tooltip', {})
  const root = node('root')
  app.mount(root)
  let mounted = true
  const unmount = () => {
    if (mounted) {
      mounted = false
      app.unmount()
    }
  }
  cleanups.push(unmount)
  await flush()
  return {
    root,
    unmount,
    images: () => find(root, (item) => item.tag === 'img'),
    scroll: () => find(root, (item) => hasClass(item, 'cd-index-scroll'))[0],
    row: () => find(root, (item) => hasClass(item, 'cd-index-row'))[0],
    changed: async (next: TrackListItem[]) => {
      library.getTracks.mockResolvedValue(next)
      changed({ reason: 'metadata-refresh', trackIds: [1], filePaths: [] })
      await flush()
    },
  }
}

it.each([1, 6])('loads a changed resource after an image failure with %i albums', async (count) => {
  const tracks = Array.from({ length: count }, (_, index) =>
    song(index === 0 ? key('a') : key(String(index)), index + 1),
  )
  const view = await mount(tracks)
  expect(view.images()).toHaveLength(count)
  ;(view.images()[0].props.onError as () => void)()
  await flush()
  expect(view.images()).toHaveLength(count - 1)
  await view.changed([{ ...tracks[0], artworkCacheKey: key('b') }, ...tracks.slice(1)])
  expect(view.images()).toHaveLength(count)
  expect(view.images()[0].props.src).toContain(key('b'))
})

it('does not let a late error for a removed image replace the new resource or poison a later visit', async () => {
  const view = await mount()
  const oldImage = view.images()[0]
  const oldError = oldImage.props.onError as () => void
  await view.changed([song(key('b'))])
  expect(view.images()[0] === oldImage).toBe(false)
  oldError()
  await flush()
  expect(view.images()[0].props.src).toContain(key('b'))
  await view.changed([song(key('a'))])
  expect(view.images()[0].props.src).toContain(key('a'))
})

it('retains an active resource failure and forgets it once that resource leaves the catalog', async () => {
  const view = await mount()
  ;(view.images()[0].props.onError as () => void)()
  await flush()
  await view.changed([song()])
  expect(view.images()).toHaveLength(0)
  await view.changed([])
  await view.changed([song()])
  expect(view.images()).toHaveLength(1)
})

it('keeps another album visible when one request for their shared image fails', async () => {
  const view = await mount([song(key('a'), 1), song(key('a'), 2)])
  ;(view.images()[0].props.onError as () => void)()
  await flush()
  expect(view.images()).toHaveLength(1)
  expect(view.images()[0].props.alt).toBe('Album 2')
})

it('connects a new resize observer on recovery and disconnects old and unmounted containers', async () => {
  const view = await mount()
  const original = view.scroll()
  const originalObserver = observers.find((observer) => observer.targets.has(original))!
  expect(originalObserver).toBeDefined()
  await view.changed([])
  expect(view.scroll()).toBeUndefined()
  expect(originalObserver.disconnected).toBe(true)
  expect(originalObserver.targets.size).toBe(0)
  await view.changed([song()])
  const recovered = view.scroll()
  expect(recovered === original).toBe(false)
  const activeObserver = observers.find((observer) => observer.targets.has(recovered))!
  expect(activeObserver).toBeDefined()
  const previousMeasurements = virtualizer.measure.mock.calls.length
  originalObserver.fire()
  expect(virtualizer.measure).toHaveBeenCalledTimes(previousMeasurements)
  recovered.clientWidth = 650
  activeObserver.fire()
  await flush()
  expect((view.row().props.style as Record<string, string>).gridTemplateColumns).toContain(
    'repeat(3,',
  )
  view.unmount()
  expect(observers.every((observer) => observer.disconnected)).toBe(true)
  const finalMeasurements = virtualizer.measure.mock.calls.length
  activeObserver.fire()
  expect(virtualizer.measure).toHaveBeenCalledTimes(finalMeasurements)
})

it('retains return positioning until a zero-width container becomes measurable', async () => {
  initialWidth = 0
  rememberCdIndexDeparture({ albumKey: 'Artist\u0000Album 1', scrollTop: 42 })
  const view = await mount()
  const scroll = view.scroll()
  expect(virtualizer.scrollToOffset).not.toHaveBeenCalled()
  const observer = observers.find((observer) => observer.targets.has(scroll))!
  scroll.clientWidth = 1000
  observer.fire()
  await flush()
  expect(virtualizer.scrollToOffset).toHaveBeenCalledExactlyOnceWith(42)
  expect(find(view.root, (item) => hasClass(item, 'cd-index-card--return'))).toHaveLength(1)
})
