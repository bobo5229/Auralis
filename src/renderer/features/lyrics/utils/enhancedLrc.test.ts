import { describe, expect, it } from 'vitest'
import { parseLrc } from './parseLrc'
import { getActiveLyricSegment } from './getActiveLyricSegment'
import { scanLrcInlineTiming } from '@shared/utils/lrcTiming'

describe('enhanced LRC playback', () => {
  it('keeps whole source spans, spaces, literal markup and a final boundary at zero', () => {
    const [line] = parseLrc('[00:00.000]<00:00.000>我👩‍🎤 <00:00.400>  hear é<b>雨</b><00:01.000>')
    expect(line.text).toBe('我👩‍🎤   hear é<b>雨</b>')
    expect(line.segments).toEqual([
      { text: '我👩‍🎤 ', startTimeSeconds: 0, endTimeSeconds: 0.4 },
      { text: '  hear é<b>雨</b>', startTimeSeconds: 0.4, endTimeSeconds: 1 },
    ])
    expect(getActiveLyricSegment(line, 0.399)).toEqual({ startedIndex: 0, activeIndex: 0 })
    expect(getActiveLyricSegment(line, 0.4)).toEqual({ startedIndex: 1, activeIndex: 1 })
    expect(getActiveLyricSegment(line, 1)).toEqual({ startedIndex: 1, activeIndex: -1 })
  })

  it('keeps mixed lines, untimed prefixes, empty gap markers and unknown final durations', () => {
    const lines = parseLrc(
      '[00:01]plain\r[00:02]prefix<00:03>a<00:04><00:05>b\r\n[00:07]\n[00:08]<00:09>late',
    )
    expect(lines.map((line) => line.text)).toEqual(['plain', 'prefixab', '', 'late'])
    expect(lines[0].segments).toBeUndefined()
    expect(lines[1].segments).toEqual([
      { text: 'prefix', startTimeSeconds: 2, endTimeSeconds: 3 },
      { text: 'a', startTimeSeconds: 3, endTimeSeconds: 4 },
      { text: 'b', startTimeSeconds: 5, endTimeSeconds: null },
    ])
    expect(getActiveLyricSegment(lines[1], 4.5)).toEqual({ startedIndex: 1, activeIndex: -1 })
    expect(getActiveLyricSegment(lines[3], 8.5).startedIndex).toBe(-1)
    expect(getActiveLyricSegment(lines[3], 90).startedIndex).toBe(0)
  })

  it.each([1000, -1000])(
    'uses the same global offset for rows, words and endpoints: %s',
    (offset) => {
      const [line] = parseLrc(`[offset:99]\n[00:02]<00:02.123>a<00:03.456>\n[offset:${offset}]`)
      expect(line.timeSeconds).toBe(2 - offset / 1000)
      expect(line.segments?.[0]).toEqual({
        text: 'a',
        startTimeSeconds: (2123 - offset) / 1000,
        endTimeSeconds: (3456 - offset) / 1000,
      })
    },
  )

  it('supports long clocks and existing fraction variants without splitting by characters', () => {
    const [line] = parseLrc('\uFEFF[100:00:123]<100:00:123>whole word<100:00.5>一组<100:01.25>')
    expect(
      line.segments?.map((segment) => [
        segment.text,
        segment.startTimeSeconds,
        segment.endTimeSeconds,
      ]),
    ).toEqual([
      ['whole word', 6000.123, 6000.5],
      ['一组', 6000.5, 6001.25],
    ])
  })

  it.each([
    ['[00:02]<00:01>a<00:03>b', 'ab'],
    ['[00:01]<00:03>a<00:02>b', 'ab'],
    ['[00:01]<00:01>a<00:60>b', 'a<00:60>b'],
    ['[00:01]<00:01>a<00:02', 'a<00:02'],
    ['[00:00]<00:01未闭合 <00:02>歌词', '<00:01未闭合 歌词'],
    ['[00:00]<00:00>A<-00:01>B<00:02>C', 'A<-00:01>BC'],
    ['[00:00]<00:00>A<+00:01 B<00:02>C', 'A<+00:01 BC'],
    ['[00:00]<00:00>A<00 :01>B<00:02>C', 'A<00 :01>BC'],
    ['[00:00]<00:00>A<00：01>B<00:02>C', 'A<00：01>BC'],
    [`[00:01]<${'9'.repeat(310)}:00>a<00:02>b`, `<${'9'.repeat(310)}:00>ab`],
  ])('locally downgrades invalid timings without losing text: %s', (raw, text) => {
    const lines = parseLrc(`${raw}\n[00:10]<00:10>ok<00:11>`)
    expect(lines[0].text).toBe(text)
    expect(lines[0].segments).toBeUndefined()
    expect(lines[1].segments?.[0].text).toBe('ok')
  })

  it('does not infer repeated word offsets or inline-square timing', () => {
    const lines = parseLrc('[00:10][00:20]<00:10>同<00:11>句\n[00:30]a[00:31]b')
    expect(lines.map((line) => [line.timeSeconds, line.text, line.segments])).toEqual([
      [10, '同句', undefined],
      [20, '同句', undefined],
      [30, 'a[00:31]b', undefined],
    ])
    expect(parseLrc('<00:01>no row')).toEqual([])
  })

  it('handles equal timestamps, zero truncation and next-row bounds', () => {
    const [line] = parseLrc('[offset:500]\n[00:00]<00:00.1>a<00:00.2>b<00:00.2>c')
    expect(getActiveLyricSegment(line, 0)).toEqual({ startedIndex: 2, activeIndex: 2 })
    expect(parseLrc('[00:01]<00:01>a<00:04>b\n[00:03]next')[0].segments).toBeUndefined()
    expect(getActiveLyricSegment(undefined, 3).activeIndex).toBe(-1)
    expect(getActiveLyricSegment(line, NaN).startedIndex).toBe(-1)
  })

  it('bounds per-row and per-document objects while keeping all readable text', () => {
    const excessive = '<0:00>a'.repeat(1025)
    const [overflow] = parseLrc(`[00:00]${excessive}`)
    expect(overflow.text).toBe('a'.repeat(1025))
    expect(overflow.segments).toBeUndefined()
    const lines = parseLrc(
      Array.from({ length: 17 }, () => `[00:00]${'<0:00>a'.repeat(1024)}`).join('\n'),
    )
    expect(lines.slice(0, 16).every((line) => line.segments?.length === 1024)).toBe(true)
    expect(lines[16].segments).toBeUndefined()
    expect(lines[16].text).toHaveLength(1024)
    expect(scanLrcInlineTiming('<0:00>a'.repeat(2000)).timestamps.length).toBe(1025)
  })
})
