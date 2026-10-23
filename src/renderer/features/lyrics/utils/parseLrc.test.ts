import { describe, expect, it } from 'vitest'
import { parseLrc } from './parseLrc'

describe('parseLrc', () => {
  it('returns an empty array for an empty string', () => {
    expect(parseLrc('')).toEqual([])
  })

  it('returns an empty array when input is only blank lines', () => {
    expect(parseLrc('\n\n  \n\t\n')).toEqual([])
  })

  it('skips plain text lines that have no timestamps', () => {
    expect(parseLrc('just lyrics\nsome more text')).toEqual([])
  })

  it('skips metadata tags without timestamps, case-insensitively', () => {
    const raw = [
      '[ar:Artist]',
      '[TI:Title]',
      '[Al:Album]',
      '[BY:Writer]',
      '[offset:500]',
      '[LENGTH:3:45]',
      'ar',
      'Ti',
      'al',
      'by',
      'OFFSET',
      'length',
      '[00:01]keep',
    ].join('\n')

    expect(parseLrc(raw)).toEqual([{ id: '0', timeSeconds: 0.5, text: 'keep' }])
  })

  it('parses [mm:ss] lines', () => {
    expect(parseLrc('[01:02]hello')).toEqual([{ id: '0', timeSeconds: 62, text: 'hello' }])
  })

  it('parses [mm:ss.xx] fractional seconds with padEnd 3', () => {
    expect(parseLrc('[00:01.25]centi\n[00:02.5]deci\n[00:03.250]milli')).toEqual([
      { id: '0', timeSeconds: 1.25, text: 'centi' },
      { id: '1', timeSeconds: 2.5, text: 'deci' },
      { id: '2', timeSeconds: 3.25, text: 'milli' },
    ])
  })

  it('parses [mm:ss:xxx] milliseconds with colon separator and padEnd 3', () => {
    expect(parseLrc('[00:01:12]padded\n[00:02:123]full')).toEqual([
      { id: '0', timeSeconds: 1.12, text: 'padded' },
      { id: '1', timeSeconds: 2.123, text: 'full' },
    ])
  })

  it('splits multiple timestamps on one line into entries that share trimmed text', () => {
    expect(parseLrc('[00:01][00:05]  shared  ')).toEqual([
      { id: '0', timeSeconds: 1, text: 'shared' },
      { id: '1', timeSeconds: 5, text: 'shared' },
    ])
  })

  it('sorts lines by timeSeconds ascending', () => {
    const lines = parseLrc('[00:05]later\n[00:01]earlier\n[00:03]mid')

    expect(lines.map((line) => line.text)).toEqual(['earlier', 'mid', 'later'])
    expect(lines.map((line) => line.timeSeconds)).toEqual([1, 3, 5])
  })

  it('assigns ids in write order and does not reassign them after sort', () => {
    expect(parseLrc('[00:10][00:02]hello\n[00:01]first')).toEqual([
      { id: '2', timeSeconds: 1, text: 'first' },
      { id: '1', timeSeconds: 2, text: 'hello' },
      { id: '0', timeSeconds: 10, text: 'hello' },
    ])
  })

  it('trims text after timestamps', () => {
    expect(parseLrc('[00:01]  hello  ')).toEqual([{ id: '0', timeSeconds: 1, text: 'hello' }])
  })

  it('does not treat bracketed metadata like [ar:artist] as timestamps', () => {
    expect(parseLrc('[ar:artist]\n[ti:song]\n[00:01]lyric')).toEqual([
      { id: '0', timeSeconds: 1, text: 'lyric' },
    ])
  })

  it.each([1000, -1000, 12000])(
    'applies the global offset %s after reading every line',
    (offset) => {
      const lines = parseLrc(`[00:10.00]first\n[00:20.00]second\n[OFFSET:${offset}]`)
      expect(lines.map((line) => line.timeSeconds)).toEqual([
        Math.max(0, 10 - offset / 1000),
        Math.max(0, 20 - offset / 1000),
      ])
    },
  )

  it('uses the last valid offset and ignores malformed offsets without corrupting playback', () => {
    expect(
      parseLrc('[offset:1000]\n[00:10]hello\n[offset: -500 ]\n[offset:bad]\n[offset:1.5]'),
    ).toEqual([{ id: '0', timeSeconds: 10.5, text: 'hello' }])
  })

  it('keeps long-track timestamps and handles CR-only line endings', () => {
    expect(parseLrc('[99:59.99]before\r[100:00.00]boundary\r[120:00:123]later')).toEqual([
      { id: '0', timeSeconds: 5999.99, text: 'before' },
      { id: '1', timeSeconds: 6000, text: 'boundary' },
      { id: '2', timeSeconds: 7200.123, text: 'later' },
    ])
  })

  it('does not create invalid playback times from malformed or overflowing timestamps', () => {
    expect(parseLrc(`[00:60]bad\n[${'9'.repeat(310)}:00]bad\n[00:01]keep`)).toEqual([
      { id: '0', timeSeconds: 1, text: 'keep' },
    ])
  })
})
