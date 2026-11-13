import { afterEach, expect, it, vi } from 'vitest'
import { h, type CreateAppFunction } from 'vue'

vi.mock('vue', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ...vue,
    Transition: vue.defineComponent({
      inheritAttrs: false,
      setup:
        (_props, { slots }) =>
        () =>
          slots.default?.(),
    }),
  }
})

const playbackActions = vi.hoisted(() => ({
  playAlbum: vi.fn(),
  playTrack: vi.fn(),
  playAlbumShuffle: vi.fn(),
  cancel: vi.fn(),
}))
const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  returnTo: undefined as string | undefined,
  trackCount: 1,
  album: {
    key: 'Other\u0000Next',
    albumArtist: 'Other',
    title: 'Next',
    artworkCacheKey: 'cover',
    releaseDate: null,
    tracks: [],
  },
}))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: { artist: 'Artist', title: 'Album', returnTo: navigation.returnTo },
  }),
  useRouter: () => ({ push: navigation.push }),
  onBeforeRouteLeave: vi.fn(),
  onBeforeRouteUpdate: vi.fn(),
}))
vi.mock('@renderer/shared/ipc/client', () => ({ auralis: { library: {} } }))
vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: () => ({
    state: { selectedTrackId: 1, currentTrackId: null, isPlaying: false },
  }),
}))
vi.mock('../composables/useAlbumDetailPlayback', () => ({
  useAlbumDetailPlayback: () => playbackActions,
}))
vi.mock('../composables/useAlbumDetailTracks', () => ({
  useAlbumDetailTracks: () => ({
    tracks: { value: [] },
    albumTracks: {
      value: [
        {
          id: 1,
          title: 'Song',
          artist: 'Artist',
          album: 'Album',
          albumArtist: 'Artist',
          trackNo: 1,
          discNo: null,
          releaseDate: '2022-03-01',
          copyright: null,
          composer: null,
          durationSeconds: 180,
          bitrateBps: null,
          artworkCacheKey: null,
          genre: null,
          availability: 'available',
          playCount: 0,
          lastPlayedAt: null,
          createdAt: '2022-03-01T00:00:00.000Z',
        },
      ].flatMap((track) =>
        Array.from({ length: navigation.trackCount }, (_, index) => ({ ...track, id: index + 1 })),
      ),
    },
    moreAlbums: { value: [navigation.album] },
    genreAlbums: { value: [] },
    previewArtworkCacheKey: { value: null },
    previewReleaseDate: { value: null },
    loadState: { value: 'ready' },
    initialize: async () => {},
    reloadTracks: async () => {},
    ensureCurrentAlbum: async () => {},
    ensurePlaybackCatalog: async () => [],
    playbackCatalogRevision: { value: 0 },
    dispose: () => {},
  }),
}))
vi.mock('../components/AlbumDetailTrackList.vue', () => ({
  default: {
    name: 'AlbumDetailTrackList',
    render: () => h('div', { class: 'test-detail-track-list' }),
  },
}))
vi.mock('../components/AlbumMoreGallery.vue', () => ({
  default: {
    name: 'AlbumMoreGallery',
    emits: ['open'],
    render(this: { $emit: (event: string, album: unknown) => void }) {
      return h('button', {
        class: 'test-gallery-open',
        onClick: () => this.$emit('open', navigation.album),
      })
    },
  },
}))

class TestNode {
  parent: TestNode | null = null
  children: TestNode[] = []
  props: Record<string, unknown> = {}
  text = ''
  constructor(public type: string) {}
  querySelector(): null {
    return null
  }
  closest(): null {
    return null
  }
  scrollTo(): void {}
  focus(): void {}
}

let overlay = new TestNode('div')
const rendererOptions = {
  querySelector: () => overlay,
  createElement: (type: string) => new TestNode(type),
  createText: (text: string) => Object.assign(new TestNode('text'), { text }),
  createComment: () => new TestNode('comment'),
  insert(child: TestNode, parent: TestNode, anchor?: TestNode | null) {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(child)
    else parent.children.splice(index, 0, child)
  },
  remove(child: TestNode) {
    child.parent?.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = null
  },
  setText: (node: TestNode, text: string) => {
    node.text = text
  },
  setElementText: (node: TestNode, text: string) => {
    node.text = text
  },
  parentNode: (node: TestNode) => node.parent,
  nextSibling: (node: TestNode) =>
    node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  patchProp: (node: TestNode, key: string, _old: unknown, value: unknown) => {
    node.props[key] = value
  },
}

const mounted: Array<() => void> = []

afterEach(() => {
  navigation.returnTo = undefined
  navigation.trackCount = 1
  mounted.splice(0).forEach((unmount) => unmount())
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function find(node: TestNode, predicate: (node: TestNode) => boolean): TestNode | undefined {
  if (predicate(node)) return node
  for (const child of node.children) {
    const match = find(child, predicate)
    if (match) return match
  }
  return undefined
}

function byClass(root: TestNode, className: string): TestNode {
  const node = find(
    root,
    (candidate) =>
      typeof candidate.props.class === 'string' &&
      candidate.props.class.split(/\s+/u).includes(className),
  )
  if (!node) throw new Error(`missing .${className}`)
  return node
}

async function mountAlbum(stored: string | null) {
  vi.resetModules()
  overlay = new TestNode('div')
  const storage = new Map<string, string>()
  if (stored) storage.set('auralis-control-style', stored)
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
  const { createRenderer, h } = await import('vue')
  const { default: AlbumDetailPage } = await import('./AlbumDetailPage.vue')
  const root = new TestNode('div')
  const app = (
    createRenderer(rendererOptions) as { createApp: CreateAppFunction<TestNode> }
  ).createApp({ render: () => h(AlbumDetailPage) })
  app.directive('tooltip', {})
  app.mount(root)
  mounted.push(() => app.unmount())
  const { nextTick } = await import('vue')
  await nextTick()
  await nextTick()
  return { root, overlay, storage }
}

it('keeps album playback actions available regardless of the old material preference', async () => {
  const { root } = await mountAlbum('anodized')
  ;(byClass(root, 'album-hero-play-btn').props.onClick as () => void)()
  ;(byClass(root, 'album-hero-shuffle-btn').props.onClick as () => void)()
  expect(playbackActions.playAlbum).toHaveBeenCalledTimes(1)
  expect(playbackActions.playAlbumShuffle).toHaveBeenCalledTimes(1)
})

it('opens a recommendation immediately and seeds its detail snapshot', async () => {
  const { root } = await mountAlbum(null)
  ;(byClass(root, 'test-gallery-open').props.onClick as () => void)()
  expect(playbackActions.cancel).toHaveBeenCalled()
  expect(navigation.push).toHaveBeenCalledWith({
    name: 'album-detail',
    query: { artist: 'Other', title: 'Next' },
  })
  const { readAlbumDetailSnapshot } = await import('../albumDetailSnapshot')
  expect(readAlbumDetailSnapshot('Other', 'Next')?.artworkCacheKey).toBe('cover')
})

it('returns to recently added with its original range', async () => {
  navigation.returnTo = '/recent-added?range=30'
  const { root } = await mountAlbum(null)
  ;(byClass(root, 'album-detail-back').props.onClick as () => void)()
  expect(navigation.push).toHaveBeenCalledWith('/recent-added?range=30')
})

it('returns to the unified search and preserves its origin through more albums', async () => {
  navigation.returnTo = '/search'
  const { root } = await mountAlbum(null)
  ;(byClass(root, 'test-gallery-open').props.onClick as () => void)()
  expect(navigation.push).toHaveBeenCalledWith({
    name: 'album-detail', query: { artist: 'Other', title: 'Next', returnTo: '/search' },
  })
  ;(byClass(root, 'album-detail-back').props.onClick as () => void)()
  expect(navigation.push).toHaveBeenLastCalledWith('/search')
})

it('preserves the recently added origin when opening another album', async () => {
  navigation.returnTo = '/recent-added?range=all'
  const { root } = await mountAlbum(null)
  ;(byClass(root, 'test-gallery-open').props.onClick as () => void)()
  expect(navigation.push).toHaveBeenCalledWith({
    name: 'album-detail',
    query: { artist: 'Other', title: 'Next', returnTo: '/recent-added?range=all' },
  })
})

it.each([undefined, '/songs', '/recent-added-other', 'https://example.com'])(
  'returns to albums for an unsupported origin: %s',
  async (target) => {
    navigation.returnTo = target
    const { root } = await mountAlbum(null)
    ;(byClass(root, 'album-detail-back').props.onClick as () => void)()
    expect(navigation.push).toHaveBeenCalledWith({ name: 'albums' })
  },
)

it('exposes cover sampling and restores a saved color from the inline controls', async () => {
  const { root, storage } = await mountAlbum(null)
  const preference = byClass(root, 'album-color-preference')
  const { setAlbumColorPreference } = await import('../albumColorPreferences')
  expect(
    setAlbumColorPreference([{ id: 1, createdAt: '2022-03-01T00:00:00.000Z' }], {
      r: 207,
      g: 255,
      b: 196,
    }),
  ).toBe(true)
  const { nextTick } = await import('vue')
  await nextTick()
  ;(byClass(preference, 'album-color-trigger').props.onClick as () => void)()
  await nextTick()
  expect(byClass(preference, 'album-color-sample').props.disabled).toBe(true)
  ;(byClass(preference, 'album-color-reset').props.onClick as () => void)()
  await nextTick()
  expect(JSON.parse(storage.get('auralis-album-color-preferences-v1')!).preferences).toEqual([])
})

it('does not pass library selection to the detail track list', async () => {
  const { root } = await mountAlbum(null)
  expect(byClass(root, 'test-detail-track-list').props['selected-track-id']).toBeUndefined()
  expect(byClass(root, 'test-detail-track-list').props.selectedTrackId).toBeUndefined()
})

it.each([1, 6, 7, 16])('chooses the album layout at the six-track boundary: %i', async (count) => {
  navigation.trackCount = count
  const { root } = await mountAlbum(null)
  const wrapper = byClass(root, 'album-detail-wrapper')
  expect(String(wrapper.props.class).includes('album-detail-wrapper--short')).toBe(count <= 6)
})
