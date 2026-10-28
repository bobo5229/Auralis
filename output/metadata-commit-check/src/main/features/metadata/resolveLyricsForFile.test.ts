import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { IAudioMetadata } from 'music-metadata'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getLyricsSidecarFingerprint,
  readLyricsSnapshot,
  resolveLyricsForFile,
  sameLyricsSidecarFingerprint,
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
  it.each(['.ttml', '.TTML'])('ignores the %s sidecar', async (extension) => {
    await writeFile(join(root, `song${extension}`), ttml, 'utf8')
    await writeFile(join(root, 'song.lrc'), '[00:01]Local', 'utf8')
    expect(await resolveLyricsForFile(audioPath, metadata('[00:01]Embedded'))).toEqual({
      text: '[00:01]Embedded',
      format: 'lrc',
    })
    expect(await resolveLyricsForFile(audioPath, metadata(ttml))).toEqual({
      text: '[00:01]Local',
      format: 'lrc',
    })
    expect(await readFile(join(root, `song${extension}`), 'utf8')).toBe(ttml)
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

  it('ignores TTML changes and compares legacy fingerprints by LRC slots', async () => {
    const absent = await getLyricsSidecarFingerprint(audioPath)
    expect(JSON.parse(absent)).toEqual([null, null])
    await writeFile(join(root, 'song.ttml'), ttml, 'utf8')
    expect(await getLyricsSidecarFingerprint(audioPath)).toBe(absent)
    expect(sameLyricsSidecarFingerprint('[null,null,[10,20],null]', absent)).toBe(true)
    await writeFile(join(root, 'song.lrc'), '[00:01]Local', 'utf8')
    const added = await readLyricsSnapshot(audioPath, metadata())
    expect(added.lyrics).toEqual({ text: '[00:01]Local', format: 'lrc' })
    expect(added.lyricsSidecarFingerprint).not.toBe(absent)
    await rm(join(root, 'song.lrc'))
    expect(await getLyricsSidecarFingerprint(audioPath)).toBe(absent)
  })
})
