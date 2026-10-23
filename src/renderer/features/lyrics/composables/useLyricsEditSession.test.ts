import { beforeEach, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import type {
  LrcEditorSaved,
  LrcEditorState,
  LyricsEditorResult,
  LyricsEditorState,
} from '@shared/types/lyricsEditor'
import { useLyricsEditSession } from './useLyricsEditSession'

const api = vi.hoisted(() => ({
  openLrcEditor: vi.fn(),
  closeLrcEditor: vi.fn(),
  saveLrcEditor: vi.fn(),
  openEditor: vi.fn(),
  closeEditor: vi.fn(),
  saveEditor: vi.fn(),
  assignEditorLines: vi.fn(),
  retimeEditorLines: vi.fn(),
  replaceEditorLineText: vi.fn(),
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
function draft(revision = 'r1', sessionId = 'duet'): LyricsEditorState {
  return {
    sessionId,
    trackId: 7,
    revision,
    dirty: revision !== 'r1',
    editable: true,
    issues: [],
    lines: [
      {
        id: 'a',
        text: 'First',
        assignment: 'unassigned',
        timeSeconds: 1,
        editable: true,
        timingEditable: true,
        textEditable: true,
      },
    ],
  }
}
function saved(overrides: Partial<LrcEditorSaved> = {}): LrcEditorSaved {
  return {
    trackId: 7,
    savedFormat: 'lrc',
    conversionWarnings: [],
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
  const view = reactive({ open: true, composing: false, inlineEditing: false, inlineDirty: false })
  const onLrcLoaded = vi.fn()
  const focusEditor = vi.fn()
  const onClose = vi.fn()
  const commitInlineText = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
  const editor = useLyricsEditSession({
    isOpen: () => view.open,
    t: (key) => key,
    composing: () => view.composing,
    inlineEditing: () => view.inlineEditing,
    inlineDirty: () => view.inlineDirty,
    onLrcLoaded,
    focusEditor,
    commitInlineText,
    onClose,
  })
  return { editor, view, onLrcLoaded, focusEditor, commitInlineText, onClose }
}
beforeEach(() => {
  vi.resetAllMocks()
  api.openLrcEditor.mockResolvedValue({ ok: true, value: raw() })
  api.openEditor.mockResolvedValue({ ok: true, value: draft() })
  api.closeLrcEditor.mockResolvedValue({ ok: true })
  api.closeEditor.mockResolvedValue({ ok: true })
  api.saveLrcEditor.mockResolvedValue({ ok: true, value: saved() })
  api.saveEditor.mockResolvedValue({ ok: true, value: { cacheUpdated: true } })
})

it('loads a normalized baseline, keeps destination eligibility and resets history only on reload', async () => {
  const { editor, view, onLrcLoaded, focusEditor } = fixture()
  await editor.open(7)
  expect(editor.text.value).toBe('[00:01.00]First\n[00:02.00]Second\n')
  expect(editor.dirty.value).toBe(false)
  expect(editor.canSaveTarget('tag')).toBe(false)
  expect(editor.canSaveTarget('file')).toBe(true)
  expect(editor.canSaveTarget('ttml')).toBe(true)
  expect(focusEditor.mock.calls).toEqual([['lrc', true], ['lrc']])
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

it('releases the TTML draft before its raw session and tolerates repeated dismissal', async () => {
  api.openLrcEditor.mockResolvedValue({ ok: true, value: raw('raw-ttml', 'ttml') })
  const closing = deferred<unknown>()
  api.closeEditor.mockReturnValueOnce(closing.promise)
  const { editor } = fixture()
  await editor.open(7)
  const released = editor.close()
  expect(editor.session.value).toBeNull()
  expect(editor.duetSession.value).toBeNull()
  expect(api.closeLrcEditor).not.toHaveBeenCalled()
  closing.resolve({ ok: true })
  await released
  await editor.close()
  expect(api.closeEditor).toHaveBeenCalledExactlyOnceWith('duet')
  expect(api.closeLrcEditor).toHaveBeenCalledExactlyOnceWith('raw-ttml')
})

it('closes a late TTML draft when the panel is dismissed during its open', async () => {
  api.openLrcEditor.mockResolvedValue({ ok: true, value: raw('raw-ttml', 'ttml') })
  const pending = deferred<LyricsEditorResult<LyricsEditorState>>()
  api.openEditor.mockReturnValueOnce(pending.promise)
  const { editor, focusEditor } = fixture()
  const opening = editor.open(7)
  await flush()
  await editor.close()
  pending.resolve({ ok: true, value: draft() })
  await opening
  expect(editor.duetSession.value).toBeNull()
  expect(api.closeEditor).toHaveBeenCalledWith('duet')
  expect(focusEditor).not.toHaveBeenCalled()
})

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
  {
    overrides: { conversionWarnings: ['negative-times-clamped'] },
    notice: 'lyricsEditor.saved lyricsEditor.clampedTimes',
    closes: false,
  },
  {
    overrides: { conversionWarnings: ['inferred-final-end'] },
    notice: 'lyricsEditor.saved lyricsEditor.inferredEnd',
    closes: false,
  },
  {
    overrides: {
      writeWarning: true,
      cacheUpdated: false,
      active: false,
      conversionWarnings: ['negative-times-clamped', 'inferred-final-end'],
    },
    notice: 'lyricsEditor.writeWarning lyricsEditor.clampedTimes lyricsEditor.inferredEnd',
    closes: false,
  },
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

it('opens the TTML draft after conversion without initializing another raw text history', async () => {
  const { editor, onLrcLoaded, focusEditor } = fixture()
  await editor.open(7)
  api.saveLrcEditor.mockResolvedValue({ ok: true, value: saved({ savedFormat: 'ttml' }) })
  api.openLrcEditor.mockResolvedValue({ ok: true, value: raw('converted', 'ttml') })
  await editor.saveLrc('ttml')
  expect(editor.ttmlMode.value).toBe(true)
  expect(editor.duetSession.value?.sessionId).toBe('duet')
  expect(editor.notice.value).toBe('lyricsEditor.ttmlSaved')
  expect(onLrcLoaded).toHaveBeenCalledOnce()
  expect(focusEditor).toHaveBeenLastCalledWith('ttml')
})

it('keeps rejected inline text and never sends its TTML save', async () => {
  api.openLrcEditor.mockResolvedValue({ ok: true, value: raw('raw-ttml', 'ttml') })
  const { editor, view, commitInlineText, focusEditor } = fixture()
  await editor.open(7)
  view.inlineEditing = view.inlineDirty = true
  editor.confirming.value = true
  commitInlineText.mockResolvedValue(false)
  await editor.saveTtml(true)
  expect(api.saveEditor).not.toHaveBeenCalled()
  expect(view.inlineDirty).toBe(true)
  expect(editor.confirming.value).toBe(false)
  expect(focusEditor).toHaveBeenLastCalledWith('ttml')
})

it('serializes inline text and TTML save using the returned revision and blocks competing mutations', async () => {
  api.openLrcEditor.mockResolvedValue({ ok: true, value: raw('raw-ttml', 'ttml') })
  const { editor, view, commitInlineText } = fixture()
  await editor.open(7)
  view.inlineEditing = view.inlineDirty = true
  const pending = deferred<LyricsEditorResult<LyricsEditorState>>()
  api.replaceEditorLineText.mockReturnValueOnce(pending.promise)
  commitInlineText.mockImplementation(async () => {
    const accepted = await editor.replaceDuetText('a', 'Updated')
    if (accepted) view.inlineEditing = view.inlineDirty = false
    return accepted
  })
  const saving = editor.saveTtml()
  expect(editor.busy.value).toBe(true)
  editor.assignDuetLines(['a'], 'performer-1')
  editor.retimeDuetLines(['a'], 'shift', 100)
  await editor.saveTtml()
  await editor.reload()
  expect(api.assignEditorLines).not.toHaveBeenCalled()
  expect(api.retimeEditorLines).not.toHaveBeenCalled()
  expect(api.saveEditor).not.toHaveBeenCalled()
  pending.resolve({ ok: true, value: draft('r2') })
  await saving
  expect(api.saveEditor).toHaveBeenCalledExactlyOnceWith({
    sessionId: 'duet',
    expectedRevision: 'r2',
  })
  expect(editor.duetSession.value?.dirty).toBe(false)
})

it('does not save when dismissed during inline text submission', async () => {
  api.openLrcEditor.mockResolvedValue({ ok: true, value: raw('raw-ttml', 'ttml') })
  const { editor, view, commitInlineText } = fixture()
  await editor.open(7)
  view.inlineEditing = view.inlineDirty = true
  const pending = deferred<boolean>()
  commitInlineText.mockReturnValueOnce(pending.promise)
  const saving = editor.saveTtml()
  view.open = false
  await editor.close()
  pending.resolve(true)
  await saving
  expect(api.saveEditor).not.toHaveBeenCalled()
})

it.each([true, false])('preserves TTML close policy when cacheUpdated=%s', async (cacheUpdated) => {
  api.openLrcEditor.mockResolvedValue({ ok: true, value: raw('raw-ttml', 'ttml') })
  api.openEditor.mockResolvedValueOnce({ ok: true, value: draft('r2') })
  api.saveEditor.mockResolvedValue({ ok: true, value: { cacheUpdated } })
  const { editor, onClose } = fixture()
  await editor.open(7)
  editor.confirming.value = true
  await editor.saveTtml(true)
  expect(onClose).toHaveBeenCalledTimes(cacheUpdated ? 1 : 0)
  expect(api.openEditor).toHaveBeenCalledTimes(cacheUpdated ? 1 : 2)
  expect(editor.notice.value).toBe(cacheUpdated ? '' : 'lyricsEditor.cachePending')
  expect(editor.confirming.value).toBe(false)
})

it('does not retry a committed TTML save after its reopen fails', async () => {
  api.openLrcEditor.mockResolvedValue({ ok: true, value: raw('raw-ttml', 'ttml') })
  api.openEditor
    .mockResolvedValueOnce({ ok: true, value: draft('r2') })
    .mockResolvedValueOnce({ ok: false, code: 'session-expired' })
  const { editor } = fixture()
  await editor.open(7)
  await editor.saveTtml()
  expect(editor.duetSession.value).toBeNull()
  expect(editor.notice.value).toBe('lyricsEditor.saved')
  expect(editor.error.value).toBe('lyricsEditor.errors.changed')
  await editor.saveTtml()
  expect(api.saveEditor).toHaveBeenCalledOnce()
})

it('preserves the TTML draft on save failure and reports unsupported documents as read-only', async () => {
  api.openLrcEditor.mockResolvedValue({ ok: true, value: raw('raw-ttml', 'ttml') })
  api.openEditor.mockResolvedValueOnce({ ok: true, value: draft('r2') })
  api.saveEditor.mockResolvedValue({ ok: false, code: 'file-changed' })
  const { editor } = fixture()
  await editor.open(7)
  await editor.saveTtml()
  expect(editor.duetSession.value?.revision).toBe('r2')
  expect(editor.dirty.value).toBe(true)
  expect(api.closeEditor).not.toHaveBeenCalled()
  api.openEditor.mockResolvedValueOnce({ ok: true, value: { ...draft(), editable: false } })
  await editor.reload()
  expect(editor.error.value).toBe('lyricsEditor.errors.readOnly')
  expect(editor.canSave.value).toBe(false)
})
