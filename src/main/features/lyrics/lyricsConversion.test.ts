import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { classifyLyrics } from '../metadata/classifyLyrics'
import { convertLrcToTtml, convertTtmlToLrc, LyricsConversionError } from './lyricsConversion'
import { parseTtmlDocument, TTML_NAMESPACE } from './ttmlDocument'

const fixture = readFileSync(new URL('../metadata/__fixtures__/duet.ttml', import.meta.url), 'utf8')
const wrap = (body: string, attributes = '') =>
  `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" ${attributes}><body><div>${body}</div></body></tt>`
const paragraphs = (xml: string) => [
  ...parseTtmlDocument(xml).getElementsByTagNameNS(TTML_NAMESPACE, 'p'),
]

describe('LRC to TTML', () => {
  it('sorts repeated and simultaneous timestamps without merging distinct lines', () => {
    const result = convertLrcToTtml(
      '\uFEFF[00:03.125][00:01.50]你好\r\n[00:01.50]Hello\r\n[00:04]',
      { durationMs: 6000 },
    )
    expect(result.format).toBe('ttml')
    expect(classifyLyrics(result.text)?.format).toBe('ttml')
    expect(
      paragraphs(result.text).map((p) => [
        p.getAttribute('begin'),
        p.getAttribute('end'),
        p.textContent,
      ]),
    ).toEqual([
      ['00:00:01.500', '00:00:03.125', '你好'],
      ['00:00:01.500', '00:00:03.125', 'Hello'],
      ['00:00:03.125', '00:00:04.000', '你好'],
      ['00:00:04.000', '00:00:06.000', ''],
    ])
    expect(result.warnings).toEqual(['inferred-line-ends'])
  })

  it('round-trips millisecond timings, metadata and XML special characters without creating singer assignments', () => {
    const result = convertLrcToTtml(
      '[ti:A & B]\n[ar:艺术家 1; 艺术家 2]\n[al:测试]\n[by:作者]\n[custom:value]\n[00:01.007] <hello> & "you" 😀 \n[00:03:123]再见',
      { durationMs: 6000 },
    )
    expect(result.text).not.toContain('ttm:agent=')
    const back = convertTtmlToLrc(result.text)
    expect(back.text).toBe(
      '[ti:A & B]\n[ar:艺术家 1; 艺术家 2]\n[al:测试]\n[by:作者]\n[custom:value]\n[00:01.007] <hello> & "you" 😀 \n[00:03.123]再见\n',
    )
    expect(back.warnings).toEqual(['line-ends-dropped'])
  })

  it('uses [length:] or a caller-supplied song duration for the final line', () => {
    const raw = '[length:1:30.250]\n[00:10]Hello'
    expect(paragraphs(convertLrcToTtml(raw).text)[0].getAttribute('end')).toBe('00:01:30.250')
    expect(
      paragraphs(convertLrcToTtml(raw, { durationMs: 60000 }).text)[0].getAttribute('end'),
    ).toBe('00:01:00.000')
  })

  it('reports inferred final ends and untimed text that could not be converted', () => {
    const result = convertLrcToTtml('unassigned text\n# comment\n// comment\n[00:10]Hello', {
      finalLineDurationMs: 3000,
    })
    expect(paragraphs(result.text)[0].getAttribute('end')).toBe('00:00:13.000')
    expect(result.warnings).toEqual([
      'untimed-lines-ignored',
      'inferred-line-ends',
      'inferred-final-end',
    ])
  })

  it.each([
    [500, '00:00:00.500'],
    [-500, '00:00:01.500'],
  ])('applies offset %s once and removes it from the exported metadata', (offset, begin) => {
    const result = convertLrcToTtml(`[00:01]Hello\n[offset:${offset}]`)
    expect(paragraphs(result.text)[0].getAttribute('begin')).toBe(begin)
    expect(convertTtmlToLrc(result.text).text).not.toContain('[offset:')
  })

  it('reports timestamps clamped to the start of the song', () => {
    const result = convertLrcToTtml('[offset:2000]\n[00:01]Hello')
    expect(paragraphs(result.text)[0].getAttribute('begin')).toBe('00:00:00.000')
    expect(result.warnings).toContain('negative-times-clamped')
  })

  it('preserves enhanced-LRC words, spaces and explicit ends for repeated lines', () => {
    const result = convertLrcToTtml(
      '[00:01][00:11]prefix <00:01.500>Hello <00:02.250>world<00:03.000>',
    )
    const lines = paragraphs(result.text)
    expect(lines.map((p) => p.getAttribute('end'))).toEqual(['00:00:03.000', '00:00:13.000'])
    expect(
      [...lines[1].getElementsByTagNameNS(TTML_NAMESPACE, 'span')].map((span) => [
        span.getAttribute('begin'),
        span.getAttribute('end'),
        span.textContent,
      ]),
    ).toEqual([
      ['00:00:11.000', '00:00:11.500', 'prefix '],
      ['00:00:11.500', '00:00:12.250', 'Hello '],
      ['00:00:12.250', '00:00:13.000', 'world'],
    ])
    expect(result.warnings).toEqual([])
    expect(convertTtmlToLrc(result.text).text).toBe(
      '[00:01.000]prefix Hello world\n[00:11.000]prefix Hello world\n',
    )
  })

  it.each([
    'plain lyrics',
    '[00:60]invalid',
    '[00:bad]invalid',
    '[offset:bad]\n[00:01]a',
    '[00:01]<00:03>a<00:02>b',
    '[00:02]<00:01>a',
    '[00:01]a[00:02]b',
  ])(
    'rejects invalid or unsupported LRC instead of generating a partial timing axis: %s',
    (raw) => {
      expect(() => convertLrcToTtml(raw)).toThrow(LyricsConversionError)
    },
  )

  it.each([
    { durationMs: 1000 },
    { durationMs: NaN },
    { durationMs: Infinity },
    { finalLineDurationMs: 0 },
    { finalLineDurationMs: -1 },
  ])('rejects invalid options %j', (options) => {
    expect(() => convertLrcToTtml('[00:01]a', options)).toThrow(LyricsConversionError)
  })
})

describe('TTML to basic LRC', () => {
  it('converts the duet fixture, retaining both vocalists and translation text as independent lines', () => {
    const result = convertTtmlToLrc(fixture)
    expect(result.text).toBe(
      '[ar:演唱者一; 演唱者二]\n[00:01.000]你好\n[00:03.000]Hello & goodbye\n[00:07.000]共同演唱\n[00:07.000]Together\n',
    )
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        'performers-dropped',
        'word-timing-dropped',
        'line-ends-dropped',
        'annotations-flattened',
      ]),
    )
    expect(
      readFileSync(new URL('../metadata/__fixtures__/duet.ttml', import.meta.url), 'utf8'),
    ).toBe(fixture)
  })

  it('preserves simultaneous rows and sorts out-of-order input stably', () => {
    const result = convertTtmlToLrc(
      wrap('<p begin="3s">later</p><p begin="1s">A</p><p begin="1s">B</p>'),
    )
    expect(result.text).toBe('[00:01.000]A\n[00:01.000]B\n[00:03.000]later\n')
    expect(result.warnings).toEqual([])
  })

  it('supports namespace aliases, time units and clock times beyond an hour', () => {
    const raw =
      '<t:tt xmlns:t="http://www.w3.org/ns/ttml"><t:body><t:div><t:p begin="1h">hour</t:p><t:p begin="01:00:01.250">clock</t:p><t:p begin="60200ms">ms</t:p><t:p begin="1.5m">minute</t:p></t:div></t:body></t:tt>'
    expect(convertTtmlToLrc(raw).text).toBe(
      '[01:00.200]ms\n[01:30.000]minute\n[60:00.000]hour\n[60:01.250]clock\n',
    )
  })

  it('derives a paragraph timestamp from its first timed word or timed parent', () => {
    expect(
      convertTtmlToLrc(wrap('<p><span begin="1s">A</span><span begin="2s">B</span></p>')).text,
    ).toBe('[00:01.000]AB\n')
    expect(
      convertTtmlToLrc(
        '<tt xmlns="http://www.w3.org/ns/ttml"><body begin="5s"><div><p>Hello</p></div></body></tt>',
      ).text,
    ).toBe('[00:05.000]Hello\n')
  })

  it('uses absolute music timing by default and offers explicit W3C relative timing', () => {
    const raw =
      '<tt xmlns="http://www.w3.org/ns/ttml"><body begin="10s"><div begin="5s"><p begin="2s" dur="3s">A</p></div></body></tt>'
    expect(convertTtmlToLrc(raw).text).toBe('[00:02.000]A\n')
    expect(convertTtmlToLrc(raw, { timingMode: 'relative' }).text).toBe('[00:17.000]A\n')
  })

  it('flattens translations, romanization and background text without concatenating them into the main lyric', () => {
    const result = convertTtmlToLrc(
      wrap(
        '<p begin="1s">A<span ttm:role="x-translation">甲</span><span ttm:role="x-roman">ā</span><span ttm:role="x-bg" begin="2s">(echo)<span ttm:role="x-translation">回应</span></span>B</p>',
      ),
    )
    expect(result.text).toBe(
      '[00:01.000]AB\n[00:01.000]甲\n[00:01.000]ā\n[00:02.000](echo)\n[00:02.000]回应\n',
    )
    expect(result.warnings).toContain('annotations-flattened')
  })

  it('supports header translations linked by lyric line IDs', () => {
    const raw =
      '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://itunes.apple.com/lyric-ttml-extensions"><head><metadata><iTunesMetadata xmlns="http://music.apple.com/lyric-ttml-internal"><translations><translation><text for="L1">你好</text></translation></translations></iTunesMetadata></metadata></head><body><div><p begin="1s" itunes:key="L1">Hello</p></div></body></tt>'
    expect(convertTtmlToLrc(raw).text).toBe('[00:01.000]Hello\n[00:01.000]你好\n')
    const multiline = raw.replace('>你好</text>', ' xml:space="preserve">你\n好</text>')
    expect(convertTtmlToLrc(multiline).text).toBe(
      '[00:01.000]Hello\n[00:01.000]你\n[00:01.000]好\n',
    )
  })

  it('normalizes XML whitespace and handles CDATA, line breaks and escaped characters', () => {
    const raw = wrap(
      '<p begin="1s">\n <span>Hello </span><span><![CDATA[<world>]]></span> &amp; you<br/>第二行\n</p>',
    )
    expect(convertTtmlToLrc(raw).text).toBe('[00:01.000]Hello <world> & you\n[00:01.000]第二行\n')
  })

  it('omits ruby pronunciation from the main text and reports discarded presentation', () => {
    const raw = wrap(
      '<p begin="1s"><span tts:ruby="container"><span tts:ruby="base">字</span><span tts:ruby="text">zì</span></span></p>',
      'xmlns:tts="http://www.w3.org/ns/ttml#styling"',
    )
    const result = convertTtmlToLrc(raw)
    expect(result.text).toBe('[00:01.000]字\n')
    expect(result.warnings).toContain('presentation-dropped')
  })

  it('keeps non-breaking spaces in lyric text', () => {
    expect(convertTtmlToLrc(wrap('<p begin="1s">\u00a0A\u00a0B\u00a0</p>')).text).toBe(
      '[00:01.000]\u00a0A\u00a0B\u00a0\n',
    )
  })

  it.each(['&#0;', '&#xD800;', '&#xFFFE;'])(
    'rejects invalid decoded XML references: %s',
    (entity) => {
      const raw = wrap(`<p begin="1s">${entity}</p>`)
      expect(() => convertTtmlToLrc(raw)).toThrow(LyricsConversionError)
      expect(classifyLyrics(raw)).toBeNull()
    },
  )

  it('reports submillisecond rounding and carries into the next minute correctly', () => {
    const result = convertTtmlToLrc(wrap('<p begin="59.9996s">A</p>'))
    expect(result.text).toBe('[01:00.000]A\n')
    expect(result.warnings).toContain('submillisecond-times-rounded')
  })

  it.each([
    '<tt broken',
    '<tt xmlns="urn:wrong"><body/></tt>',
    '<!DOCTYPE tt><tt xmlns="http://www.w3.org/ns/ttml"><body/></tt>',
    wrap('<p>no timestamps</p>'),
    wrap('<p begin="5s" end="2s">A</p>'),
    wrap('<p begin="00:00:01:12">frames</p>'),
    wrap('<p begin="10f">frames</p>'),
    wrap('<p begin="10t">ticks</p>'),
    wrap(
      '<p begin="1s">a</p>',
      'xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:timeBase="clock"',
    ),
    wrap('<p begin="">empty</p>'),
    wrap('<div timeContainer="seq"><p begin="1s">A</p></div>'),
  ])('rejects malformed or unsupported TTML: %s', (raw) => {
    expect(() => convertTtmlToLrc(raw)).toThrow(LyricsConversionError)
  })

  it('rejects excessive nesting before recursive content processing', () => {
    expect(() =>
      convertTtmlToLrc(wrap(`<p begin="1s">${'<span>'.repeat(130)}A${'</span>'.repeat(130)}</p>`)),
    ).toThrow(LyricsConversionError)
  })
})

describe('conversion input boundaries', () => {
  it('rejects repeated-line expansion beyond the item budget', () => {
    const raw =
      '[00:01]'.repeat(1001) +
      Array.from({ length: 100 }, (_, i) => `<00:01.${String(i).padStart(3, '0')}>a`).join('')
    expect(() => convertLrcToTtml(raw)).toThrow(LyricsConversionError)
  })

  it('round-trips a collection of ordered and simultaneous millisecond rows', () => {
    const rows = Array.from({ length: 120 }, (_, index) => {
      const time = Math.floor(index / 2) * 37
      return `[00:${String(Math.floor(time / 1000)).padStart(2, '0')}.${String(time % 1000).padStart(3, '0')}]第 ${index} 行 & <text>`
    })
    const result = convertTtmlToLrc(convertLrcToTtml(rows.join('\n'), { durationMs: 3000 }).text)
    expect(result.text).toBe(`${rows.join('\n')}\n`)
  })

  it.each(['', ' \n', '[00:01]a\u0000', '[00:01]\uD800', 'a'.repeat(8 * 1024 * 1024 + 1)])(
    'rejects unusable input in both directions',
    (raw) => {
      expect(() => convertLrcToTtml(raw)).toThrow(LyricsConversionError)
      expect(() => convertTtmlToLrc(raw)).toThrow(LyricsConversionError)
    },
  )
})
