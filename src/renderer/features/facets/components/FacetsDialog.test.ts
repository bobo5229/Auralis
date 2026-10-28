import { afterEach, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, ref } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { TrackListItem } from '@shared/types/libraryScan'
import FacetsDialog from './FacetsDialog.vue'

const library = vi.hoisted(() => ({
  getTracks: vi.fn<AuralisApi['library']['getTracks']>(),
  onChanged: vi.fn<AuralisApi['library']['onChanged']>(),
}))
const create = vi.hoisted(() => vi.fn<AuralisApi['smartPlaylists']['create']>())
vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: { library, smartPlaylists: { create } },
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, number>) =>
      key === 'facets.matchCount' ? `${values?.count} / ${values?.total}` : key,
  }),
}))
vi.mock('@renderer/shared/dialog/AppDialog.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { open: Boolean },
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h('section', [
                slots.subtitle?.(),
                slots['header-actions']?.(),
                slots.default?.(),
                slots.footer?.(),
                slots.overlay?.(),
              ])
            : null,
    }),
  }
})

interface TestNode {
  props: Record<string, unknown>
  children: TestNode[]
  parent: TestNode | null
  text: string
}
const node = (text = ''): TestNode => ({ props: {}, children: [], parent: null, text })
const renderer = createRenderer<TestNode, TestNode>({
  createElement: () => node(),
  createText: node,
  createComment: () => node(),
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
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
function byClass(root: TestNode, className: string): TestNode[] {
  return [root, ...root.children.flatMap((child) => byClass(child, className))].filter((item) =>
    String(item.props.class ?? '')
      .split(' ')
      .includes(className),
  )
}
function text(root: TestNode): string {
  return root.text + root.children.map(text).join('')
}
const songs = [
  { id: 1, genre: 'Rock', artist: 'A', albumArtist: 'A', album: 'One' },
  { id: 2, genre: 'Jazz', artist: 'B', albumArtist: 'B', album: 'Two' },
  { id: 3, genre: 'Rock; Pop', artist: 'B', albumArtist: 'B', album: 'Three' },
  { id: 4, genre: null, artist: null, albumArtist: null, album: 'No tags' },
] as TrackListItem[]
async function settle() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function mount(
  initialTracks = songs,
  options: { initiallyOpen?: boolean; failLoad?: boolean } = {},
) {
  vi.stubGlobal('window', { innerWidth: 1180, innerHeight: 760 })
  library.getTracks.mockReset().mockResolvedValue(initialTracks)
  if (options.failLoad) library.getTracks.mockRejectedValueOnce(new Error('read failed'))
  create.mockReset().mockResolvedValue({
    created: true,
    playlist: { id: 99, name: 'Created' } as never,
  })
  let changed!: Parameters<AuralisApi['library']['onChanged']>[0]
  library.onChanged.mockImplementation((callback) => {
    changed = callback
    return () => {}
  })
  const open = ref(options.initiallyOpen ?? false)
  const openedAlbum = vi.fn()
  const created = vi.fn()
  const close = vi.fn(() => {
    open.value = false
  })
  const app = renderer.createApp(() =>
    h(FacetsDialog, {
      open: open.value,
      onOpenAlbum: openedAlbum,
      onCreated: created,
      onClose: close,
    }),
  )
  const root = node()
  app.mount(root)
  cleanups.push(() => app.unmount())
  open.value = true
  await settle()
  const column = (index: number) => byClass(byClass(root, 'facet-column')[index], 'facet-option')
  const label = (index: number, item: TestNode) =>
    text(index === 2 ? item.children[0].children[0] : item.children[0])
  const labels = (index: number) => column(index).map((item) => label(index, item))
  const click = async (index: number, label: string) => {
    const item = column(index).find((_, optionIndex) => labels(index)[optionIndex] === label)!
    ;(item.props.onClick as () => void)()
    await nextTick()
  }
  return {
    root,
    column,
    labels,
    click,
    open,
    openedAlbum,
    created,
    close,
    context: async (index: number, label: string) => {
      const item = column(index).find((item) => text(item.children[0]) === label)!
      ;(item.props.onContextmenu as (event: unknown) => void)({
        clientX: 100,
        clientY: 100,
        preventDefault() {},
      })
      await settle()
    },
    create: async () => {
      ;(byClass(root, 'library-context-menu-item')[0].props.onClick as () => void)()
      await settle()
    },
    change: () => changed({ reason: 'metadata-refresh', trackIds: [], filePaths: [] }),
  }
}

it('keeps cascading genre and artist selection, including multi-value genres and toggling', async () => {
  const view = await mount()
  await view.click(0, 'Rock')
  expect(view.labels(1)).toEqual(['A', 'B'])
  await view.click(1, 'B')
  expect(view.labels(2)).toEqual(['Three'])
  await view.click(1, 'B')
  expect(view.labels(2)).toEqual(['One', 'Three'])
  await view.click(0, 'Pop')
  expect(view.labels(1)).toEqual(['B'])
  expect(view.labels(2)).toEqual(['Three'])
})

it('opens the exact full album identity once for a collaboration selected by one artist', async () => {
  const collaboration = [
    { ...songs[0], albumArtist: 'A; B', album: 'Shared' },
    { ...songs[1], albumArtist: 'A; B', album: 'Shared' },
  ]
  const view = await mount(collaboration)
  await view.click(1, 'A')
  expect(view.labels(2)).toEqual(['Shared'])
  expect(text(view.column(2)[0].children[1])).toBe('2')
  ;(view.column(2)[0].props.onClick as () => void)()
  expect(view.openedAlbum).toHaveBeenCalledExactlyOnceWith({
    albumArtist: 'A; B',
    albumTitle: 'Shared',
  })
  expect(view.close).toHaveBeenCalledOnce()
})

it('loads when initially mounted open', async () => {
  const view = await mount(songs, { initiallyOpen: true })
  expect(library.getTracks).toHaveBeenCalledOnce()
  expect(view.labels(0)).toContain('Rock')
})

it('clears a removed genre permanently rather than resurrecting its selection', async () => {
  const view = await mount()
  await view.click(0, 'Rock')
  library.getTracks.mockResolvedValueOnce([songs[1]])
  view.change()
  await settle()
  library.getTracks.mockResolvedValueOnce(songs)
  view.change()
  await settle()
  expect(view.labels(1)).toEqual(['A', 'B', 'facets.unknownArtist'])
  expect(view.column(0).every((item) => !item.props['aria-pressed'])).toBe(true)
})

it('shows a load failure and recovers through the real retry button', async () => {
  const view = await mount(songs, { failLoad: true })
  expect(text(view.root)).toContain('facets.loadError')
  expect(text(view.root)).not.toContain('facets.empty')
  ;(
    byClass(byClass(view.root, 'facets-feedback-row')[0], 'auralis-dialog-action')[0].props
      .onClick as () => void
  )()
  await settle()
  expect(view.labels(0)).toContain('Rock')
  expect(text(view.root)).not.toContain('facets.loadError')
})

it('reports refresh failure without enabling creation against stale data', async () => {
  const view = await mount()
  library.getTracks.mockRejectedValueOnce(new Error('refresh failed'))
  view.change()
  await settle()
  expect(text(view.root)).toContain('facets.loadError')
  expect(view.column(0).every((item) => item.props.disabled)).toBe(true)
})

it('discards out of order refresh responses and their failures', async () => {
  const view = await mount()
  const old = deferred<TrackListItem[]>()
  const fresh = deferred<TrackListItem[]>()
  library.getTracks.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
  view.change()
  view.change()
  fresh.resolve([songs[1]])
  await settle()
  old.reject(new Error('obsolete failure'))
  await settle()
  expect(view.labels(0)).toEqual(['Jazz'])
  expect(text(view.root)).not.toContain('facets.loadError')
  const earlier = deferred<TrackListItem[]>()
  library.getTracks.mockReturnValueOnce(earlier.promise).mockResolvedValueOnce([songs[0]])
  view.change()
  view.change()
  await settle()
  earlier.resolve([songs[1]])
  await settle()
  expect(view.labels(0)).toEqual(['Rock'])
})

it('invalidates reads across close and reopen', async () => {
  const view = await mount()
  const old = deferred<TrackListItem[]>()
  library.getTracks.mockReturnValueOnce(old.promise)
  view.change()
  view.open.value = false
  await settle()
  library.getTracks.mockResolvedValueOnce([songs[1]])
  view.open.value = true
  await settle()
  old.resolve([songs[0]])
  await settle()
  expect(view.labels(0)).toEqual(['Jazz'])
})

it('creates the combined genre and artist rule and reports the result', async () => {
  const view = await mount()
  await view.click(0, 'Rock')
  await view.context(1, 'B')
  await view.create()
  expect(create).toHaveBeenCalledExactlyOnceWith('Rock · B', {
    conditions: [
      { field: 'genre', value: 'Rock' },
      { field: 'albumArtist', value: 'B' },
    ],
  })
  expect(view.created).toHaveBeenCalledOnce()
  expect(view.close).toHaveBeenCalledOnce()
})

it('retries the original failed creation and prevents duplicate submits while saving', async () => {
  const view = await mount()
  create.mockRejectedValueOnce(new Error('create failed'))
  await view.context(0, 'Rock')
  await view.create()
  expect(text(view.root)).toContain('facets.createError')
  expect(view.close).not.toHaveBeenCalled()
  const pending = deferred<Awaited<ReturnType<AuralisApi['smartPlaylists']['create']>>>()
  create.mockReturnValueOnce(pending.promise)
  const retry = byClass(byClass(view.root, 'facets-feedback-row')[0], 'auralis-dialog-action')[0]
    .props.onClick as () => void
  retry()
  retry()
  await settle()
  expect(create).toHaveBeenCalledTimes(2)
  expect(create.mock.calls[1]).toEqual(create.mock.calls[0])
  expect(text(view.root)).toContain('facets.creating')
  expect(view.column(0).every((item) => item.props.disabled)).toBe(true)
  pending.resolve({ created: true, playlist: { id: 99 } as never })
  await settle()
  expect(view.created).toHaveBeenCalledOnce()
  expect(view.close).toHaveBeenCalledOnce()
})

it('shows an empty state only for a successful empty library read', async () => {
  const view = await mount([])
  expect(text(view.root)).toContain('facets.empty')
  expect(text(view.root)).not.toContain('facets.loadError')
})

it('reports the filtered count and enables reset only when a filter is active', async () => {
  const view = await mount()
  expect(byClass(view.root, 'facets-reset')[0].props.disabled).toBe(true)
  await view.click(0, 'Rock')
  expect(text(byClass(view.root, 'facet-count')[0])).toBe('2 / 4')
  expect(byClass(view.root, 'facets-reset')[0].props.disabled).toBe(false)
  ;(byClass(view.root, 'facets-reset')[0].props.onClick as () => void)()
  await settle()
  expect(view.labels(1)).toEqual(['A', 'B', 'facets.unknownArtist'])
  expect(byClass(view.root, 'facets-reset')[0].props.disabled).toBe(true)
})

it('matches unknown values without treating them as an unselected filter', async () => {
  const view = await mount()
  await view.click(0, 'facets.unknownGenre')
  expect(view.labels(1)).toEqual(['facets.unknownArtist'])
  await view.click(1, 'facets.unknownArtist')
  expect(view.labels(2)).toEqual(['No tags'])
})

it('invalidates the selected options when refreshed catalog data removes them', async () => {
  const view = await mount()
  await view.click(0, 'Rock')
  await view.click(1, 'B')
  library.getTracks.mockResolvedValueOnce([songs[0]])
  view.change()
  await nextTick()
  await nextTick()
  expect(view.labels(1)).toEqual(['A'])
  expect(view.labels(2)).toEqual(['One'])
})
