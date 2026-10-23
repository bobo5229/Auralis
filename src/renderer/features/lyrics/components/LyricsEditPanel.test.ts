import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRenderer, h, markRaw, nextTick, reactive, ref } from 'vue'
import LyricsEditPanel from './LyricsEditPanel.vue'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'

const api = vi.hoisted(() => ({
  openLrcEditor: vi.fn(),
  closeLrcEditor: vi.fn(),
  saveLrcEditor: vi.fn(),
}))
const playback = reactive({
  currentTrackId: 7 as number | null,
  currentTime: 3,
  duration: 120,
  isPlaying: false,
})
vi.mock('@renderer/shared/ipc/client', () => ({ auralis: { lyrics: api } }))
vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: () => ({
    state: playback,
    isPlaybackPending: ref(false),
    seekTo: vi.fn(),
    togglePlayPause: vi.fn(),
  }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/shared/focus/useOverlayFocusTrap', () => ({ useOverlayFocusTrap: vi.fn() }))
vi.mock('@renderer/shared/floating/floatingPosition', () => ({
  startFloatingPosition: vi.fn(() => ({ dispose: vi.fn(), update: vi.fn() })),
}))
vi.mock('vue', async (original) => ({
  ...(await original<typeof import('vue')>()),
  Transition: {
    inheritAttrs: false,
    setup:
      (_: unknown, { slots }: { slots: { default: () => unknown } }) =>
      () =>
        slots.default(),
  },
}))

// Real panel, dialog, menu and duet list; only host DOM, focus trap, playback and IPC are simulated.
class TestNode {
  parent: TestNode | null = null
  children: TestNode[] = []
  props: Record<string, unknown> = {}
  text = ''
  value = ''
  selectionStart = 0
  selectionEnd = 0
  isConnected = true
  style: Record<string, unknown> = {
    removeProperty: (key: string) => {
      delete this.style[key]
    },
  }
  focus = vi.fn(() => focusNode(this))
  select = vi.fn()
  constructor(public type: string) {
    markRaw(this)
  }
  setSelectionRange(start: number, end: number) {
    this.selectionStart = start
    this.selectionEnd = end
  }
  contains(node: TestNode): boolean {
    return node === this || this.children.some((child) => child.contains(node))
  }
  matches() {
    return !!this.props.disabled
  }
  closest(selector: string): TestNode | null {
    return selector === '[data-index]' && 'data-index' in this.props ? this : null
  }
  setAttribute(key: string, value: string) {
    this.props[key] = value
  }
  removeAttribute(key: string) {
    delete this.props[key]
  }
  getBoundingClientRect() {
    return { x: 0, y: 0, left: 0, top: 0, width: 80, height: 32, right: 80, bottom: 32 }
  }
  querySelector(selector: string): TestNode | undefined {
    const index = selector.match(/data-index="(\d+)"/)?.[1]
    return find(
      (node) =>
        index !== undefined
          ? String(node.props['data-index']) === index
          : String(node.props.class).split(' ').includes(selector.slice(1)),
      this,
    )
  }
}
let body: TestNode
let activeElement: TestNode | null
function focusNode(node: TestNode): void {
  activeElement = node
}
const windowListeners = new Map<string, (event: unknown) => void>()
let app: ReturnType<typeof renderer.createApp> | undefined
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
  remove(node) {
    node.parent?.children.splice(node.parent.children.indexOf(node), 1)
    node.parent = null
  },
  setText: (node, text) => {
    node.text = text
  },
  setElementText: (node, text) => {
    node.text = text
  },
  parentNode: (node) => node.parent,
  nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  patchProp(node, key, _old, value) {
    node.props[key] = value
    if (key === 'value') node.value = value as string
  },
  querySelector: () => body,
})
function find(predicate: (node: TestNode) => boolean, root = body): TestNode | undefined {
  if (predicate(root)) return root
  for (const child of root.children) {
    const found = find(predicate, child)
    if (found) return found
  }
  return undefined
}
function fire(node: TestNode, event: string, details = {}) {
  const handler = node.props[event] as (event: unknown) => unknown
  return handler({
    target: node,
    currentTarget: node,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...details,
  })
}
function textContent(node: TestNode): string {
  return node.text + node.children.map(textContent).join('')
}
function button(label: string) {
  return find(
    (node) =>
      node.type === 'button' &&
      (textContent(node).trim() === label || node.props['aria-label'] === label),
  )!
}
async function flush() {
  for (let i = 0; i < 15; i++) await nextTick()
}
function lrc(sessionId = 'raw', format: 'lrc' | 'plain' = 'lrc') {
  return {
    sessionId,
    trackId: 7,
    revision: sessionId,
    text: '[00:01.00]First\r\n[00:02.00]Second',
    format,
    canSaveTag: true,
  }
}
async function mount(returnFocusTo?: TestNode) {
  const open = ref(true)
  const panel = ref<InstanceType<typeof LyricsEditPanel> | null>(null)
  const onClose = vi.fn(() => {
    open.value = false
  })
  app = renderer.createApp({
    setup: () => () =>
      h(LyricsEditPanel, {
        ref: panel,
        open: open.value,
        returnFocusTo: returnFocusTo as unknown as HTMLElement,
        onClose,
      }),
  })
  app.directive('tooltip', {})
  app.mount(new TestNode('root'))
  await flush()
  return { open, panel, onClose }
}
function source() {
  return find((node) => node.props.id === 'lyrics-source-editor')!
}
async function edit(value: string) {
  const node = source()
  fire(node, 'onBeforeinput', { inputType: 'insertText' })
  node.value = value
  node.setSelectionRange(value.length, value.length)
  fire(node, 'onInput')
  await flush()
}
beforeEach(() => {
  vi.resetAllMocks()
  body = new TestNode('body')
  activeElement = null
  windowListeners.clear()
  playback.currentTrackId = 7
  vi.stubGlobal('HTMLElement', TestNode)
  vi.stubGlobal('Node', TestNode)
  vi.stubGlobal('document', {
    body,
    documentElement: { dataset: { reducedMotion: 'true' } },
    get activeElement() {
      return activeElement
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    querySelector: () => null,
  })
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: true }),
    addEventListener: (name: string, handler: (event: unknown) => void) =>
      windowListeners.set(name, handler),
    removeEventListener: (name: string) => windowListeners.delete(name),
  })
  api.openLrcEditor.mockImplementation(async () => ({ ok: true, value: lrc() }))
  api.closeLrcEditor.mockResolvedValue({ ok: true })
  api.saveLrcEditor.mockResolvedValue({
    ok: true,
    value: {
      writeWarning: false,
      cacheUpdated: true,
      active: true,
    },
  })
})
afterEach(async () => {
  app?.unmount()
  app = undefined
  await flush()
  vi.unstubAllGlobals()
})

it('confirms unsaved dismissal, continues on Escape, and discards without saving', async () => {
  const view = await mount()
  expect(source().value).toContain('\n')
  expect(source().value).not.toContain('\r')
  await edit('[00:01.00]Changed')
  view.panel.value!.requestClose()
  await flush()
  expect(button('lyricsEditor.continue').focus).toHaveBeenCalled()
  expect(view.onClose).not.toHaveBeenCalled()
  vi.mocked(useOverlayFocusTrap).mock.calls.at(-1)![0].onEscape()
  await flush()
  expect(button('lyricsEditor.continue')).toBeUndefined()
  expect(activeElement).toBe(source())
  view.panel.value!.requestClose()
  await flush()
  fire(button('lyricsEditor.discard'), 'onClick')
  await flush()
  expect(view.onClose).toHaveBeenCalledOnce()
  expect(api.saveLrcEditor).not.toHaveBeenCalled()
  expect(api.closeLrcEditor).toHaveBeenCalledWith('raw')
})

it('keeps history across a committed save and captures the edited track', async () => {
  await mount()
  await edit('[00:01.00]Changed')
  playback.currentTrackId = 8
  await flush()
  expect(button('lyricsEditor.play').props.disabled).toBe(true)
  fire(button('lyricsEditor.save'), 'onClick')
  await flush()
  fire(button('lyricsEditor.file'), 'onClick')
  await flush()
  expect(api.saveLrcEditor).toHaveBeenCalledWith({
    sessionId: 'raw',
    expectedRevision: 'raw',
    text: '[00:01.00]Changed',
    target: 'file',
  })
  expect(api.openLrcEditor.mock.calls).toEqual([[7], [7]])
  expect(source().value).toBe('[00:01.00]Changed')
  fire(button('lyricsEditor.undo'), 'onClick')
  await flush()
  expect(source().value).toBe(lrc().text.replace(/\r\n/g, '\n'))
  fire(button('lyricsEditor.redo'), 'onClick')
  await flush()
  expect(source().value).toBe('[00:01.00]Changed')
})

it('handles IME and menu Escape before opening the close confirmation', async () => {
  const view = await mount()
  await edit('Changed')
  fire(source(), 'onCompositionstart')
  await flush()
  view.panel.value!.requestClose()
  await flush()
  expect(button('lyricsEditor.continue')).toBeUndefined()
  expect(button('lyricsEditor.save').props.disabled).toBe(true)
  fire(source(), 'onCompositionend')
  await flush()
  fire(button('lyricsEditor.save'), 'onClick')
  await flush()
  expect(find((node) => node.props.role === 'menu')).toBeDefined()
  view.panel.value!.requestClose()
  await flush()
  expect(find((node) => node.props.role === 'menu')).toBeUndefined()
  expect(button('lyricsEditor.continue')).toBeUndefined()
  expect(activeElement).toBe(button('lyricsEditor.save'))
})

it('saves and closes only after selecting a target from the confirmation menu', async () => {
  const view = await mount()
  await edit('Changed')
  view.panel.value!.requestClose()
  await flush()
  fire(button('lyricsEditor.saveClose'), 'onClick')
  await flush()
  expect(api.saveLrcEditor).not.toHaveBeenCalled()
  fire(button('lyricsEditor.file'), 'onClick')
  await flush()
  expect(view.onClose).toHaveBeenCalledOnce()
  expect(api.openLrcEditor).toHaveBeenCalledTimes(1)
})

it('blocks dismissal and duplicate keyboard saves while the write is pending', async () => {
  const view = await mount()
  let finish!: (value: unknown) => void
  api.saveLrcEditor.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  await edit('Pending')
  const dialog = find((node) => node.props.role === 'dialog')!
  fire(dialog, 'onKeydownCapture', { ctrlKey: true, key: 's' })
  await flush()
  fire(button('lyricsEditor.file'), 'onClick')
  await flush()
  expect(source().props.readonly).toBe(true)
  expect(button('lyricsEditor.saving').props.disabled).toBe(true)
  expect(button('lyricsEditor.close').props.disabled).toBe(true)
  view.panel.value!.requestClose()
  fire(dialog, 'onKeydownCapture', { ctrlKey: true, key: 's' })
  await flush()
  expect(view.onClose).not.toHaveBeenCalled()
  expect(find((node) => node.props.role === 'menu')).toBeUndefined()
  expect(api.saveLrcEditor).toHaveBeenCalledOnce()
  finish({ ok: false, code: 'file-changed' })
  await flush()
  expect(source().value).toBe('Pending')
  expect(source().props.readonly).toBe(false)
  expect(find((node) => node.props.role === 'alert')?.text).toBe('lyricsEditor.errors.changed')
})

it('protects dirty text on beforeunload but does not treat a failed post-save reopen as an unsaved write', async () => {
  await mount()
  const clean = { preventDefault: vi.fn(), returnValue: undefined }
  windowListeners.get('beforeunload')!(clean)
  expect(clean.preventDefault).not.toHaveBeenCalled()
  await edit('Committed')
  const dirty = { preventDefault: vi.fn(), returnValue: undefined }
  windowListeners.get('beforeunload')!(dirty)
  expect(dirty.preventDefault).toHaveBeenCalledOnce()
  expect(dirty.returnValue).toBe('')
  api.openLrcEditor.mockResolvedValueOnce({ ok: false, code: 'session-expired' })
  fire(button('lyricsEditor.save'), 'onClick')
  await flush()
  fire(button('lyricsEditor.file'), 'onClick')
  await flush()
  const committed = { preventDefault: vi.fn(), returnValue: undefined }
  windowListeners.get('beforeunload')!(committed)
  expect(committed.preventDefault).not.toHaveBeenCalled()
  expect(button('lyricsEditor.reload')).toBeDefined()
  expect(source().value).toBe('Committed')
  api.openLrcEditor.mockResolvedValueOnce({ ok: true, value: lrc('reloaded') })
  fire(button('lyricsEditor.reload'), 'onClick')
  await flush()
  expect(source().value).toBe(lrc().text.replace(/\r\n/g, '\n'))
  expect(button('lyricsEditor.undo').props.disabled).toBe(true)
  app!.unmount()
  app = undefined
  await flush()
  expect(windowListeners.has('beforeunload')).toBe(false)
})

it('returns focus to the provided trigger, then a valid captured target, then the lyrics viewport', async () => {
  const trigger = new TestNode('button')
  const captured = new TestNode('button')
  const viewport = new TestNode('div')
  await mount(trigger)
  const restore = vi.mocked(useOverlayFocusTrap).mock.calls.at(-1)![0].restoreFocus!
  restore(captured as unknown as HTMLElement)
  expect(activeElement).toBe(trigger)
  trigger.isConnected = false
  restore(captured as unknown as HTMLElement)
  expect(activeElement).toBe(captured)
  captured.props.disabled = true
  vi.stubGlobal('document', { ...document, body, querySelector: () => viewport })
  restore(captured as unknown as HTMLElement)
  expect(activeElement).toBe(viewport)
})

it('offers only tag and LRC destinations in the real save menu', async () => {
  await mount()
  fire(button('lyricsEditor.save'), 'onClick')
  await flush()
  expect(button('lyricsEditor.tag')).toBeDefined()
  expect(button('lyricsEditor.file')).toBeDefined()
  expect(button('lyricsEditor.ttmlFile')).toBeUndefined()
  const menu = find((node) => node.props.role === 'menu')!
  expect(menu.children.filter((node) => node.type === 'button')).toHaveLength(2)
})

it('reports unsupported TTML without enabling editing or saving', async () => {
  api.openLrcEditor.mockResolvedValue({ ok: false, code: 'unsupported-format' })
  await mount()
  expect(textContent(body)).toContain('lyricsEditor.errors.lrcOnly')
  expect(source().props.readonly).toBe(true)
  expect(button('lyricsEditor.save').props.disabled).toBe(true)
  expect(api.saveLrcEditor).not.toHaveBeenCalled()
})
