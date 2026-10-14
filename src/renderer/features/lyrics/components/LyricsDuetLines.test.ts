import { afterEach, expect, it, vi } from 'vitest'
import { createRenderer, h, markRaw, nextTick, ref } from 'vue'
import type { LyricsEditorState } from '@shared/types/lyricsEditor'
import LyricsDuetLines from './LyricsDuetLines.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

class TestNode {
  parent: TestNode | null = null
  children: TestNode[] = []
  props: Record<string, unknown> = {}
  text = ''
  focus = vi.fn()
  constructor(public type: string) {
    markRaw(this)
  }
}
const renderer = createRenderer<TestNode, TestNode>({
  createElement: (type) => new TestNode(type),
  createText: (text) => Object.assign(new TestNode('text'), { text }),
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
    node.text = text
  },
  setElementText: (node, text) => {
    node.text = text
  },
  parentNode: (node) => node.parent,
  nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  patchProp: (node, key, _old, value) => {
    node.props[key] = value
  },
})
function all(node: TestNode, predicate: (node: TestNode) => boolean): TestNode[] {
  return [
    ...(predicate(node) ? [node] : []),
    ...node.children.flatMap((child) => all(child, predicate)),
  ]
}
function fixture() {
  const session = ref<LyricsEditorState>({
    sessionId: 'first',
    trackId: 7,
    revision: 'r1',
    dirty: false,
    editable: true,
    issues: [],
    lines: [
      {
        id: 'a',
        text: 'First',
        timeSeconds: 1.125,
        assignment: 'unassigned',
        editable: true,
        timingEditable: true,
      },
      {
        id: 'b',
        text: 'Second',
        timeSeconds: 2,
        assignment: 'performer-2',
        editable: true,
        timingEditable: true,
      },
      { id: 'c', text: 'Chorus', timeSeconds: 3, assignment: 'unsupported', editable: false },
      { id: 'd', text: 'Last', timeSeconds: 4, assignment: 'unassigned', editable: true },
    ],
  })
  const busy = ref(false)
  const assign = vi.fn()
  const retime = vi.fn()
  const matchesPlayback = ref(true)
  const root = new TestNode('root')
  const app = renderer.createApp({
    setup: () => () =>
      h(LyricsDuetLines, {
        session: session.value,
        busy: busy.value,
        currentTime: 9.125,
        matchesPlayback: matchesPlayback.value,
        onAssign: assign,
        onRetime: retime,
      }),
  })
  app.directive('tooltip', {})
  app.mount(root)
  cleanups.push(() => app.unmount())
  const rows = () => all(root, (node) => node.props.role === 'option')
  const buttons = () => all(root, (node) => node.type === 'button')
  const list = all(root, (node) => node.props.role === 'listbox')[0]
  const click = (index: number, options: Record<string, boolean> = {}) => {
    ;(rows()[index].props.onClick as (event: unknown) => void)({ ...options })
  }
  const selected = () =>
    rows()
      .filter((node) => node.props['aria-selected'])
      .map((node) => rows().indexOf(node))
  const apply = (index: number) => (buttons()[index].props.onClick as () => void)()
  return {
    root,
    session,
    busy,
    assign,
    retime,
    matchesPlayback,
    buttons,
    rows,
    list,
    click,
    selected,
    apply,
  }
}
const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
})

it('supports single, Ctrl and Shift selections while skipping read-only chorus rows', async () => {
  const view = fixture()
  view.click(0)
  await nextTick()
  expect(view.selected()).toEqual([0])
  view.click(1, { ctrlKey: true })
  await nextTick()
  expect(view.selected()).toEqual([0, 1])
  view.click(3, { shiftKey: true })
  await nextTick()
  expect(view.selected()).toEqual([1, 3])
  view.apply(0)
  expect(view.assign).toHaveBeenLastCalledWith(['b', 'd'], 'performer-1')
  view.click(2)
  await nextTick()
  expect(view.selected()).toEqual([1, 3])
})

it('selects all editable rows, clears assignments and blocks actions during requests', async () => {
  const view = fixture()
  view.apply(3)
  await nextTick()
  expect(view.selected()).toEqual([0, 1, 3])
  view.apply(2)
  expect(view.assign).toHaveBeenCalledWith(['a', 'b', 'd'], 'unassigned')
  view.busy.value = true
  await nextTick()
  view.apply(1)
  view.click(0)
  expect(view.assign).toHaveBeenCalledTimes(1)
  expect(view.selected()).toEqual([0, 1, 3])
})

it('supports keyboard range selection and resets selection when a fresh session opens', async () => {
  vi.stubGlobal('document', { getElementById: () => ({ scrollIntoView: vi.fn() }) })
  const view = fixture()
  view.click(0)
  const event = { key: 'End', shiftKey: true, preventDefault: vi.fn(), stopPropagation: vi.fn() }
  ;(view.list.props.onKeydown as (event: unknown) => void)(event)
  await nextTick()
  expect(view.selected()).toEqual([0, 1, 3])
  view.session.value = { ...view.session.value, revision: 'r2', dirty: true }
  await nextTick()
  expect(view.selected()).toEqual([0, 1, 3])
  view.session.value = { ...view.session.value, sessionId: 'reopened' }
  await nextTick()
  expect(view.selected()).toEqual([])
})

it('updates a single timestamp from playback and applies shifts to the entire selection', async () => {
  const view = fixture()
  view.click(0)
  await nextTick()
  const input = all(view.root, (node) => node.type === 'input')[0]
  expect(input.props.value).toBe('00:01.125')
  view.apply(4)
  expect(view.retime).toHaveBeenLastCalledWith(['a'], 'set', 9125)
  view.click(1, { ctrlKey: true })
  await nextTick()
  expect(view.buttons()[4].props.disabled).toBe(true)
  view.apply(4)
  expect(view.retime).toHaveBeenCalledTimes(1)
  view.apply(5)
  expect(view.retime).toHaveBeenLastCalledWith(['a', 'b'], 'shift', -100)
  view.matchesPlayback.value = false
  view.click(0)
  await nextTick()
  view.apply(4)
  expect(view.retime).toHaveBeenCalledTimes(2)
  view.apply(6)
  expect(view.retime).toHaveBeenLastCalledWith(['a'], 'shift', 100)
  view.click(3)
  await nextTick()
  expect(view.buttons()[5].props.disabled).toBe(true)
  view.apply(5)
  expect(view.retime).toHaveBeenCalledTimes(3)
  view.click(0)
  view.busy.value = true
  await nextTick()
  view.apply(4)
  view.apply(5)
  view.apply(6)
  expect(view.retime).toHaveBeenCalledTimes(3)
})

it('accepts a manual millisecond timestamp and rejects malformed input without sending a mutation', async () => {
  const view = fixture()
  view.click(0)
  await nextTick()
  const input = all(view.root, (node) => node.type === 'input')[0]
  ;(input.props.onInput as (event: unknown) => void)({ target: { value: '00:02.345' } })
  ;(input.props.onChange as () => void)()
  expect(view.retime).toHaveBeenLastCalledWith(['a'], 'set', 2345)
  ;(input.props.onInput as (event: unknown) => void)({ target: { value: '-00:01' } })
  ;(input.props.onChange as () => void)()
  await nextTick()
  expect(view.retime).toHaveBeenCalledTimes(1)
  expect(input.props['aria-invalid']).toBe(true)
})
