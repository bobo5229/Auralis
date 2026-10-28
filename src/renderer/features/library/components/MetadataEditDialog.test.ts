import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, nextTick } from 'vue'
import MetadataEditDialog from './MetadataEditDialog.vue'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'

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
}
function node(tag = '', text = ''): Node {
  return { tag, text, props: {}, children: [], parent: null, focus: vi.fn() }
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
    render: () => h(MetadataEditDialog, { metadata, saving, errorMessage: null, onSave: save }),
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
