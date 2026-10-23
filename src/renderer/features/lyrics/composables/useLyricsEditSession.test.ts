import { beforeEach, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import type { LrcEditorSaved, LrcEditorState, LyricsEditorResult } from '@shared/types/lyricsEditor'
import { useLyricsEditSession } from './useLyricsEditSession'

const api = vi.hoisted(() => ({
  openLrcEditor: vi.fn(),
  closeLrcEditor: vi.fn(),
  saveLrcEditor: vi.fn(),
}))
vi.mock('@renderer/shared/ipc/client', () => ({ auralis: { lyrics: api } }))

function raw(sessionId = 'raw', format: LrcEditorState['format'] = 'lrc'): LrcEditorState {
  return {
    sessionId,
    trackId: 7,
    revision: sessionId,
    text: '[00:01.00]First\r\n[00:02.00]Second\r',
    format,
    canSaveTag: true,
  }
}
function saved(overrides: Partial<LrcEditorSaved> = {}): LrcEditorSaved {
  return {
    trackId: 7,
    backupPath: null,
    cacheUpdated: true,
    active: true,
    writeWarning: false,
    ...overrides,
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
async function flush() {
  for (let i = 0; i < 12; i++) await nextTick()
}
function fixture() {
  const view = reactive({ open: true, composing: false })
  const onLrcLoaded = vi.fn()
  const focusEditor = vi.fn()
  const onClose = vi.fn()
  const editor = useLyricsEditSession({
    isOpen: () => view.open,
    t: (key) => key,
    composing: () => view.composing,
    onLrcLoaded,
    focusEditor,
    onClose,
  })
  return { editor, view, onLrcLoaded, focusEditor, onClose }
}
beforeEach(() => {
  vi.resetAllMocks()
  api.openLrcEditor.mockResolvedValue({ ok: true, value: raw() })
  api.closeLrcEditor.mockResolvedValue({ ok: true })
  api.saveLrcEditor.mockResolvedValue({ ok: true, value: saved() })
})

it('loads a normalized baseline, keeps destination eligibility and resets history only on reload', async () => {
  const { editor, view, onLrcLoaded, focusEditor } = fixture()
  await editor.open(7)
  expect(editor.text.value).toBe('[00:01.00]First\n[00:02.00]Second\n')
  expect(editor.dirty.value).toBe(false)
  expect(editor.canSaveTarget('tag')).toBe(false)
  expect(editor.canSaveTarget('file')).toBe(true)
  expect(focusEditor.mock.calls).toEqual([[true], []])
  editor.text.value = 'Changed'
  expect(editor.canSaveTarget('tag')).toBe(true)
  view.composing = true
  expect(editor.canSave.value).toBe(false)
  view.composing = false
  await editor.saveLrc('file')
  expect(editor.text.value).toBe('Changed')
  expect(editor.baseline.value).toBe('Changed')
  expect(onLrcLoaded).toHaveBeenCalledOnce()
  await editor.reload()
  expect(onLrcLoaded).toHaveBeenCalledTimes(2)
  expect(editor.dirty.value).toBe(false)
})

it('reports an unavailable track without opening a session', async () => {
  const { editor } = fixture()
  await editor.open(null)
  expect(api.openLrcEditor).not.toHaveBeenCalled()
  expect(editor.error.value).toBe('lyricsEditor.errors.unavailable')
  expect(editor.canSave.value).toBe(false)
})

it('closes superseded raw opens and never replaces the newer baseline', async () => {
  const pending = deferred<LyricsEditorResult<LrcEditorState>>()
  api.openLrcEditor
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ ok: true, value: raw('new') })
  const { editor } = fixture()
  const opening = editor.open(7)
  await flush()
  await editor.reload()
  pending.resolve({ ok: true, value: raw('late') })
  await opening
  expect(editor.session.value?.sessionId).toBe('new')
  expect(api.closeLrcEditor).toHaveBeenCalledWith('late')
  expect(editor.loading.value).toBe(false)
})

it.each(['error-result', 'exception'] as const)(
  'ignores a stale open %s after close and reopen',
  async (kind) => {
    const pending = deferred<LyricsEditorResult<LrcEditorState>>()
    api.openLrcEditor.mockReturnValueOnce(pending.promise)
    const { editor } = fixture()
    const opening = editor.open(7)
    await flush()
    await editor.close()
    await editor.open(7)
    if (kind === 'exception') pending.reject(new Error('late'))
    else pending.resolve({ ok: false, code: 'track-unavailable' })
    await opening
    expect(editor.error.value).toBe('')
    expect(editor.session.value?.sessionId).toBe('raw')
  },
)

it('saves with the fresh revision after reopening and retains the fixed track', async () => {
  const { editor } = fixture()
  await editor.open(7)
  api.openLrcEditor.mockResolvedValue({ ok: true, value: raw('fresh') })
  editor.text.value = 'Committed'
  await editor.saveLrc('tag')
  editor.text.value = 'Next'
  await editor.saveLrc('file')
  expect(api.saveLrcEditor.mock.calls.map(([request]) => request)).toEqual([
    { sessionId: 'raw', expectedRevision: 'raw', text: 'Committed', target: 'tag' },
    { sessionId: 'fresh', expectedRevision: 'fresh', text: 'Next', target: 'file' },
  ])
  expect(api.openLrcEditor.mock.calls).toEqual([[7], [7], [7]])
})

it.each(['error-result', 'exception'] as const)(
  'never resubmits a committed LRC after reopen %s',
  async (kind) => {
    const { editor } = fixture()
    await editor.open(7)
    if (kind === 'exception') api.openLrcEditor.mockRejectedValue(new Error('reopen'))
    else api.openLrcEditor.mockResolvedValue({ ok: false, code: 'session-expired' })
    editor.text.value = 'Committed'
    await editor.saveLrc('file')
    expect(editor.baseline.value).toBe('Committed')
    expect(editor.dirty.value).toBe(false)
    expect(editor.session.value).toBeNull()
    expect(editor.notice.value).toBe('lyricsEditor.saved')
    expect(editor.error.value).not.toBe('')
    await editor.saveLrc('file')
    expect(api.saveLrcEditor).toHaveBeenCalledOnce()
  },
)

it.each([
  { overrides: {}, notice: '', closes: true },
  { overrides: { writeWarning: true }, notice: 'lyricsEditor.writeWarning', closes: false },
  { overrides: { cacheUpdated: false }, notice: 'lyricsEditor.cachePending', closes: false },
  { overrides: { active: false }, notice: 'lyricsEditor.otherSource', closes: false },
])('preserves save-and-close warning policy: $notice', async ({ overrides, notice, closes }) => {
  const { editor, onClose } = fixture()
  await editor.open(7)
  editor.text.value = 'Saved'
  editor.confirming.value = true
  api.saveLrcEditor.mockResolvedValue({ ok: true, value: saved(overrides) })
  await editor.saveLrc('file', true)
  expect(onClose).toHaveBeenCalledTimes(closes ? 1 : 0)
  expect(editor.notice.value).toBe(notice)
  expect(api.openLrcEditor).toHaveBeenCalledTimes(closes ? 1 : 2)
  expect(editor.confirming.value).toBe(false)
})

it('blocks duplicate writes and reload while saving and retains failed drafts with recovery feedback', async () => {
  const pending = deferred<LyricsEditorResult<LrcEditorSaved>>()
  api.saveLrcEditor.mockReturnValueOnce(pending.promise)
  const { editor } = fixture()
  await editor.open(7)
  editor.text.value = 'Unsaved'
  editor.confirming.value = true
  const saving = editor.saveLrc('file')
  expect(editor.busy.value).toBe(true)
  expect(editor.editable.value).toBe(false)
  await editor.saveLrc('file')
  await editor.reload()
  expect(api.saveLrcEditor).toHaveBeenCalledOnce()
  expect(api.openLrcEditor).toHaveBeenCalledOnce()
  pending.resolve({ ok: false, code: 'file-changed', recoveryBackupPath: 'backup.lrc' })
  await saving
  expect(editor.error.value).toBe('lyricsEditor.errors.changed backup.lrc')
  expect(editor.session.value?.revision).toBe('raw')
  expect(editor.text.value).toBe('Unsaved')
  expect(editor.dirty.value).toBe(true)
  expect(editor.confirming.value).toBe(false)
  expect(editor.busy.value).toBe(false)
})

it('ignores a late save result after close and reopen without changing the new baseline', async () => {
  const pending = deferred<LyricsEditorResult<LrcEditorSaved>>()
  api.saveLrcEditor.mockReturnValueOnce(pending.promise)
  const { editor, onClose } = fixture()
  await editor.open(7)
  editor.text.value = 'Old'
  const saving = editor.saveLrc('file', true)
  await editor.close()
  api.openLrcEditor.mockResolvedValue({ ok: true, value: raw('new') })
  await editor.open(8)
  const baseline = editor.baseline.value
  pending.resolve({ ok: true, value: saved() })
  await saving
  expect(editor.session.value?.sessionId).toBe('new')
  expect(editor.baseline.value).toBe(baseline)
  expect(onClose).not.toHaveBeenCalled()
  expect(editor.notice.value).toBe('')
})

it('releases a late saved-baseline reopen instead of installing it after dismissal', async () => {
  const { editor } = fixture()
  await editor.open(7)
  const pending = deferred<LyricsEditorResult<LrcEditorState>>()
  api.openLrcEditor.mockReturnValueOnce(pending.promise)
  const saving = editor.saveLrc('file')
  await flush()
  await editor.close()
  pending.resolve({ ok: true, value: raw('late-reopen') })
  await saving
  expect(editor.session.value).toBeNull()
  expect(api.closeLrcEditor).toHaveBeenCalledWith('late-reopen')
  expect(api.saveLrcEditor).toHaveBeenCalledOnce()
})
