import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { LrcEditorService } from './lrcEditorService'
import { captureLyricsFiles, publishLyricsFile } from './lyricsEditorFiles'
import { LyricsEditorError } from './lyricsEditorError'
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
  options: {
    format?: 'lrc' | 'ttml'
    hasEmbeddedTtml?: boolean
    cacheUpdated?: boolean
    now?: () => number
    roots?: string[]
  } = {},
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
    getRoots: () => options.roots ?? [root],
    readSource: async () => ({
      lyricsText: await readFile(sidecar, 'utf8'),
      lyricsFormat: options.format ?? 'lrc',
      hasEmbeddedTtml: options.hasEmbeddedTtml,
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
  it('rejects a removed TTML destination without changing files or consuming the LRC draft', async () => {
    const ttmlPath = join(root, 'song.ttml')
    await writeFile(ttmlPath, 'Existing TTML')
    const { service, writeTag, reconcile } = fixture()
    const edit = await request(service)
    await expect(
      service.save(10, { ...edit, target: 'ttml' } as unknown as SaveLrcEditor),
    ).rejects.toMatchObject({ code: 'invalid-request' })
    expect(await readFile(ttmlPath, 'utf8')).toBe('Existing TTML')
    expect(await readFile(sidecar, 'utf8')).toBe(original)
    expect(writeTag).not.toHaveBeenCalled()
    expect(reconcile).not.toHaveBeenCalled()
    await service.save(10, edit)
    expect(await readFile(sidecar, 'utf8')).toBe(edit.text)
    expect(await readFile(ttmlPath, 'utf8')).toBe('Existing TTML')
  })
  it('ignores externally changed TTML sidecars when saving LRC', async () => {
    const { service } = fixture()
    const edit = await request(service)
    const ttmlPath = join(root, 'song.ttml')
    await writeFile(ttmlPath, 'External TTML')
    await expect(service.save(10, edit)).resolves.toMatchObject({ trackId: 1 })
    expect(await readFile(ttmlPath, 'utf8')).toBe('External TTML')
    expect(await readFile(sidecar, 'utf8')).toBe(edit.text)
  })
  it('protects embedded TTML from tag saves while allowing LRC sidecar saves', async () => {
    const { service, writeTag } = fixture({ hasEmbeddedTtml: true })
    const state = await service.open(10, 1)
    expect(state).toMatchObject({ canSaveTag: false, tagWriteProtected: true })
    const edit = {
      sessionId: state.sessionId,
      expectedRevision: state.revision,
      text: '[00:02]New',
      target: 'tag' as const,
    }
    await expect(service.save(10, edit)).rejects.toMatchObject({ code: 'unsupported-format' })
    expect(writeTag).not.toHaveBeenCalled()
    await expect(service.save(10, { ...edit, target: 'file' })).resolves.toMatchObject({
      trackId: 1,
    })
    expect(await readFile(sidecar, 'utf8')).toBe(edit.text)
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
  it('rejects TTML sessions and bounds raw drafts', async () => {
    const ttml = fixture({ format: 'ttml' }).service
    await expect(ttml.open(10, 1)).rejects.toMatchObject({
      code: 'unsupported-format',
    })
    const { service } = fixture()
    const edit = await request(service)
    await expect(
      service.save(10, { ...edit, text: 'x'.repeat(MAX_LRC_EDITOR_CHARACTERS + 1) }),
    ).rejects.toMatchObject({ code: 'invalid-request' })
  })
  it('rejects tracks outside configured library roots before opening a draft', async () => {
    const { service, writeTag, reconcile } = fixture({ roots: [join(root, 'not-a-library-root')] })
    await expect(service.open(10, 1)).rejects.toMatchObject({ code: 'outside-library' })
    expect(await readFile(sidecar, 'utf8')).toBe(original)
    expect(writeTag).not.toHaveBeenCalled()
    expect(reconcile).not.toHaveBeenCalled()
  })
  it('preserves both the external LRC and recovery backup when publication loses a race', async () => {
    const captured = (await captureLyricsFiles(audio)).find((file) => file.path === sidecar)!
    let recovery: string | undefined
    try {
      await publishLyricsFile(captured, 'new', async (moved) => {
        if (moved) await writeFile(sidecar, 'external-created-after-move', { flag: 'wx' })
      })
      expect.fail('Expected a publication conflict')
    } catch (error) {
      expect(error).toMatchObject({ code: 'recovery-required' })
      recovery = (error as LyricsEditorError).recoveryBackupPath
    }
    expect(await readFile(sidecar, 'utf8')).toBe('external-created-after-move')
    expect(await readFile(recovery!, 'utf8')).toBe(original)
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
