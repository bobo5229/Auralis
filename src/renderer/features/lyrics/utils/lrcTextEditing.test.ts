import { describe, expect, it } from 'vitest'
import {
  formatLrcTime,
  getLrcTextLine,
  nudgeLrcLineTime,
  replaceLrcLineTime,
} from './lrcTextEditing'
import { parseLrc } from './parseLrc'

describe('raw LRC timing edits', () => {
  it.each(['\uFEFF', '  ', '\t'])(
    'preserves the prefix of an ordinary timed line: %j',
    (prefix) => {
      const line = getLrcTextLine(`${prefix}[00:01.00]  words  `, 0)
      expect(replaceLrcLineTime(line, 2)).toBe(`${prefix}[00:02.00]  words  `)
      expect(nudgeLrcLineTime(line, 0.1)).toBe(`${prefix}[00:01.10]  words  `)
    },
  )
  it('targets the cursor line and preserves lyric text including its spaces', () => {
    const text = '[00:01.00]第一行\n[00:03.456]  第二行  \n未打点'
    const line = getLrcTextLine(text, text.indexOf('第二'))
    expect(line.number).toBe(2)
    expect(replaceLrcLineTime(line, 15.8)).toBe('[00:15.80]  第二行  ')
    expect(text.slice(0, line.start)).toBe('[00:01.00]第一行\n')
    expect(replaceLrcLineTime(getLrcTextLine(text, text.length), 60.01)).toBe('[01:00.01]未打点')
  })
  it.each(['', '  ', '[ar:Artist]', '[00:01.00][00:05.00]Repeat', '[00:90.00]Invalid'])(
    'does not bulk-rewrite blank, information, malformed or multi-time lines: %s',
    (text) => {
      expect(replaceLrcLineTime(getLrcTextLine(text, 0), 10)).toBeNull()
    },
  )
  it('rounds across minute boundaries and clamps nudges to zero', () => {
    expect(formatLrcTime(59.999)).toBe('01:00.00')
    expect(nudgeLrcLineTime(getLrcTextLine('[00:00.05]Line', 0), -0.1)).toBe('[00:00.00]Line')
    expect(nudgeLrcLineTime(getLrcTextLine('Untimed', 0), 0.1)).toBeNull()
    expect(getLrcTextLine('\nLine', 0).text).toBe('')
    expect(getLrcTextLine('First\n', 6).number).toBe(2)
  })

  it.each([1000, -1000])('stamps and nudges playback time with offset %s', (offset) => {
    const text = `Untimed\n[offset:${offset}]`
    const stamped = replaceLrcLineTime(getLrcTextLine(text, 0), 10)!
    expect(stamped).toBe(offset > 0 ? '[00:11.00]Untimed' : '[00:09.00]Untimed')
    const updated = `${stamped}\n[offset:${offset}]`
    expect(parseLrc(updated)[0].timeSeconds).toBe(10)

    const nudged = nudgeLrcLineTime(getLrcTextLine(updated, 0), 0.1)!
    expect(parseLrc(`${nudged}\n[offset:${offset}]`)[0].timeSeconds).toBe(10.1)
  })

  it('keeps editor-generated timestamps playable across the 100-minute boundary', () => {
    const stamped = replaceLrcLineTime(getLrcTextLine('Long track', 0), 6000)!
    expect(stamped).toBe('[100:00.00]Long track')
    expect(parseLrc(stamped)[0]?.timeSeconds).toBe(6000)
    const nudged = nudgeLrcLineTime(getLrcTextLine(stamped, 0), -0.1)!
    expect(nudged).toBe('[99:59.90]Long track')
    expect(parseLrc(nudged)[0]?.timeSeconds).toBe(5999.9)
  })

  it('edits the same single timestamps accepted by playback and preserves multi-time lines', () => {
    expect(replaceLrcLineTime(getLrcTextLine('[1:02:123]Line', 0), 70)).toBe('[01:10.00]Line')
    expect(replaceLrcLineTime(getLrcTextLine('[1:02:123][2:03:456]Repeat', 0), 70)).toBeNull()
  })
})
