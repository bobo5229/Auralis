import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { classifyLyrics } from './classifyLyrics'
import { hasEmbeddedTtml, resolveLyrics } from './metadataNormalizer'
import type { IAudioMetadata } from 'music-metadata'

const ttml = readFileSync(new URL('./__fixtures__/duet.ttml', import.meta.url), 'utf8')

describe('classifyLyrics', () => {
  it('ignores TTML and malformed TTML instead of exposing XML as lyrics', () => {
    expect(classifyLyrics(ttml)).toBeNull()
    expect(classifyLyrics('<t:tt xmlns:t="http://www.w3.org/ns/ttml"><t:body/></t:tt>')).toBeNull()
    expect(classifyLyrics('<tt broken')).toBeNull()
  })

  it('detects TTML in all embedded lyric candidates without changing playback selection', () => {
    const metadata = {
      common: { lyrics: ['[00:01]Playable'] },
      native: { 'ID3v2.3': [{ id: 'USLT:description', value: { text: ttml } }] },
    } as unknown as IAudioMetadata
    expect(hasEmbeddedTtml(metadata)).toBe(true)
    expect(resolveLyrics(metadata)).toEqual({ text: '[00:01]Playable', format: 'lrc' })
    expect(
      hasEmbeddedTtml({ common: { lyrics: ['plain'] }, native: {} } as unknown as IAudioMetadata),
    ).toBe(false)
  })

  it('detects ID3v2.2 ULT lyrics absent from common metadata', () => {
    const metadata = {
      common: {},
      native: { 'ID3v2.2': [{ id: 'ULT', value: { text: ttml } }] },
    } as unknown as IAudioMetadata
    expect(hasEmbeddedTtml(metadata)).toBe(true)
    expect(resolveLyrics(metadata)).toBeNull()
  })

  it('keeps LRC and plain-text classification unchanged', () => {
    expect(classifyLyrics('\uFEFF [00:01]Hello \n')).toEqual({
      text: '[00:01]Hello',
      format: 'lrc',
    })
    expect(classifyLyrics(' Hello ')).toEqual({ text: 'Hello', format: 'plain' })
    expect(classifyLyrics(' \n ')).toBeNull()
  })

  it('recognizes long-track LRC instead of downgrading editor-generated timestamps to plain text', () => {
    expect(classifyLyrics('[100:00.00]Long track')).toEqual({
      text: '[100:00.00]Long track',
      format: 'lrc',
    })
  })

  it('ignores embedded TTML and prefers embedded LRC over plain text', () => {
    const metadata = {
      common: { lyrics: ['Plain', '[00:01]LRC', ttml] },
      native: {},
    } as unknown as IAudioMetadata
    expect(resolveLyrics(metadata)).toEqual({ text: '[00:01]LRC', format: 'lrc' })
    metadata.common.lyrics = [
      '<tt broken',
      '[00:01]LRC',
    ] as unknown as IAudioMetadata['common']['lyrics']
    expect(resolveLyrics(metadata)).toEqual({ text: '[00:01]LRC', format: 'lrc' })
  })
})
