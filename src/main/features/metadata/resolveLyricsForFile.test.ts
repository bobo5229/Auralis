import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { IAudioMetadata } from 'music-metadata'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getLyricsSidecarFingerprint,
  readLyricsSnapshot,
  resolveLyricsForFile,
} from './resolveLyricsForFile'

const ttml = await readFile(new URL('./__fixtures__/duet.ttml', import.meta.url), 'utf8')
const metadata = (lyrics?: string): IAudioMetadata =>
  ({ common: { lyrics }, native: {} }) as unknown as IAudioMetadata
let root: string
let audioPath: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'auralis-ttml-'))
  audioPath = join(root, 'song.flac')
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('TTML lyric sidecars', () => {
  it('preserves source whitespace for raw editing without changing playback defaults', async () => {
    const text = '\n[00:01.00]  Local lyric  \n\n'
    await writeFile(join(root, 'song.lrc'), text, 'utf8')
    expect((await resolveLyricsForFile(audioPath, metadata(), true))?.text).toBe(text)
    expect((await resolveLyricsForFile(audioPath, metadata()))?.text).toBe(text.trim())
    expect((await resolveLyricsForFile(audioPath, metadata(text), true))?.text).toBe(text)
  })
  it.each(['.ttml', '.TTML'])(
    'reads a same-name %s file ahead of local and embedded LRC',
    async (extension) => {
      await writeFile(join(root, `song${extension}`), ttml, 'utf8')
      await writeFile(join(root, 'song.lrc'), '[00:01]Local', 'utf8')
      expect(await resolveLyricsForFile(audioPath, metadata('[00:01]Embedded'))).toEqual({
        text: ttml,
        format: 'ttml',
      })
    },
  )

  it('keeps embedded TTML ahead of a local LRC', async () => {
    await writeFile(join(root, 'song.lrc'), '[00:01]Local', 'utf8')
    expect(await resolveLyricsForFile(audioPath, metadata(ttml))).toEqual({
      text: ttml,
      format: 'ttml',
    })
  })

  it('skips malformed/empty TTML and preserves the existing fallback order', async () => {
    await writeFile(join(root, 'song.ttml'), '<tt broken', 'utf8')
    await writeFile(join(root, 'song.lrc'), '[00:01]Local', 'utf8')
    expect(await resolveLyricsForFile(audioPath, metadata('[00:01]Embedded'))).toEqual({
      text: '[00:01]Embedded',
      format: 'lrc',
    })
    expect(await resolveLyricsForFile(audioPath, metadata('Plain'))).toEqual({
      text: '[00:01]Local',
      format: 'lrc',
    })
    await writeFile(join(root, 'song.ttml'), ' ', 'utf8')
    await rm(join(root, 'song.lrc'))
    expect(await resolveLyricsForFile(audioPath, metadata('Plain'))).toEqual({
      text: 'Plain',
      format: 'plain',
    })
    expect(await resolveLyricsForFile(audioPath, metadata())).toBeNull()
  })

  it('invalidates the sidecar fingerprint on addition, modification and deletion', async () => {
    const absent = await getLyricsSidecarFingerprint(audioPath)
    expect(JSON.parse(absent)).toEqual([null, null, null, null])
    await writeFile(join(root, 'song.ttml'), ttml, 'utf8')
    const added = await readLyricsSnapshot(audioPath, metadata())
    expect(added.lyrics).toEqual({ text: ttml, format: 'ttml' })
    expect(added.lyricsSidecarFingerprint).not.toBe(absent)
    await writeFile(join(root, 'song.ttml'), ttml.replace('你好', '您好') + '\n', 'utf8')
    expect(await getLyricsSidecarFingerprint(audioPath)).not.toBe(added.lyricsSidecarFingerprint)
    await rm(join(root, 'song.ttml'))
    const removed = await readLyricsSnapshot(audioPath, metadata('[00:01]Embedded'))
    expect(removed.lyricsSidecarFingerprint).toBe(absent)
    expect(removed.lyrics?.format).toBe('lrc')
  })
})
