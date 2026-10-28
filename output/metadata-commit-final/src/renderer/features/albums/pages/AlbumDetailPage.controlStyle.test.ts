import { afterEach, expect, it, vi } from 'vitest'
import type { CreateAppFunction } from 'vue'

const playbackActions = vi.hoisted(() => ({
  playAlbum: vi.fn(),
  playTrack: vi.fn(),
  playAlbumShuffle: vi.fn(),
  cancel: vi.fn(),
}))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { artist: 'Artist', title: 'Album' } }),
  useRouter: () => ({ push: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}))
vi.mock('@renderer/shared/ipc/client', () => ({ auralis: { library: {} } }))
vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: () => ({
    state: { selectedTrackId: null, currentTrackId: null, isPlaying: false },
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
      ],
    },
    moreAlbums: { value: [] },
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
  default: { name: 'AlbumDetailTrackList', render: () => null },
}))
vi.mock('../components/AlbumMoreGallery.vue', () => ({
  default: { name: 'AlbumMoreGallery', render: () => null },
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
  scrollTo(): void {}
}

const rendererOptions = {
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
  const node = find(root, (candidate) => candidate.props.class === className)
  if (!node) throw new Error(`missing .${className}`)
  return node
}

async function mountAlbum(stored: string | null) {
  vi.resetModules()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key === 'auralis-control-style' ? stored : null),
    setItem: vi.fn(),
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
  const { createRenderer, h } = await import('vue')
  const { default: AlbumDetailPage } = await import('./AlbumDetailPage.vue')
  const control = await import('@renderer/features/appearance/composables/useControlStyle')
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
  return { root, ...control }
}

it('keeps brushed metal until the stored choice changes', async () => {
  const mountedPage = await mountAlbum(null)
  const { setStyle } = mountedPage.useControlStyle()
  const actions = byClass(mountedPage.root, 'album-hero-actions')
  expect(actions.props['data-control-style']).toBe('brushed')
  expect(mountedPage.CONTROL_STYLE_KEY).toBe('auralis-control-style')
  ;(byClass(mountedPage.root, 'album-hero-play-btn').props.onClick as () => void)()
  ;(byClass(mountedPage.root, 'album-hero-shuffle-btn').props.onClick as () => void)()
  expect(playbackActions.playAlbum).toHaveBeenCalledTimes(1)
  expect(playbackActions.playAlbumShuffle).toHaveBeenCalledTimes(1)

  setStyle('anodized')
  const { nextTick } = await import('vue')
  await nextTick()
  expect(actions.props['data-control-style']).toBe('anodized')
})

it('opens on anodized metal when that choice is already stored', async () => {
  const { root, getControlStyle } = await mountAlbum('anodized')
  expect(getControlStyle()).toBe('anodized')
  expect(byClass(root, 'album-hero-actions').props['data-control-style']).toBe('anodized')
  expect(byClass(root, 'album-hero-play-btn')).toBeTruthy()
  expect(byClass(root, 'album-hero-shuffle-btn')).toBeTruthy()
})
