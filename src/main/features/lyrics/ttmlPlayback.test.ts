import { describe, expect, it } from 'vitest'
import { readTtmlPlayback } from './ttmlPlayback'

describe('TTML playback projection', () => {
  it('retains distinct same-time rows and their person numbers without exporting LRC', () => {
    const raw =
      '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent type="person" xml:id="A"/><ttm:agent type="person" xml:id="B"/></metadata></head><body><div><p begin="1s" end="10s" ttm:agent="A">one</p><p begin="1s" end="10s" ttm:agent="B">two</p></div></body></tt>'
    const playback = readTtmlPlayback(raw)
    expect(playback.error).toBeNull()
    expect(
      playback.lines.map((line) => [
        line.editorLineId,
        line.text,
        line.timeSeconds,
        line.endTimeSeconds,
        line.performer,
      ]),
    ).toEqual([
      ['line-0', 'one', 1, 10, 1],
      ['line-1', 'two', 1, 10, 2],
    ])
    expect(playback.lines[0].id).not.toBe(playback.lines[1].id)
  })
  it('resolves parent and word timing and excludes auxiliary words from the main row', () => {
    const raw =
      '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body begin="2s" end="9s"><div><p><span begin="3s">hello</span><span ttm:role="x-translation" begin="3s">你好</span></p></div></body></tt>'
    expect(readTtmlPlayback(raw)).toMatchObject({
      error: null,
      lines: [{ text: 'hello', timeSeconds: 3, endTimeSeconds: 9, performer: null }],
    })
  })
  it('returns a typed failure for invalid XML and unsupported timing', () => {
    expect(readTtmlPlayback('<broken>')).toEqual({ lines: [], error: 'invalid-ttml' })
    expect(
      readTtmlPlayback(
        '<tt xmlns="http://www.w3.org/ns/ttml"><body><p begin="10f">x</p></body></tt>',
      ),
    ).toEqual({ lines: [], error: 'unsupported-timing' })
  })
})

const wrap = (body: string, attributes = '') =>
  `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" ${attributes}><body><div>${body}</div></body></tt>`

function rows(raw: string) {
  const result = readTtmlPlayback(raw)
  expect(result.error).toBeNull()
  return result.lines.map(({ text, timeSeconds, endTimeSeconds }) => ({
    text,
    timeSeconds,
    endTimeSeconds,
  }))
}

describe('retained TTML playback parsing', () => {
  it('supports namespace aliases and clock/unit times, sorting rows stably', () => {
    const raw =
      '<t:tt xmlns:t="http://www.w3.org/ns/ttml"><t:body><t:div><t:p begin="1h">hour</t:p><t:p begin="01:00:01.250">clock</t:p><t:p begin="60200ms">ms</t:p><t:p begin="1.5m">minute</t:p><t:p begin="1.5m">same-time</t:p></t:div></t:body></t:tt>'
    expect(rows(raw).map(({ text, timeSeconds }) => [text, timeSeconds])).toEqual([
      ['ms', 60.2],
      ['minute', 90],
      ['same-time', 90],
      ['hour', 3600],
      ['clock', 3601.25],
    ])
  })
  it('derives missing paragraph times from words or a parent', () => {
    expect(rows(wrap('<p><span begin="1s">A</span><span begin="2s">B</span></p>'))).toEqual([
      { text: 'AB', timeSeconds: 1, endTimeSeconds: null },
    ])
    expect(
      rows(
        '<tt xmlns="http://www.w3.org/ns/ttml"><body begin="5s"><div><p>Hello</p></div></body></tt>',
      ),
    ).toEqual([{ text: 'Hello', timeSeconds: 5, endTimeSeconds: null }])
  })
  it('uses absolute music timing for nested timestamps and durations', () => {
    const raw =
      '<tt xmlns="http://www.w3.org/ns/ttml"><body begin="10s"><div begin="5s"><p begin="2s" dur="3s">A</p></div></body></tt>'
    expect(rows(raw)).toEqual([{ text: 'A', timeSeconds: 2, endTimeSeconds: 5 }])
  })
  it('normalizes XML whitespace and preserves CDATA, escaped text and line breaks', () => {
    const raw = wrap(
      '<p begin="1s">\n <span>Hello </span><span><![CDATA[<world>]]></span> &amp; you<br/>第二行\n</p>',
    )
    expect(rows(raw)).toEqual([
      { text: 'Hello <world> & you', timeSeconds: 1, endTimeSeconds: null },
      { text: '第二行', timeSeconds: 1, endTimeSeconds: null },
    ])
  })
  it('omits ruby pronunciation and keeps non-breaking spaces', () => {
    const raw = wrap(
      '<p begin="1s"><span tts:ruby="container"><span tts:ruby="base">字</span><span tts:ruby="text">zì</span></span></p><p begin="2s">\u00a0A\u00a0B\u00a0</p>',
      'xmlns:tts="http://www.w3.org/ns/ttml#styling"',
    )
    expect(rows(raw).map(({ text }) => text)).toEqual(['字', '\u00a0A\u00a0B\u00a0'])
  })
  it('carries submillisecond rounding into the next minute', () => {
    expect(rows(wrap('<p begin="59.9996s">A</p>'))[0].timeSeconds).toBe(60)
  })
  it.each(['&#0;', '&#xD800;', '&#xFFFE;'])('rejects invalid XML reference %s', (entity) => {
    expect(readTtmlPlayback(wrap(`<p begin="1s">${entity}</p>`))).toEqual({
      lines: [],
      error: 'invalid-ttml',
    })
  })
  it.each([
    '<tt broken',
    '<tt xmlns="urn:wrong"><body/></tt>',
    '<!DOCTYPE tt><tt xmlns="http://www.w3.org/ns/ttml"><body/></tt>',
    wrap('<p>no timestamps</p>'),
    wrap('<p begin="5s" end="2s">A</p>'),
    wrap(`<p begin="1s">${'<span>'.repeat(130)}A${'</span>'.repeat(130)}</p>`),
  ])('rejects malformed TTML without exposing partial playback rows', (raw) => {
    expect(readTtmlPlayback(raw)).toEqual({ lines: [], error: 'invalid-ttml' })
  })
  it.each([
    wrap('<p begin="00:00:01:12">frames</p>'),
    wrap('<p begin="10f">frames</p>'),
    wrap('<p begin="10t">ticks</p>'),
    wrap(
      '<p begin="1s">a</p>',
      'xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:timeBase="clock"',
    ),
    wrap('<p begin="">empty</p>'),
    wrap('<div timeContainer="seq"><p begin="1s">A</p></div>'),
  ])('reports unsupported timing without partial playback rows', (raw) => {
    expect(readTtmlPlayback(raw)).toEqual({ lines: [], error: 'unsupported-timing' })
  })
})
