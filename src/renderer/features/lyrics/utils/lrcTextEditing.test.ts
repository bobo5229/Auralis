import { describe, expect, it } from 'vitest'
import {
  formatLrcTime,
  getLrcTextLine,
  nudgeLrcLineTime,
  replaceLrcLineTime,
} from './lrcTextEditing'

describe('raw LRC timing edits', () => {
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
})
