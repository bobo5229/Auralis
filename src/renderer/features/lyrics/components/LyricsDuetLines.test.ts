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
  select = vi.fn()
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
        endTimeSeconds: 2.125,
        assignment: 'unassigned',
        editable: true,
        timingEditable: true,
        textEditable: true,
        editableText: 'First',
      },
      {
        id: 'b',
        text: 'Second',
        timeSeconds: 2,
        endTimeSeconds: 3,
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
  const replaceText = vi.fn().mockResolvedValue(true)
  const textEditState = vi.fn()
  const component = ref<InstanceType<typeof LyricsDuetLines> | null>(null)
  const matchesPlayback = ref(true)
  const root = new TestNode('root')
  const app = renderer.createApp({
    setup: () => () =>
      h(LyricsDuetLines, {
        ref: component,
        session: session.value,
        busy: busy.value,
        currentTime: 9.125,
        matchesPlayback: matchesPlayback.value,
        onAssign: assign,
        onRetime: retime,
        replaceText,
        onTextEditState: textEditState,
      }),
  })
  app.directive('tooltip', {})
  app.mount(root)
  cleanups.push(() => app.unmount())
  const rows = () => all(root, (node) => node.props.role === 'option')
  // Resolve by stable action identities, so layout changes cannot silently retarget assertions.
  const actions = [
    'performer-1',
    'performer-2',
    'unassigned',
    'select-all',
    'set',
    'earlier',
    'later',
    'together',
  ]
  const buttons = () =>
    actions.map((action) => all(root, (node) => node.props['data-action'] === action)[0])
  const list = all(root, (node) => node.props.role === 'listbox')[0]
  const click = (index: number, options: Record<string, boolean> = {}) => {
    ;(rows()[index].props.onClick as (event: unknown) => void)({ ...options })
  }
  const checks = () => all(root, (node) => node.props.class === 'duet-check')
  const check = (index: number, options: Record<string, boolean> = {}) => {
    const event = { ...options, stopPropagation: vi.fn() }
    ;(checks()[index].props.onClick as (event: unknown) => void)(event)
    return event
  }
  const selected = () =>
    rows()
      .filter((node) => node.props['aria-selected'])
      .map((node) => rows().indexOf(node))
  const apply = (index: number) => (buttons()[index].props.onClick as () => void)()
  const beginEdit = async (index: number) => {
    const span = all(
      rows()[index],
      (node) =>
        node.type === 'span' &&
        typeof node.props.class === 'string' &&
        node.props.class.split(' ').includes('duet-text'),
    )[0]
    await (span.props.onDblclick as (event: unknown) => Promise<void>)({ stopPropagation: vi.fn() })
    await nextTick()
  }
  const textEditor = () => all(root, (node) => node.type === 'textarea')[0]
  return {
    root,
    session,
    busy,
    assign,
    retime,
    replaceText,
    textEditState,
    component,
    beginEdit,
    textEditor,
    matchesPlayback,
    buttons,
    rows,
    list,
    click,
    checks,
    check,
    selected,
    apply,
  }
}
const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
})

it('supports single, Ctrl and Shift selections while skipping unsupported mixed rows', async () => {
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

it('opens a plain line in place and confirms text without disturbing its selection', async () => {
  const view = fixture()
  await view.beginEdit(0)
  const editor = view.textEditor()
  expect(editor.props.value).toBe('First')
  expect(editor.focus).toHaveBeenCalled()
  expect(editor.select).toHaveBeenCalled()
  ;(editor.props.onInput as (event: unknown) => void)({ target: { value: 'Changed & <literal>' } })
  expect(view.textEditState).toHaveBeenLastCalledWith(true, true)
  expect(await view.component.value!.commitText()).toBe(true)
  expect(view.replaceText).toHaveBeenCalledWith('a', 'Changed & <literal>')
  expect(view.textEditor()).toBeUndefined()
  expect(view.textEditState).toHaveBeenLastCalledWith(false, false)
  expect(view.selected()).toEqual([0])
})

it('cancels with Escape, refuses word-timed text and does not submit IME Enter', async () => {
  const view = fixture()
  await view.beginEdit(1)
  expect(view.textEditor()).toBeUndefined()
  await view.beginEdit(0)
  const editor = view.textEditor()
  ;(editor.props.onInput as (event: unknown) => void)({ target: { value: '输入中' } })
  ;(editor.props.onCompositionstart as () => void)()
  const key = (name: string) => ({ key: name, preventDefault: vi.fn(), stopPropagation: vi.fn() })
  ;(editor.props.onKeydown as (event: unknown) => void)(key('Enter'))
  expect(view.replaceText).not.toHaveBeenCalled()
  ;(editor.props.onCompositionend as (event: unknown) => void)({ target: { value: '完成' } })
  ;(editor.props.onKeydown as (event: unknown) => void)(key('Escape'))
  await nextTick()
  expect(view.textEditor()).toBeUndefined()
  expect(view.replaceText).not.toHaveBeenCalled()
  expect(view.textEditState).toHaveBeenLastCalledWith(false, false)
})

it('keeps rejected input and blocks competing row/timing/performer mutations during text editing', async () => {
  const view = fixture()
  view.replaceText.mockResolvedValue(false)
  await view.beginEdit(0)
  const editor = view.textEditor()
  ;(editor.props.onInput as (event: unknown) => void)({ target: { value: 'Retry me' } })
  view.apply(1)
  view.apply(4)
  view.check(1)
  expect(view.assign).not.toHaveBeenCalled()
  expect(view.retime).not.toHaveBeenCalled()
  expect(view.selected()).toEqual([0])
  expect(await view.component.value!.commitText()).toBe(false)
  expect(view.textEditor().props.value).toBe('Retry me')
  expect(view.textEditState).toHaveBeenLastCalledWith(true, true)
  view.replaceText.mockResolvedValue(true)
  expect(await view.component.value!.commitText()).toBe(true)
  expect(view.replaceText).toHaveBeenLastCalledWith('a', 'Retry me')
})

it('assigns the same-line chorus to the entire checked selection', async () => {
  const view = fixture()
  view.check(0)
  view.check(1)
  await nextTick()
  view.apply(7)
  expect(view.assign).toHaveBeenLastCalledWith(['a', 'b'], 'together')
  view.session.value = {
    ...view.session.value,
    revision: 'r2',
    dirty: true,
    lines: view.session.value.lines.map((line) =>
      ['a', 'b'].includes(line.id) ? { ...line, assignment: 'together' as const } : line,
    ),
  }
  await nextTick()
  expect(view.selected()).toEqual([0, 1])
  view.apply(0)
  expect(view.assign).toHaveBeenLastCalledWith(['a', 'b'], 'performer-1')
})

it('displays both endpoints and edits the end without shifting the start', async () => {
  const view = fixture()
  view.click(0)
  await nextTick()
  const end = all(
    view.root,
    (node) => node.type === 'input' && node.props['aria-label'] === 'lyricsEditor.endTime',
  )[0]
  expect(end.props.value).toBe('00:02.125')
  ;(end.props.onInput as (event: unknown) => void)({ target: { value: '00:03.456' } })
  ;(end.props.onChange as () => void)()
  expect(view.retime).toHaveBeenLastCalledWith(['a'], 'set-end', 3456)
  ;(end.props.onInput as (event: unknown) => void)({ target: { value: '00:01.000' } })
  ;(end.props.onChange as () => void)()
  await nextTick()
  expect(view.retime).toHaveBeenCalledTimes(1)
  expect(end.props['aria-invalid']).toBe(true)
  view.check(1)
  await nextTick()
  expect(end.props.disabled).toBe(true)
})

it('groups overlapping opposite performers and updates the grouping without resetting selection', async () => {
  const view = fixture()
  view.session.value.lines[0].assignment = 'performer-1'
  await nextTick()
  expect(
    all(
      view.root,
      (node) =>
        node.props.role === 'group' && node.props['aria-label'] === 'lyricsEditor.simultaneous',
    ),
  ).toHaveLength(1)
  view.check(0)
  view.check(1)
  view.session.value = {
    ...view.session.value,
    revision: 'r2',
    lines: view.session.value.lines.map((line) =>
      line.id === 'a' ? { ...line, endTimeSeconds: 2 } : line,
    ),
  }
  await nextTick()
  expect(all(view.root, (node) => node.props.role === 'group')).toHaveLength(0)
  expect(view.selected()).toEqual([0, 1])
  view.apply(1)
  expect(view.assign).toHaveBeenLastCalledWith(['a', 'b'], 'performer-2')
})

it('shows a checkbox on every row and accumulates clicks for batch performer assignments without modifiers', async () => {
  const view = fixture()
  expect(view.checks()).toHaveLength(view.rows().length)
  expect(all(view.root, (node) => node.props.class === 'duet-checkbox')).toHaveLength(4)
  const event = view.check(0)
  expect(event.stopPropagation).toHaveBeenCalledOnce()
  view.check(1)
  await nextTick()
  expect(view.selected()).toEqual([0, 1])
  expect(all(view.root, (node) => node.props.class === 'i-lucide-check')).toHaveLength(2)
  view.apply(0)
  expect(view.assign).toHaveBeenLastCalledWith(['a', 'b'], 'performer-1')
  view.session.value = { ...view.session.value, revision: 'r2', dirty: true }
  await nextTick()
  expect(view.selected()).toEqual([0, 1])
  view.apply(1)
  expect(view.assign).toHaveBeenLastCalledWith(['a', 'b'], 'performer-2')
  view.check(0)
  await nextTick()
  expect(view.selected()).toEqual([1])
  view.apply(1)
  expect(view.assign).toHaveBeenLastCalledWith(['b'], 'performer-2')
})

it('supports additive Shift checkbox ranges and blocks read-only or busy checkbox changes', async () => {
  const view = fixture()
  view.check(0)
  view.check(3, { shiftKey: true })
  await nextTick()
  expect(view.selected()).toEqual([0, 1, 3])
  view.check(2)
  await nextTick()
  expect(view.selected()).toEqual([0, 1, 3])
  view.busy.value = true
  await nextTick()
  view.check(0)
  expect(view.selected()).toEqual([0, 1, 3])
  view.apply(0)
  expect(view.assign).not.toHaveBeenCalled()
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
