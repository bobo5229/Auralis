import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { LrcEditorService } from './lrcEditorService'
import { readTtmlPlayback } from './ttmlPlayback'
import { MAX_LRC_EDITOR_CHARACTERS, type SaveLrcEditor } from '@shared/types/lyricsEditor'

let root: string
let audio: string
let sidecar: string
const original = '[ar:Artist]\n[00:01.00]Original\nUntimed\n'
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'auralis-lrc-editor-'))
  audio = join(root, 'song.flac')
  sidecar = join(root, 'song.lrc')
  await writeFile(audio, 'isolated mock audio')
  await writeFile(sidecar, original)
})
afterEach(async () => {
  if (
    resolve(dirname(root)) !== resolve(tmpdir()) ||
    !basename(root).startsWith('auralis-lrc-editor-')
  )
    throw new Error('Unsafe fixture cleanup')
  await rm(root, { recursive: true, force: true })
})
function fixture(
  options: { format?: 'lrc' | 'ttml'; cacheUpdated?: boolean; now?: () => number } = {},
) {
  const writeTag = vi.fn(async (_id: number, _text: string, check: () => Promise<void>) => {
    await check()
    return { warning: false }
  })
  const reconcile = vi.fn(async () => ({
    cacheUpdated: options.cacheUpdated ?? true,
    active: true,
  }))
  const service = new LrcEditorService({
    getFilePath: (id) => (id === 1 ? audio : null),
    getRoots: () => [root],
    readSource: async () => ({
      lyricsText: await readFile(sidecar, 'utf8'),
      lyricsFormat: options.format ?? 'lrc',
    }),
    writeTag,
    reconcile,
    now: options.now,
  })
  return { service, writeTag, reconcile }
}
async function request(
  service: LrcEditorService,
  target: 'file' | 'tag' = 'file',
): Promise<SaveLrcEditor> {
  const state = await service.open(10, 1)
  expect(state.text).toBe(original)
  return {
    sessionId: state.sessionId,
    expectedRevision: state.revision,
    text: '[00:02.00]Edited\nUntimed\n',
    target,
  }
}
describe('LRC text save sessions', () => {
  it('can export an unchanged timed LRC to TTML', async () => {
    const lyrics = '[00:01.00]Unchanged lyric\n'
    await writeFile(sidecar, lyrics)
    const { service } = fixture()
    const state = await service.open(10, 1)
    const saved = await service.save(10, {
      sessionId: state.sessionId,
      expectedRevision: state.revision,
      text: state.text,
      target: 'ttml',
    })
    expect(saved.savedFormat).toBe('ttml')
    expect(readTtmlPlayback(await readFile(join(root, 'song.ttml'), 'utf8')).lines[0].text).toBe(
      'Unchanged lyric',
    )
    expect(await readFile(sidecar, 'utf8')).toBe(lyrics)
  })
  it('converts a timed draft to same-name TTML, backs up an existing file and retains the LRC', async () => {
    const ttmlPath = join(root, 'song.ttml')
    await writeFile(ttmlPath, 'malformed old TTML')
    const { service, reconcile } = fixture()
    const edit = {
      ...(await request(service)),
      target: 'ttml' as const,
      text: '[00:02.00]First\n[00:04.00]Second\n',
    }
    const saved = await service.save(10, edit)
    const xml = await readFile(ttmlPath, 'utf8')
    expect(saved.savedFormat).toBe('ttml')
    expect(readTtmlPlayback(xml).lines.map((line) => [line.timeSeconds, line.text])).toEqual([
      [2, 'First'],
      [4, 'Second'],
    ])
    expect(await readFile(saved.backupPath!, 'utf8')).toBe('malformed old TTML')
    expect(await readFile(sidecar, 'utf8')).toBe(original)
    expect(reconcile).toHaveBeenCalledWith(1, audio, xml)
  })
  it('rejects incomplete and malformed LRC conversion without touching an existing TTML', async () => {
    const ttmlPath = join(root, 'song.ttml')
    await writeFile(ttmlPath, 'old TTML')
    const { service } = fixture()
    const edit = { ...(await request(service)), target: 'ttml' as const }
    await expect(service.save(10, edit)).rejects.toMatchObject({ code: 'untimed-lines' })
    await expect(service.save(10, { ...edit, text: '[00:90.00]Broken' })).rejects.toMatchObject({
      code: 'invalid-lrc',
    })
    expect(await readFile(ttmlPath, 'utf8')).toBe('old TTML')
  })
  it('rejects a TTML target created externally after the editor opened', async () => {
    const { service } = fixture()
    const edit = { ...(await request(service)), target: 'ttml' as const, text: '[00:02.00]Line' }
    const ttmlPath = join(root, 'song.ttml')
    await writeFile(ttmlPath, 'External TTML')
    await expect(service.save(10, edit)).rejects.toMatchObject({ code: 'file-changed' })
    expect(await readFile(ttmlPath, 'utf8')).toBe('External TTML')
  })
  it('backs up the exact sidecar, publishes the same-name LRC and leaves audio unchanged', async () => {
    const { service } = fixture()
    const edit = await request(service)
    const before = await readFile(audio)
    const saved = await service.save(10, edit)
    expect(await readFile(sidecar, 'utf8')).toBe(edit.text)
    expect(saved.backupPath).not.toBeNull()
    expect(await readFile(saved.backupPath!, 'utf8')).toBe(original)
    expect(await readFile(audio)).toEqual(before)
    await expect(service.save(10, edit)).rejects.toMatchObject({ code: 'session-expired' })
  })
  it('rejects another owner, stale revisions and external sidecar changes before writing', async () => {
    const { service, writeTag } = fixture()
    const edit = await request(service)
    await expect(service.save(11, edit)).rejects.toMatchObject({ code: 'session-expired' })
    await expect(
      service.save(10, { ...edit, expectedRevision: 'b'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'stale-revision' })
    await writeFile(sidecar, 'External changes')
    await expect(service.save(10, edit)).rejects.toMatchObject({ code: 'file-changed' })
    expect(await readFile(sidecar, 'utf8')).toBe('External changes')
    expect(writeTag).not.toHaveBeenCalled()
  })
  it('passes a fresh pre-commit guard to the existing tag writer and retains the LRC', async () => {
    const { service, writeTag } = fixture()
    const edit = await request(service, 'tag')
    writeTag.mockImplementationOnce(async (_id, _text, check) => {
      await writeFile(audio, 'An external audio replacement')
      await check()
      return { warning: false }
    })
    await expect(service.save(10, edit)).rejects.toMatchObject({ code: 'file-changed' })
    expect(await readFile(sidecar, 'utf8')).toBe(original)
  })
  it('returns a committed save even when cache refresh fails', async () => {
    const { service, reconcile } = fixture()
    const edit = await request(service)
    reconcile.mockRejectedValueOnce(new Error('Cache unavailable'))
    expect(await service.save(10, edit)).toMatchObject({ cacheUpdated: false, writeWarning: false })
    expect(await readFile(sidecar, 'utf8')).toBe(edit.text)
  })
  it('reports a completed tag write with a playback warning without allowing a retry', async () => {
    const { service, writeTag } = fixture()
    const edit = await request(service, 'tag')
    writeTag.mockResolvedValueOnce({ warning: true })
    expect(await service.save(10, edit)).toMatchObject({ writeWarning: true })
    await expect(service.save(10, edit)).rejects.toMatchObject({ code: 'session-expired' })
  })
  it('keeps TTML read-only and bounds raw drafts', async () => {
    const ttml = fixture({ format: 'ttml' }).service
    await expect(ttml.save(10, await request(ttml))).rejects.toMatchObject({
      code: 'unsupported-document',
    })
    const { service } = fixture()
    const edit = await request(service)
    await expect(
      service.save(10, { ...edit, text: 'x'.repeat(MAX_LRC_EDITOR_CHARACTERS + 1) }),
    ).rejects.toMatchObject({ code: 'invalid-request' })
  })
  it('expires idle sessions and invalidates pending opens when their window owner leaves', async () => {
    let now = 0
    const { service } = fixture({ now: () => now })
    const edit = await request(service)
    now = 31 * 60 * 1000
    await expect(service.save(10, edit)).rejects.toMatchObject({ code: 'session-expired' })
    const opened = service.open(10, 1)
    service.releaseOwner(10)
    await expect(opened).rejects.toMatchObject({ code: 'session-expired' })
  })
})
