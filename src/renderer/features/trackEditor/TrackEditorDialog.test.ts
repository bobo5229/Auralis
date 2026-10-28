import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRenderer, h, markRaw, nextTick, reactive, ref } from 'vue'
import TrackEditorDialog from './TrackEditorDialog.vue'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'

const api = vi.hoisted(() => ({
  openLrcEditor: vi.fn(),
  closeLrcEditor: vi.fn(),
  saveLrcEditor: vi.fn(),
  getTrackEditSnapshot: vi.fn(),
  getTrackEditState: vi.fn(),
  onTrackEditStateChanged: vi.fn(),
  updateTrackMetadata: vi.fn(),
}))
const playback = reactive({
  currentTrackId: 7 as number | null,
  currentTrack: { id: 7, title: 'First track', artist: 'First artist' },
  currentTime: 3,
  duration: 120,
  isPlaying: false,
  error: null as string | null,
})
const playbackActions = { seekTo: vi.fn(), togglePlayPause: vi.fn(), play: vi.fn() }
const commandRevision = ref(0)
vi.mock('@renderer/shared/ipc/client', () => ({ auralis: { lyrics: api, metadata: api } }))
vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: () => ({
    state: playback,
    commandRevision,
    isPlaybackPending: ref(false),
    ...playbackActions,
  }),
}))
vi.mock('@renderer/features/library/components/SaveProgressIcon.vue', () => ({
  default: {
    setup(_: unknown, { expose }: { expose: (value: unknown) => void }) {
      expose({ complete: async () => {} })
      return () => null
    },
  },
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
  addEventListener() {}
  removeEventListener() {}
  getRootNode() {
    return document
  }
  get tagName() {
    return this.type.toUpperCase()
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
async function mount(
  returnFocusTo?: TestNode,
  initialTab: 'metadata' | 'lyrics' = 'lyrics',
  restoreFocus?: () => boolean | Promise<boolean>,
  artworkCacheKey?: string | null,
) {
  const open = ref(true)
  const panel = ref<InstanceType<typeof TrackEditorDialog> | null>(null)
  const onClose = vi.fn(() => {
    open.value = false
  })
  app = renderer.createApp({
    setup: () => () =>
      h(TrackEditorDialog, {
        ref: panel,
        request: open.value
          ? {
              trackId: 7,
              initialTab,
              artworkCacheKey,
              returnFocusTo: returnFocusTo as unknown as HTMLElement,
              restoreFocus,
            }
          : null,
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
  api.getTrackEditSnapshot.mockResolvedValue({
    trackId: 7,
    editToken: 'meta',
    title: 'First track',
    artistDisplay: 'First artist',
    albumTitle: null,
    albumArtistDisplay: null,
    genreDisplay: null,
    releaseDate: null,
    year: null,
  })
  api.getTrackEditState.mockResolvedValue({ status: 'editable', version: 1 })
  api.onTrackEditStateChanged.mockReturnValue(() => {})
  playback.currentTrackId = 7
  playback.currentTrack = { id: 7, title: 'First track', artist: 'First artist' }
  playback.currentTime = 3
  playback.duration = 120
  playback.isPlaying = false
  playback.error = null
  commandRevision.value = 0
  playbackActions.play.mockImplementation(async () => {
    commandRevision.value++
    playback.isPlaying = true
  })
  vi.stubGlobal('Document', class {})
  vi.stubGlobal('ShadowRoot', class {})
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

it('moves enhanced clocks together through real buttons, undo, redo and raw save', async () => {
  await mount()
  const original = '[00:01.123]<00:01.123>我 <00:01.456>听<00:02.000>'
  await edit(original)
  expect(button('lyricsEditor.later').props.disabled).toBe(false)
  fire(button('lyricsEditor.later'), 'onClick')
  await flush()
  const changed = '[00:01.223]<00:01.223>我 <00:01.556>听<00:02.100>'
  expect(source().value).toBe(changed)
  fire(button('lyricsEditor.undo'), 'onClick')
  await flush()
  expect(source().value).toBe(original)
  fire(button('lyricsEditor.redo'), 'onClick')
  await flush()
  expect(source().value).toBe(changed)
  fire(button('lyricsEditor.save'), 'onClick')
  await flush()
  fire(button('lyricsEditor.file'), 'onClick')
  await flush()
  expect(api.saveLrcEditor).toHaveBeenCalledWith(
    expect.objectContaining({ text: changed, target: 'file' }),
  )
  await edit('[00:00.050]<00:00.050>我<00:00.100>')
  fire(button('lyricsEditor.earlier'), 'onClick')
  await flush()
  expect(source().value).toBe('[00:00.050]<00:00.050>我<00:00.100>')
  expect(find((node) => textContent(node) === 'lyricsEditor.cannotShift')).toBeDefined()
  await edit('[00:01]<00:03>我<00:02>听')
  expect(button('lyricsEditor.later').props.disabled).toBe(true)
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
  fire(button('trackEditor.discardAll'), 'onClick')
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

it('returns to per-page saving instead of saving all from close confirmation', async () => {
  const view = await mount()
  await edit('Changed')
  view.panel.value!.requestClose()
  await flush()
  expect(button('lyricsEditor.saveClose')).toBeUndefined()
  expect(api.saveLrcEditor).not.toHaveBeenCalled()
  fire(button('lyricsEditor.continue'), 'onClick')
  await flush()
  fire(button('lyricsEditor.save'), 'onClick')
  await flush()
  fire(button('lyricsEditor.file'), 'onClick')
  await flush()
  expect(view.onClose).not.toHaveBeenCalled()
  expect(api.openLrcEditor).toHaveBeenCalledTimes(2)
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
  expect(button('dialog.close').props.disabled).toBe(true)
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

it('explains protected embedded TTML and offers only LRC saving', async () => {
  api.openLrcEditor.mockResolvedValue({
    ok: true,
    value: { ...lrc(), canSaveTag: false, tagWriteProtected: true },
  })
  await mount()
  expect(textContent(body)).toContain('lyricsEditor.tagTtmlProtected')
  await edit('[00:01]Updated')
  fire(button('lyricsEditor.save'), 'onClick')
  await flush()
  expect(button('lyricsEditor.tag').props.disabled).toBe(true)
  expect(button('lyricsEditor.file').props.disabled).toBe(false)
})

it('reports unsupported TTML without enabling editing or saving', async () => {
  api.openLrcEditor.mockResolvedValue({ ok: false, code: 'unsupported-format' })
  await mount()
  expect(textContent(body)).toContain('lyricsEditor.errors.lrcOnly')
  expect(source().props.readonly).toBe(true)
  expect(button('lyricsEditor.save').props.disabled).toBe(true)
  expect(api.saveLrcEditor).not.toHaveBeenCalled()
})

it('keeps the editing track and dirty state visible after playback switches', async () => {
  await mount()
  expect(textContent(body)).toContain('First track')
  expect(textContent(body)).toContain('First artist')
  expect(textContent(body)).not.toContain('First track ·')
  await edit('[00:01.00]Changed')
  expect(textContent(body)).toContain('lyricsEditor.unsaved')
  playback.currentTrackId = 8
  playback.currentTrack = { id: 8, title: 'Second track', artist: 'Second artist' }
  await flush()
  expect(textContent(body)).toContain('First track')
  expect(textContent(body)).toContain('First artist')
  expect(textContent(body)).not.toContain('First track ·')
  expect(textContent(body)).not.toContain('Second track')
  expect(textContent(body)).toContain('lyricsEditor.playbackMismatch')
  expect(button('lyricsEditor.playLine').props.disabled).toBe(true)
})

it('plays from the selected line with offset, and guards invalid and pending actions', async () => {
  await mount()
  await edit('[offset:500]\n[00:02.00]First\nUntimed')
  const editor = source()
  editor.setSelectionRange(18, 18)
  fire(editor, 'onSelect')
  await flush()
  let finish!: () => void
  playbackActions.play.mockImplementationOnce(() => {
    commandRevision.value++
    return new Promise<void>((resolve) => {
      finish = () => {
        playback.isPlaying = true
        resolve()
      }
    })
  })
  fire(button('lyricsEditor.playLine'), 'onClick')
  await flush()
  expect(playbackActions.seekTo).not.toHaveBeenCalled()
  expect(playbackActions.play).toHaveBeenCalledOnce()
  expect(button('lyricsEditor.playLine').props.disabled).toBe(true)
  fire(button('lyricsEditor.playLine'), 'onClick')
  expect(playbackActions.seekTo).not.toHaveBeenCalled()
  finish()
  await flush()
  expect(playbackActions.seekTo).toHaveBeenCalledWith(1.5)
  fire(button('lyricsEditor.playLine'), 'onClick')
  await flush()
  expect(playbackActions.play).toHaveBeenCalledOnce()
  editor.setSelectionRange(editor.value.length, editor.value.length)
  fire(editor, 'onSelect')
  await flush()
  expect(button('lyricsEditor.playLine').props.disabled).toBe(true)
  expect(textContent(body)).toContain('lyricsEditor.noLineTime')
  expect(playbackActions.seekTo).toHaveBeenCalledTimes(2)
})

it.each(['command', 'track', 'close', 'confirmation', 'unmount', 'failure'] as const)(
  'does not seek after a pending start when %s changes',
  async (change) => {
    const view = await mount()
    let finish!: () => void
    playbackActions.play.mockImplementationOnce(() => {
      commandRevision.value++
      return new Promise<void>((resolve) => {
        finish = () => {
          playback.isPlaying = change !== 'failure'
          resolve()
        }
      })
    })
    fire(button('lyricsEditor.playLine'), 'onClick')
    await flush()
    if (change === 'command') commandRevision.value++
    if (change === 'track') playback.currentTrackId = 8
    if (change === 'close') view.open.value = false
    if (change === 'unmount') {
      app!.unmount()
      app = undefined
    }
    if (change === 'failure') playback.error = 'failed'
    if (change === 'confirmation') {
      await edit('[00:01.00]Changed')
      view.panel.value!.requestClose()
    }
    await flush()
    finish()
    await flush()
    expect(playbackActions.seekTo).not.toHaveBeenCalled()
  },
)

it('seeks after a successful resume even when an earlier error remains', async () => {
  await mount()
  playback.error = 'previous error'
  fire(button('lyricsEditor.playLine'), 'onClick')
  await flush()
  expect(playbackActions.seekTo).toHaveBeenCalledWith(1)
})

it('does not seek if saving starts while playback is starting', async () => {
  await mount()
  await edit('[00:01.00]Changed')
  let finishPlay!: () => void
  let finishSave!: (value: unknown) => void
  playbackActions.play.mockImplementationOnce(() => {
    commandRevision.value++
    return new Promise<void>((resolve) => {
      finishPlay = () => {
        playback.isPlaying = true
        resolve()
      }
    })
  })
  api.saveLrcEditor.mockReturnValueOnce(
    new Promise((resolve) => {
      finishSave = resolve
    }),
  )
  fire(button('lyricsEditor.playLine'), 'onClick')
  await flush()
  fire(button('lyricsEditor.save'), 'onClick')
  await flush()
  fire(button('lyricsEditor.file'), 'onClick')
  await flush()
  expect(source().props.readonly).toBe(true)
  finishPlay()
  await flush()
  expect(playbackActions.seekTo).not.toHaveBeenCalled()
  finishSave({ ok: false, code: 'file-changed' })
  await flush()
})

it('loads the editing track metadata independently of playback', async () => {
  playback.currentTrack = { id: 8, title: 'Wrong track', artist: 'Wrong artist' }
  await mount()
  expect(api.getTrackEditSnapshot).toHaveBeenCalledWith(7)
  expect(textContent(body)).toContain('First track')
  expect(textContent(body)).not.toContain('Wrong track')
})

it('freezes the body during the close confirmation and restores editing', async () => {
  const view = await mount()
  await edit('[00:01.00]Changed')
  view.panel.value!.requestClose()
  await flush()
  expect(
    find((node) => String(node.props.class).includes('lyrics-editor-content'))?.props.inert,
  ).toBe(true)
  expect(source().props.readonly).toBe(true)
  expect(button('lyricsEditor.updateTime').props.disabled).toBe(true)
  expect(button('lyricsEditor.playLine').props.disabled).toBe(true)
  fire(button('lyricsEditor.continue'), 'onClick')
  await flush()
  expect(source().props.readonly).toBe(false)
  expect(activeElement).toBe(source())
})

function tab(name: 'metadata' | 'lyrics') {
  return find((node) => node.props.id === `track-tab-${name}`)!
}
function titleInput() {
  return find((node) => node.props.placeholder === 'library.metadataEditor.placeholders.title')!
}
function changeTitle(value: string) {
  ;(titleInput().props['onUpdate:modelValue'] as (value: string) => void)(value)
}
async function switchTo(name: 'metadata' | 'lyrics') {
  fire(tab(name), 'onClick')
  await flush()
}
async function saveMetadata() {
  fire(find((node) => node.type === 'form')!, 'onSubmit')
  await flush()
}

it('opens metadata without loading lyrics and preserves both drafts, selection, history and scrolling across tabs', async () => {
  const view = await mount(undefined, 'metadata')
  expect(tab('metadata').props['aria-selected']).toBe(true)
  expect(api.openLrcEditor).not.toHaveBeenCalled()
  changeTitle('Metadata draft')
  await switchTo('lyrics')
  await edit('[00:01.00]Lyric draft')
  const originalEditor = source()
  originalEditor.setSelectionRange(13, 17)
  Reflect.set(originalEditor, 'scrollTop', 80)
  await switchTo('metadata')
  expect(titleInput().value).toBe('Metadata draft')
  await switchTo('lyrics')
  expect(source()).toBe(originalEditor)
  expect(source().value).toBe('[00:01.00]Lyric draft')
  expect(source().selectionStart).toBe(13)
  expect(Reflect.get(source(), 'scrollTop')).toBe(80)
  expect(api.openLrcEditor).toHaveBeenCalledOnce()
  fire(button('lyricsEditor.undo'), 'onClick')
  await flush()
  expect(source().value).toBe(lrc().text.replace(/\r\n/g, '\n'))
  view.panel.value!.requestClose()
  await flush()
  expect(textContent(body)).toContain('trackEditor.unsavedPages')
  expect(api.updateTrackMetadata).not.toHaveBeenCalled()
})

it('refreshes metadata credentials after a lyrics save without resetting the metadata draft', async () => {
  const snapshot = await api.getTrackEditSnapshot()
  api.getTrackEditSnapshot
    .mockResolvedValueOnce(snapshot)
    .mockResolvedValueOnce({ ...snapshot, editToken: 'after-lyrics' })
    .mockResolvedValue({ ...snapshot, title: 'Metadata draft', editToken: 'after-metadata' })
  api.updateTrackMetadata.mockResolvedValue({ ok: true })
  const view = await mount(undefined, 'metadata')
  changeTitle('Metadata draft')
  await switchTo('lyrics')
  await edit('[00:01.00]Saved lyrics')
  fire(button('lyricsEditor.save'), 'onClick')
  await flush()
  fire(button('lyricsEditor.tag'), 'onClick')
  await flush()
  expect(view.onClose).not.toHaveBeenCalled()
  await switchTo('metadata')
  expect(titleInput().value).toBe('Metadata draft')
  await saveMetadata()
  expect(api.updateTrackMetadata).toHaveBeenCalledWith({
    trackId: 7,
    editToken: 'after-lyrics',
    changes: { title: 'Metadata draft' },
  })
  expect(view.onClose).not.toHaveBeenCalled()
  expect(source().value).toBe('[00:01.00]Saved lyrics')
})

it('refreshes lyrics credentials after metadata save and preserves lyrics draft and undo', async () => {
  const snapshot = await api.getTrackEditSnapshot()
  api.updateTrackMetadata.mockResolvedValue({ ok: true })
  const view = await mount()
  await edit('[00:01.00]Lyric draft')
  const editor = source()
  editor.setSelectionRange(12, 14)
  await switchTo('metadata')
  changeTitle('Saved title')
  api.getTrackEditSnapshot.mockResolvedValue({
    ...snapshot,
    title: 'Saved title',
    editToken: 'new-token',
  })
  api.openLrcEditor.mockResolvedValue({ ok: true, value: lrc('after-metadata') })
  await saveMetadata()
  expect(view.onClose).not.toHaveBeenCalled()
  expect(source()).toBe(editor)
  expect(source().selectionStart).toBe(12)
  await switchTo('lyrics')
  expect(source().value).toBe('[00:01.00]Lyric draft')
  fire(button('lyricsEditor.save'), 'onClick')
  await flush()
  fire(button('lyricsEditor.tag'), 'onClick')
  await flush()
  expect(api.saveLrcEditor).toHaveBeenCalledWith(
    expect.objectContaining({ sessionId: 'after-metadata', text: '[00:01.00]Lyric draft' }),
  )
  fire(button('lyricsEditor.undo'), 'onClick')
  await flush()
  expect(source().value).toBe(lrc().text.replace(/\r\n/g, '\n'))
})

it('preserves drafts and blocks metadata save when refreshed disk metadata conflicts', async () => {
  await mount(undefined, 'metadata')
  changeTitle('Metadata draft')
  await switchTo('lyrics')
  await edit('Lyrics draft')
  const snapshot = await api.getTrackEditSnapshot()
  api.getTrackEditSnapshot.mockResolvedValue({
    ...snapshot,
    title: 'External edit',
    editToken: 'external',
  })
  fire(button('lyricsEditor.save'), 'onClick')
  await flush()
  fire(button('lyricsEditor.file'), 'onClick')
  await flush()
  await switchTo('metadata')
  expect(titleInput().value).toBe('Metadata draft')
  expect(textContent(body)).toContain('trackEditor.conflict')
  await saveMetadata()
  expect(api.updateTrackMetadata).not.toHaveBeenCalled()
})

it('preserves lyrics and blocks their save when disk lyrics changed during metadata writing', async () => {
  api.updateTrackMetadata.mockResolvedValue({ ok: true })
  await mount()
  await edit('Lyrics draft')
  await switchTo('metadata')
  changeTitle('Saved title')
  api.openLrcEditor.mockResolvedValue({
    ok: true,
    value: { ...lrc('external'), text: 'External lyrics' },
  })
  await saveMetadata()
  await switchTo('lyrics')
  expect(source().value).toBe('Lyrics draft')
  expect(textContent(body)).toContain('trackEditor.conflict')
  expect(button('lyricsEditor.save').props.disabled).toBe(true)
})

it('locks tabs and close during metadata saving, retaining the panel after success', async () => {
  const view = await mount(undefined, 'metadata')
  changeTitle('Saving title')
  let finish!: (value: unknown) => void
  api.updateTrackMetadata.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  void saveMetadata()
  await flush()
  expect(tab('lyrics').props.disabled).toBe(true)
  fire(tab('lyrics'), 'onKeydown', { key: 'ArrowRight' })
  await flush()
  expect(tab('metadata').props['aria-selected']).toBe(true)
  view.panel.value!.requestClose()
  expect(view.onClose).not.toHaveBeenCalled()
  finish({ ok: true })
  await flush()
  expect(view.onClose).not.toHaveBeenCalled()
})

it('waits for a slow peer credential refresh before unlocking lyrics save or tabs', async () => {
  await mount()
  await edit('Saved lyrics')
  let finish!: (value: unknown) => void
  const original = await api.getTrackEditSnapshot()
  api.getTrackEditSnapshot.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const opens = api.openLrcEditor.mock.calls.length
  fire(button('lyricsEditor.save'), 'onClick')
  await flush()
  fire(button('lyricsEditor.tag'), 'onClick')
  await flush()
  expect(tab('metadata').props.disabled).toBe(true)
  expect(button('lyricsEditor.saving').props.disabled).toBe(true)
  expect(api.openLrcEditor).toHaveBeenCalledTimes(opens)
  finish({ ...original, editToken: 'refreshed' })
  await flush()
  expect(tab('metadata').props.disabled).toBe(false)
  expect(api.openLrcEditor).toHaveBeenCalledTimes(opens + 1)
})

it('retains draft C after committed B snapshot failure and a later lyrics save', async () => {
  await mount()
  await edit('Lyrics draft')
  await switchTo('metadata')
  changeTitle('Committed B')
  api.updateTrackMetadata.mockResolvedValue({ ok: true })
  const original = await api.getTrackEditSnapshot()
  api.getTrackEditSnapshot.mockResolvedValueOnce(null)
  await saveMetadata()
  expect(textContent(body)).toContain('library.metadataEditor.errors.saveFailed')
  changeTitle('New draft C')
  await switchTo('lyrics')
  api.getTrackEditSnapshot.mockResolvedValue({
    ...original,
    title: 'Committed B',
    editToken: 'after-lyrics',
  })
  fire(button('lyricsEditor.save'), 'onClick')
  await flush()
  fire(button('lyricsEditor.tag'), 'onClick')
  await flush()
  await switchTo('metadata')
  expect(titleInput().value).toBe('New draft C')
  expect(textContent(body)).not.toContain('trackEditor.conflict')
  expect(textContent(tab('metadata'))).toContain('lyricsEditor.unsaved')
  await saveMetadata()
  expect(api.updateTrackMetadata).toHaveBeenCalledTimes(2)
  expect(api.updateTrackMetadata).toHaveBeenLastCalledWith({
    trackId: 7,
    editToken: 'after-lyrics',
    changes: { title: 'New draft C' },
  })
})

it('falls back to the application focus target when the library callback cannot restore', async () => {
  const callback = vi.fn(async () => false)
  await mount(undefined, 'metadata', callback)
  const fallback = new TestNode('main')
  vi.stubGlobal('document', { ...document, querySelector: () => fallback })
  const restore = vi.mocked(useOverlayFocusTrap).mock.calls.at(-1)![0].restoreFocus!
  await restore(null)
  expect(callback).toHaveBeenCalledOnce()
  expect(activeElement).toBe(fallback)
})

it('clears metadata dirty after a successful normalized unchanged save', async () => {
  await mount(undefined, 'metadata')
  changeTitle('First track ')
  await flush()
  expect(textContent(tab('metadata'))).toContain('lyricsEditor.unsaved')
  await saveMetadata()
  expect(api.updateTrackMetadata).not.toHaveBeenCalled()
  expect(textContent(tab('metadata'))).not.toContain('lyricsEditor.unsaved')
})

it('repeated metadata saves must retain the lyric conflict', async () => {
  await mount()
  await edit('My unsaved lyric draft')
  const snapshot = await api.getTrackEditSnapshot()
  api.updateTrackMetadata.mockImplementation(async (request) => {
    api.getTrackEditSnapshot.mockResolvedValue({
      ...snapshot,
      title: request.changes.title,
      editToken: 'fresh',
    })
    return { ok: true }
  })
  api.openLrcEditor.mockResolvedValue({
    ok: true,
    value: { ...lrc('external'), text: 'External lyrics' },
  })
  await switchTo('metadata')
  changeTitle('Title 1')
  await saveMetadata()
  await switchTo('lyrics')
  expect(button('lyricsEditor.save').props.disabled).toBe(true)
  await switchTo('metadata')
  changeTitle('Title 2')
  await saveMetadata()
  await switchTo('lyrics')
  expect(source().value).toBe('My unsaved lyric draft')
  expect(button('lyricsEditor.save').props.disabled).toBe(true)
})

it('closes a clean metadata page from the footer cancel button', async () => {
  const view = await mount(undefined, 'metadata')
  fire(button('library.metadataEditor.actions.cancel'), 'onClick')
  await flush()
  expect(view.onClose).toHaveBeenCalledOnce()
  expect(api.updateTrackMetadata).not.toHaveBeenCalled()
})

it('protects both drafts when cancelling from the metadata footer', async () => {
  const view = await mount()
  await edit('Unsaved lyric draft')
  await switchTo('metadata')
  changeTitle('Unsaved title')
  await flush()
  fire(button('library.metadataEditor.actions.cancel'), 'onClick')
  await flush()
  expect(view.onClose).not.toHaveBeenCalled()
  expect(textContent(body)).toContain('trackEditor.unsavedPages')
  expect(tab('metadata').props.disabled).toBe(true)
  fire(button('lyricsEditor.continue'), 'onClick')
  await flush()
  expect(titleInput().value).toBe('Unsaved title')
  await switchTo('lyrics')
  expect(source().value).toBe('Unsaved lyric draft')
  expect(api.saveLrcEditor).not.toHaveBeenCalled()
  expect(api.updateTrackMetadata).not.toHaveBeenCalled()
})

it('loads the requested artwork with no active playback and keeps it across tabs', async () => {
  playback.currentTrackId = null
  await mount(undefined, 'metadata', undefined, 'cold-start-cover')
  expect(find((node) => node.type === 'img')?.props.src).toBe('auralis-artwork://cold-start-cover')
  await switchTo('lyrics')
  expect(find((node) => node.type === 'img')?.props.src).toBe('auralis-artwork://cold-start-cover')
})

it('keeps the edited track artwork independent from playback and retries it on reopen', async () => {
  playback.currentTrackId = 8
  playback.currentTrack = { id: 8, title: 'Other track', artist: 'Other artist' }
  const view = await mount(undefined, 'metadata', undefined, 'edited-track-cover')
  const image = find((node) => node.type === 'img')!
  expect(image.props.src).toBe('auralis-artwork://edited-track-cover')
  fire(image, 'onError')
  await flush()
  expect(find((node) => node.type === 'img')).toBeUndefined()
  expect(find((node) => String(node.props.class).includes('i-lucide-music-2'))).toBeDefined()
  view.open.value = false
  await flush()
  view.open.value = true
  await flush()
  expect(find((node) => node.type === 'img')?.props.src).toBe(
    'auralis-artwork://edited-track-cover',
  )
})

it('uses the music placeholder when the edited track has no artwork', async () => {
  await mount(undefined, 'metadata', undefined, null)
  expect(find((node) => node.type === 'img')).toBeUndefined()
  expect(find((node) => String(node.props.class).includes('i-lucide-music-2'))).toBeDefined()
})
