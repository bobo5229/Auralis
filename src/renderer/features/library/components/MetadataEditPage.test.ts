import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, nextTick } from 'vue'
import MetadataEditPage from './MetadataEditPage.vue'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import { EDITABLE_TAG_FIELDS } from '@shared/utils/metadataEditRequest'

const artworkApi = vi.hoisted(() => ({
  getMetadataArtwork: vi.fn(),
  importMetadataArtwork: vi.fn(),
}))
vi.mock('@renderer/shared/ipc/client', () => ({ auralis: { metadata: artworkApi } }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/shared/dialog/AppDialog.vue', () => ({
  default: defineComponent({
    setup(_props, { slots }) {
      return () => h('form', {}, [slots.default?.(), slots.footer?.()])
    },
  }),
}))
interface Node {
  tag: string
  text: string
  props: Record<string, unknown>
  children: Node[]
  parent: Node | null
  focus: () => void
  value: string
  addEventListener: (name: string, handler: (event: unknown) => void) => void
  dispatch: (name: string) => void
  querySelector: (selector: string) => Node | undefined
  closest: () => null
  scrollIntoView: () => void
}
function node(tag = '', text = ''): Node {
  const listeners: Record<string, Array<(event: unknown) => void>> = {}
  const result: Node = {
    tag,
    text,
    props: {},
    children: [],
    parent: null,
    focus: vi.fn(),
    value: '',
    addEventListener: (name, handler) => {
      ;(listeners[name] ??= []).push(handler)
    },
    dispatch: (name) => {
      for (const handler of listeners[name] ?? []) handler({ target: result })
    },
    querySelector: (selector) => {
      const field = selector.match(/data-metadata-field="([^"]+)"/)?.[1]
      return find(result, (item) => item.props['data-metadata-field'] === field)
    },
    closest: () => null,
    scrollIntoView: vi.fn(),
  }
  return result
}
const cleanup: Array<() => void> = []
afterEach(() => {
  cleanup.splice(0).forEach((stop) => stop())
  vi.unstubAllGlobals()
})
function text(root: Node): string {
  return root.text + root.children.map(text).join(' ')
}
function find(root: Node, predicate: (node: Node) => boolean): Node | undefined {
  if (predicate(root)) return root
  for (const child of root.children) {
    const result = find(child, predicate)
    if (result) return result
  }
  return undefined
}
async function mount(metadata: EditableTrackMetadata, saving = false) {
  const renderer = createRenderer<Node, Node>({
    createElement: (tag) => node(tag),
    createText: (value) => node('', value),
    createComment: () => node(),
    insert: (child, parent) => {
      child.parent = parent
      parent.children.push(child)
    },
    remove: (child) => {
      if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    },
    setText: (target, value) => {
      target.text = value
    },
    setElementText: (target, value) => {
      target.text = value
      target.children = []
    },
    parentNode: (target) => target.parent,
    nextSibling: () => null,
    patchProp: (target, key, _old, value) => {
      target.props[key] = value
    },
  })
  const save = vi.fn(),
    root = node('root')
  const app = renderer.createApp({
    render: () => h(MetadataEditPage, { metadata, saving, errorMessage: null, onSave: save }),
  })
  app.mount(root)
  cleanup.push(() => app.unmount())
  await nextTick()
  return { root, save }
}
const file: EditableTrackMetadata = {
  trackId: 1,
  editToken: 'token',
  title: 'File title',
  artistDisplay: null,
  albumTitle: null,
  albumArtistDisplay: null,
  genreDisplay: null,
  year: 2026,
  releaseDate: '2026',
}
const legacy = { ...file, title: 'Saved title', genreDisplay: 'Pop' }

describe('metadata editor legacy choices', () => {
  it.each(['adopt-file', 'write-legacy'] as const)(
    'shows actual differences and submits the explicit %s decision',
    async (action) => {
      const { root, save } = await mount({ ...file, legacyMetadata: legacy })
      expect(text(root)).toContain('File title')
      expect(text(root)).toContain('Saved title')
      expect(text(root)).toContain('Pop')
      expect(find(root, (element) => element.tag === 'input')).toBeUndefined()
      const button = find(
        root,
        (element) =>
          element.tag === 'button' &&
          text(element).includes(action === 'adopt-file' ? 'legacy.adopt' : 'legacy.write'),
      )!
      expect(button.props.disabled).toBe(false)
      ;(button.props.onClick as () => void)()
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ trackId: 1, title: 'File title', legacyAction: action }),
      )
    },
  )
  it('disables both choices while saving and does not submit them programmatically', async () => {
    const { root, save } = await mount({ ...file, legacyMetadata: legacy }, true)
    for (const action of ['legacy.adopt', 'legacy.write']) {
      const button = find(
        root,
        (element) => element.tag === 'button' && text(element).includes(action),
      )!
      expect(button.props.disabled).toBe(true)
      ;(button.props.onClick as () => void)()
    }
    expect(save).not.toHaveBeenCalled()
  })
})

it('identifies the invalid date beside its field', async () => {
  const { root, save } = await mount(file)
  const input = find(root, (item) => item.props['data-metadata-field'] === 'releaseDate')!
  input.value = '2026-13-99'
  input.dispatch('input')
  const form = find(root, (item) => item.tag === 'form')!
  ;(form.props.onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() })
  await nextTick()
  expect(input.props['aria-invalid']).toBe('true')
  expect(input.focus).toHaveBeenCalled()
  expect(text(root)).toContain('library.metadataEditor.validation.dateInvalid')
  expect(save).not.toHaveBeenCalled()
})

it('focuses the incorrect disc number when multiple numbering fields change', async () => {
  const { root, save } = await mount({
    ...file,
    trackNo: 1,
    trackTotal: 3,
    discNo: 1,
    discTotal: 2,
  })
  const input = (field: string) =>
    find(root, (item) => item.props['data-metadata-field'] === field)!
  input('trackNo').value = '2'
  input('trackNo').dispatch('input')
  input('discNo').value = '3'
  input('discNo').dispatch('input')
  const form = find(root, (item) => item.tag === 'form')!
  ;(form.props.onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() })
  await nextTick()
  expect(input('discNo').props['aria-invalid']).toBe('true')
  expect(input('discNo').focus).toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
})

it('explains an unsupported field next to its disabled input', async () => {
  const fields = Object.fromEntries(
    EDITABLE_TAG_FIELDS.map((field) => [field, field !== 'genreDisplay']),
  ) as Record<(typeof EDITABLE_TAG_FIELDS)[number], boolean>
  const { root } = await mount({
    ...file,
    capabilities: { fields, datePrecisions: ['year', 'day'], artwork: false },
  })
  const input = find(root, (item) => item.props['data-metadata-field'] === 'genreDisplay')!
  expect(input.props.disabled).toBe(true)
  expect(text(input.parent!)).toContain('metadataEditorExtra.fieldUnsupported')
  expect(text(root)).toContain('metadataEditorExtra.monthUnsupported')
})

it('shows artwork changes as pending until they are saved', async () => {
  artworkApi.getMetadataArtwork.mockResolvedValue({
    ok: true,
    value: { pictures: [], fallbackSource: 'none' },
  })
  artworkApi.importMetadataArtwork.mockResolvedValue({
    ok: true,
    value: { imageToken: 'image', cacheKey: 'cover' },
  })
  const fields = Object.fromEntries(EDITABLE_TAG_FIELDS.map((field) => [field, true])) as Record<
    (typeof EDITABLE_TAG_FIELDS)[number],
    boolean
  >
  const { root } = await mount({
    ...file,
    capabilities: { fields, datePrecisions: ['year', 'day'], artwork: true },
  })
  const section = find(
    root,
    (item) =>
      item.tag === 'section' && String(item.props.class).includes('metadata-artwork-editor'),
  )!
  const manage = find(section, (item) => item.tag === 'button')!
  ;(manage.props.onClick as () => void)()
  await vi.waitFor(() => expect(artworkApi.getMetadataArtwork).toHaveBeenCalled())
  await nextTick()
  const add = find(
    section,
    (item) => item.tag === 'button' && text(item).includes('metadataArtwork.add'),
  )!
  ;(add.props.onClick as () => void)()
  await vi.waitFor(() => expect(text(root)).toContain('metadataArtwork.pending'))
  expect(text(section)).toContain('metadataArtwork.operations.add')
})
