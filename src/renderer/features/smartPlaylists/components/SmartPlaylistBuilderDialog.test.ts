import { createRenderer, h, nextTick, ref, shallowRef, ssrContextKey, type Component } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { LibraryTrackPage, LibraryTrackPageRequest } from '@shared/types/libraryCatalog'
import type { LibraryPageIdentity } from '../../library/types/libraryPageIdentity'
import { SharedLibraryCatalogLoad } from '../../library/utils/sharedLibraryCatalogLoad'
import { useLibraryCatalogLoader } from '../../library/composables/useLibraryCatalogLoader'
import SmartPlaylistBuilderDialog from './SmartPlaylistBuilderDialog.vue'

const shared = vi.hoisted(() => ({
  client: null as SharedLibraryCatalogLoad | null,
  callbacks: new Set<(event: { reason: string }) => void | Promise<void>>(),
  create: vi.fn(async () => ({ playlist: { id: 1 } })),
}))
vi.mock('../../library/utils/libraryCatalogClient', () => ({
  get libraryCatalogClient() {
    return shared.client
  },
}))
vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: {
    library: {
      onChanged: (callback: (event: { reason: string }) => void | Promise<void>) => {
        shared.callbacks.add(callback)
        return () => shared.callbacks.delete(callback)
      },
    },
    smartPlaylists: { create: shared.create },
  },
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const storeModule = '../../../../main/features/libraryCatalog/libraryCatalogSnapshotStore'
const { LibraryCatalogSnapshotStore } = (await import(storeModule)) as {
  LibraryCatalogSnapshotStore: new (load: () => TrackListItem[]) => {
    getPage(request?: LibraryTrackPageRequest): LibraryTrackPage
  }
}

// Run the real component's setup, watchers, mounted/unmount hooks and create
// handler. Rendering is suppressed: these tests assert data/lifecycle behavior.
type Node = { children: Node[] }
const node = (): Node => ({ children: [] })
const renderer = createRenderer<Node, Node>({
  createElement: node,
  createText: node,
  createComment: node,
  insert: (child, parent) => parent.children.push(child),
  remove: () => undefined,
  setText: () => undefined,
  setElementText: () => undefined,
  parentNode: () => null,
  nextSibling: () => null,
  patchProp: () => undefined,
})

function track(id: number, genre = 'Rock'): TrackListItem {
  return { id, title: `Track ${id}`, genre, artist: 'Artist' } as TrackListItem
}
async function drain() {
  for (let i = 0; i < 30; i += 1) await Promise.resolve()
}
async function emit(reason: string) {
  await Promise.all([...shared.callbacks].map((callback) => callback({ reason })))
}
const cleanups: Array<() => void> = []
function mountBuilder() {
  const open = ref(false)
  let instance!: { setupState: Record<string, unknown> }
  const component = { ...SmartPlaylistBuilderDialog, render: () => null } as Component
  const app = renderer.createApp({
    render: () =>
      h(component, {
        open: open.value,
        trigger: null,
        ref: (component: unknown) => {
          if (component) instance = (component as { $: typeof instance }).$
        },
        onClose: () => {
          open.value = false
        },
      }),
  })
  app.provide(ssrContextKey, { modules: new Set() })
  app.mount(node())
  cleanups.push(() => app.unmount())
  const state = instance.setupState as {
    tracks: TrackListItem[]
    loading: boolean
    saving: boolean
    canCreate: boolean
    loadError: string
    saveError: string
    state: { groups: { genre: { values: string[] } } }
    create: () => Promise<void>
  }
  return { state, open, unmount: () => app.unmount() }
}
function pageLoader() {
  const tracks = shallowRef<TrackListItem[]>([])
  const commits: number[][] = []
  const loader = useLibraryCatalogLoader({
    isDisposed: () => false,
    captureRouteScope: () => ({ kind: 'library' }),
    pageIdentity: ref<LibraryPageIdentity | null>(null),
    tracks,
    libraryViewMode: ref('flat'),
    isLoading: ref(false),
    catalogClient: shared.client!,
    getTrackPage: async () => {
      throw new Error('Use the shared client')
    },
    getPlaylistDetail: async () => null,
    getSmartPlaylistDetail: async () => null,
    readPersistedViewMode: () => 'flat',
    onSnapshotCommitted: (snapshot) => commits.push(snapshot.tracks.map((item) => item.id)),
    captureViewportRestore: () => ({
      restore: { scrollTop: 0, firstVisibleTrackId: null, scrollGeneration: 0 },
      previousTrackIds: [],
    }),
    restoreViewportRestore: async () => undefined,
    scrollToPlaybackTrack: async () => undefined,
    replaceWithLibraryHome: async () => undefined,
    loadErrorMessage: () => 'load failed',
    onLibraryChanged: (callback) => {
      shared.callbacks.add(callback)
      return () => shared.callbacks.delete(callback)
    },
    onScanProgress: () => () => undefined,
  })
  loader.subscribeLibraryEvents()
  cleanups.push(loader.dispose)
  return { loader, tracks, commits }
}

beforeEach(() => {
  vi.useFakeTimers()
  shared.callbacks.clear()
  shared.create.mockClear()
  vi.stubGlobal('window', { dispatchEvent: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('CustomEvent', class {})
})
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('smart builder shared catalog lifecycle', () => {
  it.each(['track-added', 'track-relocated'])(
    'shows complete page and preview snapshots during slow continuous %s, then converges',
    async (reason) => {
      let source = [track(1)]
      const store = new LibraryCatalogSnapshotStore(() => source)
      shared.client = new SharedLibraryCatalogLoad(async (request) => {
        const page = store.getPage(request)
        await new Promise((resolve) => setTimeout(resolve, 1800))
        return page
      })
      const page = pageLoader()
      const initial = page.loader.loadLibraryData()
      await vi.advanceTimersByTimeAsync(1800)
      await initial
      const builder = mountBuilder()
      builder.open.value = true
      await nextTick()
      source = Array.from({ length: 5001 }, (_, i) => track(i + 1))
      for (let i = 0; i < 60; i += 1) {
        source = [...source, track(5002 + i)]
        await emit(reason)
        await vi.advanceTimersByTimeAsync(500)
      }
      expect(page.commits.length).toBeGreaterThan(2)
      expect(page.tracks.value.length).toBeGreaterThan(5000)
      expect(builder.state.tracks.length).toBeGreaterThan(5000)
      for (const ids of page.commits) {
        expect(ids).toEqual(Array.from({ length: ids.length }, (_, i) => i + 1))
      }
      expect(builder.state.tracks.map((item) => item.id)).toEqual(
        Array.from({ length: builder.state.tracks.length }, (_, i) => i + 1),
      )
      await vi.advanceTimersByTimeAsync(15000)
      expect(page.tracks.value).toEqual(source)
      expect(builder.state.tracks).toEqual(source)
      expect(builder.state.loading).toBe(false)
      expect(builder.state.loadError).toBe('')
    },
  )

  it.each(['track-missing', 'metadata-refresh'])(
    'does not publish the pre-%s preview and restores loading after reconciliation',
    async (reason) => {
      let source = [track(1)]
      const store = new LibraryCatalogSnapshotStore(() => source)
      shared.client = new SharedLibraryCatalogLoad(async (request) => {
        const page = store.getPage(request)
        await new Promise((resolve) => setTimeout(resolve, 1800))
        return page
      })
      const builder = mountBuilder()
      builder.open.value = true
      await nextTick()
      expect(builder.state.loading).toBe(true)
      expect(builder.state.canCreate).toBe(false)
      source = reason === 'track-missing' ? [] : [{ ...track(1), title: 'Edited' }]
      await emit(reason)
      await vi.advanceTimersByTimeAsync(1800)
      expect(builder.state.tracks).toEqual([])
      await vi.advanceTimersByTimeAsync(1800)
      expect(builder.state.tracks).toEqual(source)
      expect(builder.state.loading).toBe(false)
    },
  )

  it('finishes create against its fresh snapshot while soft imports continue', async () => {
    let source = [track(1)]
    const store = new LibraryCatalogSnapshotStore(() => source)
    shared.client = new SharedLibraryCatalogLoad(async (request) => {
      const page = store.getPage(request)
      await new Promise((resolve) => setTimeout(resolve, 1800))
      return page
    })
    const builder = mountBuilder()
    builder.open.value = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(1800)
    builder.state.state.groups.genre.values = ['rock']
    expect(builder.state.canCreate).toBe(true)
    const creating = builder.state.create()
    expect(builder.state.saving).toBe(true)
    expect(builder.state.canCreate).toBe(false)
    for (let i = 0; i < 5; i += 1) {
      source = [...source, track(i + 2)]
      await emit('track-added')
      await vi.advanceTimersByTimeAsync(500)
    }
    await creating
    expect(shared.create).toHaveBeenCalledOnce()
    expect(builder.state.saving).toBe(false)
    expect(builder.state.loadError).toBe('')
  })

  it('rechecks matches before create and does not persist an obsolete selection', async () => {
    let source = [track(1)]
    const store = new LibraryCatalogSnapshotStore(() => source)
    shared.client = new SharedLibraryCatalogLoad(async (request) => store.getPage(request))
    const builder = mountBuilder()
    builder.open.value = true
    await nextTick()
    await drain()
    builder.state.state.groups.genre.values = ['rock']
    expect(builder.state.canCreate).toBe(true)
    source = [track(1, 'Jazz')]
    await builder.state.create()
    expect(shared.create).not.toHaveBeenCalled()
    expect(builder.state.tracks).toEqual(source)
    expect(builder.state.saveError).toBe('smartBuilder.noMatches')
    expect(builder.state.saving).toBe(false)
    expect(builder.state.loading).toBe(false)
  })

  it.each(['close', 'unmount'])('does not revive a pending preview after %s', async (exit) => {
    const store = new LibraryCatalogSnapshotStore(() => [track(1)])
    shared.client = new SharedLibraryCatalogLoad(async (request) => {
      const page = store.getPage(request)
      await new Promise((resolve) => setTimeout(resolve, 1800))
      return page
    })
    const builder = mountBuilder()
    builder.open.value = true
    await nextTick()
    await emit('track-added')
    if (exit === 'close') builder.open.value = false
    else builder.unmount()
    await nextTick()
    await vi.advanceTimersByTimeAsync(5000)
    expect(builder.state.tracks).toEqual([])
    expect(builder.state.loading).toBe(false)
    if (exit === 'unmount') expect(shared.callbacks.size).toBe(0)
  })
})
