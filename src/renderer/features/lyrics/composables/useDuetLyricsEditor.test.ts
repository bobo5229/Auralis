import { beforeEach, expect, it, vi } from 'vitest'
import type { LyricsEditorState, LyricsEditorResult } from '@shared/types/lyricsEditor'
import { useDuetLyricsEditor } from './useDuetLyricsEditor'

const api = vi.hoisted(() => ({
  openEditor: vi.fn(),
  closeEditor: vi.fn(),
  assignEditorLines: vi.fn(),
  retimeEditorLines: vi.fn(),
  replaceEditorLineText: vi.fn(),
}))
vi.mock('@renderer/shared/ipc/client', () => ({ auralis: { lyrics: api } }))

function state(revision = 'r1'): LyricsEditorState {
  return {
    sessionId: 'session',
    trackId: 7,
    revision,
    dirty: revision !== 'r1',
    editable: true,
    issues: [],
    lines: [
      {
        id: 'a',
        text: 'First',
        timeSeconds: 1,
        assignment: 'unassigned',
        editable: true,
        timingEditable: true,
        textEditable: true,
      },
      {
        id: 'b',
        text: 'Second',
        timeSeconds: 2,
        assignment: 'unassigned',
        editable: true,
        timingEditable: true,
      },
      { id: 'c', text: 'Chorus', timeSeconds: 3, assignment: 'unsupported', editable: false },
    ],
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.resetAllMocks()
  api.closeEditor.mockResolvedValue({ ok: true, value: undefined })
  api.openEditor.mockResolvedValue({ ok: true, value: state() })
})

it('uses the returned revision for subsequent assignments and retains the same track', async () => {
  api.assignEditorLines
    .mockResolvedValueOnce({ ok: true, value: state('r2') })
    .mockResolvedValueOnce({ ok: true, value: state('r3') })
  const failure = vi.fn()
  const editor = useDuetLyricsEditor(failure)
  await editor.open(7)
  await editor.assign(['a'], 'performer-1')
  await editor.assign(['b'], 'performer-2')
  expect(api.assignEditorLines.mock.calls.map(([request]) => request)).toEqual([
    { sessionId: 'session', expectedRevision: 'r1', lineIds: ['a'], assignment: 'performer-1' },
    { sessionId: 'session', expectedRevision: 'r2', lineIds: ['b'], assignment: 'performer-2' },
  ])
  expect(editor.session.value).toMatchObject({ trackId: 7, revision: 'r3', dirty: true })
  expect(failure).not.toHaveBeenCalled()
})

it('chains text with other mutations, serializes requests and preserves a rejected text draft', async () => {
  const failure = vi.fn()
  const editor = useDuetLyricsEditor(failure)
  await editor.open(7)
  api.replaceEditorLineText.mockResolvedValueOnce({ ok: true, value: state('r2') })
  api.assignEditorLines.mockResolvedValueOnce({ ok: true, value: state('r3') })
  expect(await editor.replaceText('b', 'Unsupported words')).toBe(false)
  expect(api.replaceEditorLineText).not.toHaveBeenCalled()
  expect(await editor.replaceText('a', 'New')).toBe(true)
  await editor.assign(['a'], 'together')
  expect(api.assignEditorLines).toHaveBeenLastCalledWith({
    sessionId: 'session',
    expectedRevision: 'r2',
    lineIds: ['a'],
    assignment: 'together',
  })
  const pending = deferred<LyricsEditorResult<LyricsEditorState>>()
  api.replaceEditorLineText.mockReturnValue(pending.promise)
  const replacing = editor.replaceText('a', 'Retry')
  await editor.retime(['a'], 'set', 2500)
  expect(api.retimeEditorLines).not.toHaveBeenCalled()
  pending.resolve({ ok: false, code: 'stale-revision' })
  expect(await replacing).toBe(false)
  expect(editor.session.value?.revision).toBe('r3')
  expect(failure).toHaveBeenCalledWith('stale-revision', undefined)
})

it('does not restore a text response after release', async () => {
  const pending = deferred<LyricsEditorResult<LyricsEditorState>>()
  api.replaceEditorLineText.mockReturnValue(pending.promise)
  const editor = useDuetLyricsEditor(vi.fn())
  await editor.open(7)
  const replacing = editor.replaceText('a', 'Late')
  await editor.release()
  pending.resolve({ ok: true, value: state('r2') })
  expect(await replacing).toBe(false)
  expect(editor.session.value).toBeNull()
})

it('chains timing and performer revisions, blocks concurrent mutations and retains failed timing drafts', async () => {
  const failure = vi.fn()
  const editor = useDuetLyricsEditor(failure)
  await editor.open(7)
  api.retimeEditorLines.mockResolvedValueOnce({ ok: true, value: state('r2') })
  api.assignEditorLines.mockResolvedValueOnce({ ok: true, value: state('r3') })
  await editor.retime(['a'], 'set', 1250)
  await editor.assign(['b'], 'performer-1')
  expect(api.retimeEditorLines).toHaveBeenLastCalledWith({
    sessionId: 'session',
    expectedRevision: 'r1',
    lineIds: ['a'],
    mode: 'set',
    valueMs: 1250,
  })
  expect(api.assignEditorLines).toHaveBeenLastCalledWith({
    sessionId: 'session',
    expectedRevision: 'r2',
    lineIds: ['b'],
    assignment: 'performer-1',
  })
  const pending = deferred<LyricsEditorResult<LyricsEditorState>>()
  api.retimeEditorLines.mockReturnValue(pending.promise)
  const retiming = editor.retime(['a', 'b'], 'shift', -100)
  await editor.assign(['a'], 'unassigned')
  await editor.retime(['a'], 'shift', 100)
  expect(api.retimeEditorLines).toHaveBeenCalledTimes(2)
  expect(api.assignEditorLines).toHaveBeenCalledTimes(1)
  pending.resolve({ ok: false, code: 'invalid-time' })
  await retiming
  expect(editor.session.value?.revision).toBe('r3')
  expect(failure).toHaveBeenCalledWith('invalid-time', undefined)
  expect(editor.assigning.value).toBe(false)
})

it('ignores late timing responses after dismissal', async () => {
  const pending = deferred<LyricsEditorResult<LyricsEditorState>>()
  api.retimeEditorLines.mockReturnValue(pending.promise)
  const editor = useDuetLyricsEditor(vi.fn())
  await editor.open(7)
  const retiming = editor.retime(['a'], 'shift', 100)
  await editor.release()
  pending.resolve({ ok: true, value: state('r2') })
  await retiming
  expect(editor.session.value).toBeNull()
})

it('shares chorus and end-time revisions while rejecting batch end changes', async () => {
  const failure = vi.fn()
  const editor = useDuetLyricsEditor(failure)
  await editor.open(7)
  const chorus = state('r2')
  chorus.lines[0].assignment = 'together'
  api.assignEditorLines.mockResolvedValue({ ok: true, value: chorus })
  await editor.assign(['a'], 'together')
  const timed = state('r3')
  timed.lines[0] = { ...timed.lines[0], assignment: 'together', endTimeSeconds: 2.5 }
  api.retimeEditorLines.mockResolvedValue({ ok: true, value: timed })
  await editor.retime(['a', 'b'], 'set-end', 2500)
  expect(api.retimeEditorLines).not.toHaveBeenCalled()
  await editor.retime(['a'], 'set-end', 2500)
  expect(api.retimeEditorLines).toHaveBeenCalledWith({
    sessionId: 'session',
    expectedRevision: 'r2',
    lineIds: ['a'],
    mode: 'set-end',
    valueMs: 2500,
  })
  expect(editor.session.value?.lines[0]).toMatchObject({
    assignment: 'together',
    endTimeSeconds: 2.5,
  })
  expect(failure).not.toHaveBeenCalled()
})

it('blocks read-only rows and concurrent edits, and retains a failed draft', async () => {
  const pending = deferred<LyricsEditorResult<LyricsEditorState>>()
  api.assignEditorLines.mockReturnValue(pending.promise)
  const failure = vi.fn()
  const editor = useDuetLyricsEditor(failure)
  await editor.open(7)
  await editor.assign(['c'], 'unassigned')
  expect(api.assignEditorLines).not.toHaveBeenCalled()
  const assigning = editor.assign(['a'], 'performer-1')
  await editor.assign(['b'], 'performer-2')
  expect(api.assignEditorLines).toHaveBeenCalledTimes(1)
  pending.resolve({ ok: false, code: 'stale-revision' })
  await assigning
  expect(failure).toHaveBeenCalledWith('stale-revision', undefined)
  expect(editor.session.value).toEqual(state())
  expect(editor.assigning.value).toBe(false)
})

it('closes late opens after dismissal and does not restore the draft', async () => {
  const pending = deferred<LyricsEditorResult<LyricsEditorState>>()
  api.openEditor.mockReturnValue(pending.promise)
  const editor = useDuetLyricsEditor(vi.fn())
  const opening = editor.open(7)
  await Promise.resolve()
  await editor.release()
  pending.resolve({ ok: true, value: state() })
  await opening
  expect(editor.session.value).toBeNull()
  expect(api.closeEditor).toHaveBeenCalledWith('session')
})

it('splits large selections within IPC bounds and uses each successful batch revision', async () => {
  const opened = state()
  opened.lines = Array.from({ length: 10001 }, (_, index) => ({
    id: `line-${index}`,
    text: 'Text',
    timeSeconds: index,
    assignment: 'unassigned',
    editable: true,
  }))
  api.openEditor.mockResolvedValue({ ok: true, value: opened })
  api.assignEditorLines.mockImplementation(async (request) => ({
    ok: true,
    value: { ...opened, revision: request.expectedRevision === 'r1' ? 'r2' : 'r3', dirty: true },
  }))
  const editor = useDuetLyricsEditor(vi.fn())
  await editor.open(7)
  await editor.assign(
    opened.lines.map((line) => line.id),
    'performer-2',
  )
  expect(
    api.assignEditorLines.mock.calls.map(([request]) => ({
      revision: request.expectedRevision,
      count: request.lineIds.length,
    })),
  ).toEqual([
    { revision: 'r1', count: 10000 },
    { revision: 'r2', count: 1 },
  ])
  expect(editor.session.value?.revision).toBe('r3')
})
