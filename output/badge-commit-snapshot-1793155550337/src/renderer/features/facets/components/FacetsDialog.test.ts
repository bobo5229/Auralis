import { afterEach, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, ref } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { TrackListItem } from '@shared/types/libraryScan'
import FacetsDialog from './FacetsDialog.vue'

const library = vi.hoisted(() => ({
  getTracks: vi.fn<AuralisApi['library']['getTracks']>(),
  onChanged: vi.fn<AuralisApi['library']['onChanged']>(),
}))
vi.mock('@renderer/shared/ipc/client', () => ({ auralis: { library } }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/shared/dialog/AppDialog.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { open: Boolean },
      setup:
        (props, { slots }) =>
        () =>
          props.open ? h('section', slots.default?.()) : null,
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
async function mount() {
  library.getTracks.mockResolvedValue(songs)
  let changed!: Parameters<AuralisApi['library']['onChanged']>[0]
  library.onChanged.mockImplementation((callback) => {
    changed = callback
    return () => {}
  })
  const open = ref(false)
  const app = renderer.createApp(() => h(FacetsDialog, { open: open.value }))
  const root = node()
  app.mount(root)
  cleanups.push(() => app.unmount())
  open.value = true
  await nextTick()
  await nextTick()
  const column = (index: number) => byClass(byClass(root, 'facet-column')[index], 'facet-option')
  const labels = (index: number) => column(index).map((item) => text(item.children[0]))
  const click = async (index: number, label: string) => {
    const item = column(index).find((item) => text(item.children[0]) === label)!
    ;(item.props.onClick as () => void)()
    await nextTick()
  }
  return {
    labels,
    click,
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
