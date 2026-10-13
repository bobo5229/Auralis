import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { classifyLyrics } from './classifyLyrics'
import { resolveLyrics } from './metadataNormalizer'
import type { IAudioMetadata } from 'music-metadata'

const ttml = readFileSync(new URL('./__fixtures__/duet.ttml', import.meta.url), 'utf8')

describe('classifyLyrics', () => {
  it('preserves complete TTML XML, including artists, extensions and word timings', () => {
    const original = `\uFEFF${ttml}\r\n`
    expect(classifyLyrics(original)).toEqual({ text: original, format: 'ttml' })
  })

  it('supports namespace prefixes and untimed TTML', () => {
    const xml =
      '<t:tt xmlns:t="http://www.w3.org/ns/ttml"><t:body><t:div><t:p>你好</t:p></t:div></t:body></t:tt>'
    expect(classifyLyrics(xml)?.format).toBe('ttml')
  })

  it.each([
    '<tt xmlns="http://www.w3.org/ns/ttml"><body></tt>',
    '<tt xmlns="http://www.w3.org/ns/ttml"><body/><body></tt>',
    '<tt xmlns="http://www.w3.org/ns/ttml"><body><p begin=1s>Hi</p></body></tt>',
    '<tt xmlns="urn:unrelated"><body/></tt>',
    '<tt><body/></tt>',
    '<tt xmlns="http://www.w3.org/ns/ttml"><head/></tt>',
    '<!DOCTYPE tt [<!ENTITY x SYSTEM "file:///private">]><tt xmlns="http://www.w3.org/ns/ttml"><body>&x;</body></tt>',
    '<tt xmlns="http://www.w3.org/ns/ttml"><body>&unknown;</body></tt>',
  ])('rejects malformed or unrelated XML instead of exposing it as plain lyrics', (xml) => {
    expect(classifyLyrics(xml)).toBeNull()
  })

  it('rejects non-TTML content in a TTML sidecar and oversized XML', () => {
    expect(classifyLyrics('[00:01]LRC', true)).toBeNull()
    expect(classifyLyrics('<html/>', true)).toBeNull()
    expect(
      classifyLyrics(
        `<tt xmlns="http://www.w3.org/ns/ttml"><body>${'a'.repeat(8 * 1024 * 1024)}</body></tt>`,
      ),
    ).toBeNull()
  })

  it('keeps LRC and plain-text classification unchanged', () => {
    expect(classifyLyrics('\uFEFF [00:01]Hello \n')).toEqual({
      text: '[00:01]Hello',
      format: 'lrc',
    })
    expect(classifyLyrics(' Hello ')).toEqual({ text: 'Hello', format: 'plain' })
    expect(classifyLyrics(' \n ')).toBeNull()
  })

  it('prefers embedded TTML over LRC/plain and retains its original XML', () => {
    const metadata = {
      common: { lyrics: ['Plain', '[00:01]LRC', ttml] },
      native: {},
    } as unknown as IAudioMetadata
    expect(resolveLyrics(metadata)).toEqual({ text: ttml, format: 'ttml' })
    metadata.common.lyrics = [
      '<tt broken',
      '[00:01]LRC',
    ] as unknown as IAudioMetadata['common']['lyrics']
    expect(resolveLyrics(metadata)).toEqual({ text: '[00:01]LRC', format: 'lrc' })
  })
})
