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

    expect(parseLrc(raw)).toEqual([{ id: '0', timeSeconds: 1, text: 'keep' }])
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
})
