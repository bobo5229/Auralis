import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { LyricsEditorService } from './lyricsEditorService'
import { LyricsEditorError } from './lyricsEditorError'
import { convertLrcToTtml } from './lyricsConversion'
import { readDuetLyrics } from './duetLyrics'
import { captureLyricsFiles, publishLyricsFile } from './lyricsEditorFiles'

let root: string
let audio: string
let lrcPath: string
const originalLrc = '[length:00:10]\n[00:01.000]第一句\n[00:01.000]第二句\n'
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'auralis-editor-test-'))
  audio = join(root, 'song.flac')
  lrcPath = join(root, 'song.lrc')
  // Simulated audio bytes; metadata parsing is the only injected external dependency.
  await writeFile(audio, 'simulated-audio-do-not-decode')
  await writeFile(lrcPath, originalLrc)
})
afterEach(async () => {
  // Delete only the verified per-test directory this fixture created.
  if (
    resolve(dirname(root)) !== resolve(tmpdir()) ||
    !basename(root).startsWith('auralis-editor-test-')
  )
    throw new Error('Unsafe fixture cleanup')
  await rm(root, { recursive: true, force: true })
})
function fixture(options: { persist?: () => Promise<boolean>; now?: () => number } = {}) {
  const persist = vi.fn(options.persist ?? (async () => true))
  const service = new LyricsEditorService({
    getFilePath: (id) => (id === 1 ? audio : null),
    getRoots: () => [root],
    readSource: async () => ({ lyricsText: await readFile(lrcPath, 'utf8'), lyricsFormat: 'lrc' }),
    persist,
    now: options.now,
  })
  return { service, persist }
}
describe('phase-one lyrics editor', () => {
  it('saves text, chorus and time in one revision chain and retains an exact original backup', async () => {
    const original = convertLrcToTtml(originalLrc).text
    await writeFile(join(root, 'song.ttml'), original)
    const { service } = fixture()
    const opened = await service.open(10, 1)
    expect(opened.lines[0]).toMatchObject({ textEditable: true, editableText: '第一句' })
    const chorus = service.assign(10, {
      sessionId: opened.sessionId,
      expectedRevision: opened.revision,
      lineIds: ['line-0'],
      assignment: 'together',
    })
    const timed = service.retime(10, {
      sessionId: chorus.sessionId,
      expectedRevision: chorus.revision,
      lineIds: ['line-0'],
      mode: 'set-end',
      valueMs: 2500,
    })
    const edited = service.replaceText(10, {
      sessionId: timed.sessionId,
      expectedRevision: timed.revision,
      lineId: 'line-0',
      text: '新歌词 & <literal>',
    })
    expect(edited.lines[0]).toMatchObject({
      text: '新歌词 & <literal>',
      timeSeconds: 1,
      endTimeSeconds: 2.5,
      assignment: 'together',
    })
    expect(() =>
      service.replaceText(10, {
        sessionId: opened.sessionId,
        expectedRevision: opened.revision,
        lineId: 'line-0',
        text: 'Stale',
      }),
    ).toThrow('stale-revision')
    expect(() =>
      service.replaceText(11, {
        sessionId: edited.sessionId,
        expectedRevision: edited.revision,
        lineId: 'line-0',
        text: 'Wrong owner',
      }),
    ).toThrow('session-expired')
    const saved = await service.save(10, {
      sessionId: edited.sessionId,
      expectedRevision: edited.revision,
    })
    expect(await readFile(saved.backupPath!, 'utf8')).toBe(original)
    expect(await readFile(audio, 'utf8')).toBe('simulated-audio-do-not-decode')
    expect(await readFile(lrcPath, 'utf8')).toBe(originalLrc)
    const reopened = await service.open(10, 1)
    expect(reopened.dirty).toBe(false)
    expect(reopened.lines[0]).toMatchObject({
      text: '新歌词 & <literal>',
      editableText: '新歌词 & <literal>',
      assignment: 'together',
      endTimeSeconds: 2.5,
    })
  })

  it('rejects text edits to timed words and keeps a valid draft after invalid text', async () => {
    const raw =
      '<tt xmlns="http://www.w3.org/ns/ttml"><body><p begin="1s" end="3s"><span begin="1s" end="2s">Word</span></p><p begin="4s" end="5s">Plain</p></body></tt>'
    await writeFile(join(root, 'song.ttml'), raw)
    const { service } = fixture()
    const opened = await service.open(10, 1)
    expect(opened.lines[0]).toMatchObject({ editable: true, textEditable: false })
    expect(opened.lines[0].editableText).toBeUndefined()
    expect(() =>
      service.replaceText(10, {
        sessionId: opened.sessionId,
        expectedRevision: opened.revision,
        lineId: 'line-0',
        text: 'Flatten',
      }),
    ).toThrow('read-only-line')
    expect(() =>
      service.replaceText(10, {
        sessionId: opened.sessionId,
        expectedRevision: opened.revision,
        lineId: 'line-1',
        text: 'Bad\nline',
      }),
    ).toThrow('invalid-line-text')
    const unchanged = service.replaceText(10, {
      sessionId: opened.sessionId,
      expectedRevision: opened.revision,
      lineId: 'line-1',
      text: 'Plain',
    })
    expect(unchanged.revision).toBe(opened.revision)
    expect(unchanged.dirty).toBe(false)
  })
  it('shares revisions between performer and timing edits and saves their combined result', async () => {
    const { service } = fixture()
    const opened = await service.open(10, 1)
    expect(opened.lines.every((line) => line.timingEditable)).toBe(true)
    const assigned = service.assign(10, {
      sessionId: opened.sessionId,
      expectedRevision: opened.revision,
      lineIds: ['line-0'],
      assignment: 'performer-2',
    })
    expect(() =>
      service.retime(10, {
        sessionId: opened.sessionId,
        expectedRevision: opened.revision,
        lineIds: ['line-0'],
        mode: 'set',
        valueMs: 1250,
      }),
    ).toThrow('stale-revision')
    const timed = service.retime(10, {
      sessionId: assigned.sessionId,
      expectedRevision: assigned.revision,
      lineIds: ['line-0'],
      mode: 'set',
      valueMs: 1250,
    })
    expect(timed.lines[0]).toMatchObject({ timeSeconds: 1.25, assignment: 'performer-2' })
    expect(timed.lines[1].timeSeconds).toBe(1)
    const saved = await service.save(10, {
      sessionId: timed.sessionId,
      expectedRevision: timed.revision,
    })
    const snapshot = readDuetLyrics(await readFile(saved.savedPath!, 'utf8'))
    expect(snapshot.lines[0].timing.begin).toBe('00:00:01.250')
    expect(snapshot.lines[0].assignment).toBe('performer-2')
    expect(await readFile(lrcPath, 'utf8')).toBe(originalLrc)
    expect(await readFile(audio, 'utf8')).toBe('simulated-audio-do-not-decode')
  })

  it('rejects a whole timing batch without losing the preceding draft when any timestamp becomes negative', async () => {
    const { service } = fixture()
    const opened = await service.open(10, 1)
    const draft = service.retime(10, {
      sessionId: opened.sessionId,
      expectedRevision: opened.revision,
      lineIds: ['line-0'],
      mode: 'set',
      valueMs: 100,
    })
    expect(() =>
      service.retime(10, {
        sessionId: draft.sessionId,
        expectedRevision: draft.revision,
        lineIds: ['line-1', 'line-0'],
        mode: 'shift',
        valueMs: -200,
      }),
    ).toThrow('invalid-time')
    const unchanged = service.retime(10, {
      sessionId: draft.sessionId,
      expectedRevision: draft.revision,
      lineIds: ['line-1'],
      mode: 'shift',
      valueMs: 0,
    })
    expect(unchanged).toEqual(draft)
    expect(() =>
      service.retime(11, {
        sessionId: draft.sessionId,
        expectedRevision: draft.revision,
        lineIds: ['line-0'],
        mode: 'shift',
        valueMs: 100,
      }),
    ).toThrow('session-expired')
  })

  it('saves nameless person slots and independently assigns same-time lines without touching audio or LRC', async () => {
    const { service, persist } = fixture()
    const beforeAudio = await readFile(audio)
    const opened = await service.open(10, 1)
    expect(opened.dirty).toBe(false)
    expect(opened.lines.map((line) => line.timeSeconds)).toEqual([1, 1])
    const first = service.assign(10, {
      sessionId: opened.sessionId,
      expectedRevision: opened.revision,
      lineIds: ['line-0'],
      assignment: 'performer-1',
    })
    const second = service.assign(10, {
      sessionId: first.sessionId,
      expectedRevision: first.revision,
      lineIds: ['line-1'],
      assignment: 'performer-2',
    })
    expect(second.lines.map((line) => line.assignment)).toEqual(['performer-1', 'performer-2'])
    const saved = await service.save(10, {
      sessionId: second.sessionId,
      expectedRevision: second.revision,
    })
    expect(saved).toMatchObject({ trackId: 1, written: true, backupPath: null, cacheUpdated: true })
    const raw = await readFile(saved.savedPath!, 'utf8')
    expect(readDuetLyrics(raw).performers.map(({ type, name }) => ({ type, name }))).toEqual([
      { type: 'person', name: null },
      { type: 'person', name: null },
    ])
    expect(persist).toHaveBeenCalledWith(1, audio, raw)
    expect(await readFile(audio)).toEqual(beforeAudio)
    expect(await readFile(lrcPath, 'utf8')).toBe(originalLrc)
    expect(() =>
      service.assign(10, {
        sessionId: second.sessionId,
        expectedRevision: second.revision,
        lineIds: [],
        assignment: 'unassigned',
      }),
    ).toThrow(LyricsEditorError)
  })

  it('does not create a TTML for an unchanged draft or a cancelled session', async () => {
    const { service, persist } = fixture()
    const opened = await service.open(10, 1)
    const unchanged = service.assign(10, {
      sessionId: opened.sessionId,
      expectedRevision: opened.revision,
      lineIds: ['line-0'],
      assignment: 'unassigned',
    })
    expect(unchanged.dirty).toBe(false)
    expect(
      await service.save(10, {
        sessionId: unchanged.sessionId,
        expectedRevision: unchanged.revision,
      }),
    ).toMatchObject({ written: false })
    const again = await service.open(10, 1)
    service.close(10, again.sessionId)
    service.close(10, again.sessionId)
    expect(persist).not.toHaveBeenCalled()
    await expect(readFile(join(root, 'song.ttml'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps an exact backup before overwriting an existing TTML', async () => {
    const old = convertLrcToTtml(originalLrc).text
    const target = join(root, 'song.ttml')
    await writeFile(target, old)
    const { service } = fixture()
    const opened = await service.open(10, 1)
    const changed = service.assign(10, {
      sessionId: opened.sessionId,
      expectedRevision: opened.revision,
      lineIds: ['line-0'],
      assignment: 'performer-2',
    })
    const result = await service.save(10, {
      sessionId: changed.sessionId,
      expectedRevision: changed.revision,
    })
    expect(result.backupPath).toBeTruthy()
    expect(await readFile(result.backupPath!, 'utf8')).toBe(old)
    expect(readDuetLyrics(await readFile(target, 'utf8')).lines[0].assignment).toBe('performer-2')
  })

  it.each(['lrc', 'ttml', 'audio'] as const)(
    'refuses saving when the %s changed externally',
    async (which) => {
      const { service, persist } = fixture()
      const opened = await service.open(10, 1)
      const changed = service.assign(10, {
        sessionId: opened.sessionId,
        expectedRevision: opened.revision,
        lineIds: ['line-0'],
        assignment: 'performer-1',
      })
      const path = which === 'lrc' ? lrcPath : which === 'audio' ? audio : join(root, 'song.ttml')
      await writeFile(path, 'external-edit')
      await expect(
        service.save(10, { sessionId: changed.sessionId, expectedRevision: changed.revision }),
      ).rejects.toMatchObject({ code: 'file-changed' })
      expect(await readFile(path, 'utf8')).toBe('external-edit')
      expect(persist).not.toHaveBeenCalled()
    },
  )

  it('rejects wrong owners, stale revisions, missing lines and unsupported assignments atomically', async () => {
    const { service } = fixture()
    const opened = await service.open(10, 1)
    const request = {
      sessionId: opened.sessionId,
      expectedRevision: opened.revision,
      lineIds: ['line-0'],
      assignment: 'performer-1' as const,
    }
    expect(() => service.assign(11, request)).toThrow(
      expect.objectContaining({ code: 'session-expired' }),
    )
    expect(() => service.assign(10, { ...request, expectedRevision: 'a'.repeat(64) })).toThrow(
      expect.objectContaining({ code: 'stale-revision' }),
    )
    expect(() => service.assign(10, { ...request, lineIds: ['line-0', 'missing'] })).toThrow(
      expect.objectContaining({ code: 'unknown-line' }),
    )
    expect(() => service.assign(10, { ...request, assignment: 'performer-3' as never })).toThrow(
      expect.objectContaining({ code: 'invalid-request' }),
    )
    const changed = service.assign(10, request)
    expect(changed.lines[1].assignment).toBe('unassigned')
  })

  it('reports a committed file separately from a cache update failure', async () => {
    const { service } = fixture({
      persist: async () => {
        throw new Error('database unavailable')
      },
    })
    const opened = await service.open(10, 1)
    const changed = service.assign(10, {
      sessionId: opened.sessionId,
      expectedRevision: opened.revision,
      lineIds: ['line-0'],
      assignment: 'performer-1',
    })
    const saved = await service.save(10, {
      sessionId: changed.sessionId,
      expectedRevision: changed.revision,
    })
    expect(saved).toMatchObject({ written: true, cacheUpdated: false })
    expect(readDuetLyrics(await readFile(saved.savedPath!, 'utf8')).lines[0].assignment).toBe(
      'performer-1',
    )
  })

  it('expires idle drafts and releases a window-owned draft', async () => {
    let now = 0
    const { service } = fixture({ now: () => now })
    const opened = await service.open(10, 1)
    now = 31 * 60 * 1000
    await expect(
      service.save(10, { sessionId: opened.sessionId, expectedRevision: opened.revision }),
    ).rejects.toMatchObject({ code: 'session-expired' })
    const next = await service.open(10, 1)
    service.releaseOwner(10)
    await expect(
      service.save(10, { sessionId: next.sessionId, expectedRevision: next.revision }),
    ).rejects.toMatchObject({ code: 'session-expired' })
  })

  it('edits existing chorus rows and reuses the existing group identity', async () => {
    const text =
      '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent xml:id="v1" type="person"/><ttm:agent xml:id="v2" type="person"/><ttm:agent xml:id="both" type="group"/></metadata></head><body><p begin="1s" end="2s" ttm:agent="both">chorus</p><p begin="2s" end="3s" ttm:agent="v1">solo</p></body></tt>'
    await writeFile(join(root, 'song.ttml'), text)
    const { service } = fixture()
    const opened = await service.open(10, 1)
    expect(opened.lines[0]).toMatchObject({
      assignment: 'together',
      editable: true,
      timeSeconds: 1,
      endTimeSeconds: 2,
    })
    const together = service.assign(10, {
      sessionId: opened.sessionId,
      expectedRevision: opened.revision,
      lineIds: ['line-0', 'line-1'],
      assignment: 'together',
    })
    const changed = service.assign(10, {
      sessionId: together.sessionId,
      expectedRevision: together.revision,
      lineIds: ['line-1'],
      assignment: 'performer-2',
    })
    const saved = await service.save(10, {
      sessionId: changed.sessionId,
      expectedRevision: changed.revision,
    })
    expect(
      readDuetLyrics(await readFile(saved.savedPath!, 'utf8')).lines.map((line) => line.assignment),
    ).toEqual(['together', 'performer-2'])
    expect(readDuetLyrics(await readFile(saved.savedPath!, 'utf8')).roles.together).toBe('both')
  })

  it('creates a nameless chorus lazily and saves chorus and end-time edits in the same draft', async () => {
    const { service } = fixture()
    const opened = await service.open(10, 1)
    const chorus = service.assign(10, {
      sessionId: opened.sessionId,
      expectedRevision: opened.revision,
      lineIds: ['line-0'],
      assignment: 'together',
    })
    expect(chorus.lines[0]).toMatchObject({
      assignment: 'together',
      editable: true,
      timingEditable: true,
    })
    const timed = service.retime(10, {
      sessionId: chorus.sessionId,
      expectedRevision: chorus.revision,
      lineIds: ['line-0'],
      mode: 'set-end',
      valueMs: 2500,
    })
    expect(timed.lines[0]).toMatchObject({
      timeSeconds: 1,
      endTimeSeconds: 2.5,
      assignment: 'together',
    })
    expect(() =>
      service.retime(10, {
        sessionId: timed.sessionId,
        expectedRevision: timed.revision,
        lineIds: ['line-0'],
        mode: 'set-end',
        valueMs: 1000,
      }),
    ).toThrow('invalid-end-time')
    const saved = await service.save(10, {
      sessionId: timed.sessionId,
      expectedRevision: timed.revision,
    })
    const raw = await readFile(saved.savedPath!, 'utf8')
    const snapshot = readDuetLyrics(raw)
    expect(snapshot.performers.filter((performer) => performer.type === 'group')).toEqual([
      { id: snapshot.roles.together, type: 'group', name: null },
    ])
    expect(snapshot.lines[0].timing).toMatchObject({ begin: '00:00:01.000', end: '00:00:02.500' })
    expect(await readFile(lrcPath, 'utf8')).toBe(originalLrc)
    const reopened = await service.open(10, 1)
    expect(reopened.dirty).toBe(false)
    expect(reopened.lines[0]).toMatchObject({
      assignment: 'together',
      endTimeSeconds: 2.5,
      editable: true,
    })
  })

  it('keeps mixed word assignments read-only and rejects a chorus batch without creating metadata', async () => {
    const raw =
      '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent xml:id="v1" type="person"/><ttm:agent xml:id="v2" type="person"/></metadata></head><body><p begin="1s" end="2s"><span ttm:agent="v1">A</span><span ttm:agent="v2">B</span></p><p begin="2s" end="3s" ttm:agent="v1">Solo</p></body></tt>'
    await writeFile(join(root, 'song.ttml'), raw)
    const { service } = fixture()
    const opened = await service.open(10, 1)
    expect(opened.lines[0]).toMatchObject({ assignment: 'unsupported', editable: false })
    expect(() =>
      service.assign(10, {
        sessionId: opened.sessionId,
        expectedRevision: opened.revision,
        lineIds: ['line-1', 'line-0'],
        assignment: 'together',
      }),
    ).toThrow(expect.objectContaining({ code: 'read-only-line' }))
    const changed = service.assign(10, {
      sessionId: opened.sessionId,
      expectedRevision: opened.revision,
      lineIds: ['line-1'],
      assignment: 'performer-2',
    })
    const saved = await service.save(10, {
      sessionId: changed.sessionId,
      expectedRevision: changed.revision,
    })
    const snapshot = readDuetLyrics(await readFile(saved.savedPath!, 'utf8'))
    expect(snapshot.lines.map((line) => line.assignment)).toEqual(['mixed', 'performer-2'])
    expect(snapshot.roles.together).toBeNull()
  })

  it('rejects paths outside configured roots and invalidates an in-flight open on navigation', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const dependencies = {
      getFilePath: () => audio,
      getRoots: () => [join(root, 'not-a-library-root')],
      readSource: async () => ({ lyricsText: originalLrc, lyricsFormat: 'lrc' as const }),
      persist: async () => true,
    }
    await expect(new LyricsEditorService(dependencies).open(10, 1)).rejects.toMatchObject({
      code: 'outside-library',
    })
    const service = new LyricsEditorService({
      ...dependencies,
      getRoots: () => [root],
      readSource: async () => {
        await pending
        return { lyricsText: originalLrc, lyricsFormat: 'lrc' }
      },
    })
    const opening = service.open(10, 1)
    service.releaseOwner(10)
    release()
    await expect(opening).rejects.toMatchObject({ code: 'session-expired' })
  })

  it('preserves both the external target and recovery backup when publication loses a race', async () => {
    const target = join(root, 'song.ttml')
    await writeFile(target, 'original')
    const captured = (await captureLyricsFiles(audio)).find((file) => /\.ttml$/i.test(file.path))!
    let recovery: string | undefined
    try {
      await publishLyricsFile(captured, 'new', async (moved) => {
        if (moved) await writeFile(target, 'external-created-after-move', { flag: 'wx' })
      })
      expect.fail('Expected a publication conflict')
    } catch (error) {
      expect(error).toMatchObject({ code: 'recovery-required' })
      recovery = (error as LyricsEditorError).recoveryBackupPath
    }
    expect(await readFile(target, 'utf8')).toBe('external-created-after-move')
    expect(await readFile(recovery!, 'utf8')).toBe('original')
  })
})
