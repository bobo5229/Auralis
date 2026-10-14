import { expect, it } from 'vitest'
import { readDuetDocument } from './duetDocument'
import { readDuetLyrics } from './duetLyrics'
import { retimeTtmlLines, timingEditableLines } from './ttmlLineTiming'
import { readTtmlPlayback } from './ttmlPlayback'

const xml = (body: string) =>
  `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent xml:id="v1" type="person"/><ttm:agent xml:id="v2" type="person"/></metadata></head><body><div>${body}</div></body></tt>`
function request(text: string, lineIds = ['line-0']) {
  return {
    sessionId: 'draft',
    expectedRevision: readDuetLyrics(text).revision,
    lineIds,
    mode: 'shift' as const,
    valueMs: 100,
  }
}

it('moves paragraph and word times together while preserving durations, XML and performer assignment', () => {
  const text = xml(
    '<p xml:id="first" begin="1s" end="3s" ttm:agent="v2"><span begin="1.125s" dur="500ms">Word</span><span begin="2s" end="3s"> two</span></p><p begin="4s" end="5s">Other</p>',
  )
  const edited = retimeTtmlLines(text, { ...request(text), mode: 'set', valueMs: 2500 })
  const source = readDuetDocument(edited)
  const paragraph = source.lines.get('line-0')!
  expect(paragraph.getAttribute('begin')).toBe('00:00:02.500')
  expect(paragraph.getAttribute('end')).toBe('00:00:04.500')
  expect(paragraph.getAttribute('xml:id')).toBe('first')
  const words = paragraph.getElementsByTagName('span')
  expect(words.item(0)!.getAttribute('begin')).toBe('00:00:02.625')
  expect(words.item(0)!.getAttribute('dur')).toBe('500ms')
  expect(words.item(1)!.getAttribute('end')).toBe('00:00:04.500')
  expect(readDuetLyrics(edited).lines[0].assignment).toBe('performer-2')
  expect(source.lines.get('line-1')!.getAttribute('begin')).toBe('4s')
  expect(readTtmlPlayback(edited).lines.map((line) => line.timeSeconds)).toEqual([2.5, 4])
})

it('shifts same-time lines independently and deduplicates selected IDs', () => {
  const text = xml('<p begin="1s" end="2s">A</p><p begin="1s" end="2s">B</p>')
  const edited = retimeTtmlLines(text, request(text, ['line-1', 'line-1']))
  expect(readDuetDocument(edited).snapshot.lines.map((line) => line.timing.begin)).toEqual([
    '1s',
    '00:00:01.100',
  ])
})

it('leaves exact source bytes intact for a no-op, and rejects stale revisions or batch set', () => {
  const text = xml('<p begin="1s" end="2s">A</p><p begin="3s" end="4s">B</p>')
  expect(retimeTtmlLines(text, { ...request(text), valueMs: 0 })).toBe(text)
  expect(() => retimeTtmlLines(text, { ...request(text), expectedRevision: 'stale' })).toThrow(
    'stale-revision',
  )
  expect(() =>
    retimeTtmlLines(text, { ...request(text, ['line-0', 'line-1']), mode: 'set' }),
  ).toThrow('invalid-request')
})

it('rejects negative word times instead of clamping them and accepts an exact zero start', () => {
  const text = xml('<p begin="1s" end="2s"><span begin="0.5s">A</span></p>')
  expect(() => retimeTtmlLines(text, { ...request(text), valueMs: -600 })).toThrow('invalid-time')
  const simple = xml('<p begin="1s" end="2s">A</p>')
  expect(
    readTtmlPlayback(retimeTtmlLines(simple, { ...request(simple), mode: 'set', valueMs: 0 }))
      .lines[0].timeSeconds,
  ).toBe(0)
})

it('does not offer timing edits for ancestor constraints, implicit starts or submillisecond timing', () => {
  for (const text of [
    xml('<div end="5s"><p begin="1s" end="2s">A</p></div>'),
    xml('<p><span begin="1s" end="2s">A</span></p>'),
    xml('<p begin="1.0001s" end="2s">A</p>'),
  ]) {
    expect(timingEditableLines(readDuetDocument(text)).size).toBe(0)
    expect(() => retimeTtmlLines(text, request(text))).toThrow('unsupported-timing')
  }
})
