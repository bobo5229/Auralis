import { describe, expect, it } from 'vitest'
import { readTtmlPlayback } from './ttmlPlayback'
import { convertLrcToTtml } from './lyricsConversion'
import { ensureDuetPerformerSlots, assignDuetLines, readDuetLyrics } from './duetLyrics'

describe('TTML playback projection', () => {
  it('retains distinct same-time rows and their person numbers without exporting LRC', () => {
    const raw = convertLrcToTtml('[length:00:10]\n[00:01]one\n[00:01]two').text
    const prepared = ensureDuetPerformerSlots(raw, readDuetLyrics(raw).revision)
    const first = assignDuetLines(prepared.text, {
      expectedRevision: prepared.snapshot.revision,
      lineIds: ['line-0'],
      assignment: 'performer-1',
    })
    const second = assignDuetLines(first.text, {
      expectedRevision: first.snapshot.revision,
      lineIds: ['line-1'],
      assignment: 'performer-2',
    })
    const playback = readTtmlPlayback(second.text)
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
