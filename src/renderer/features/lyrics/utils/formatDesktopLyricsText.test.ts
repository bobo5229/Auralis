import { describe, expect, it } from 'vitest'
import { convertDesktopLyricsText, formatDesktopLyricsText } from './formatDesktopLyricsText'

describe('formatDesktopLyricsText', () => {
  it('returns an empty string unchanged', () => {
    expect(formatDesktopLyricsText('')).toBe('')
  })

  it('returns simplified text unchanged when the desktop lyrics font is not ready', () => {
    expect(formatDesktopLyricsText('国')).toBe('国')
  })
})

describe('convertDesktopLyricsText', () => {
  it('leaves non-CJK text unchanged', () => {
    expect(convertDesktopLyricsText('Hello 123', () => true)).toBe('Hello 123')
    expect(convertDesktopLyricsText('Hello 123', () => false)).toBe('Hello 123')
  })

  it('converts simplified CJK when every converted glyph exists', () => {
    expect(convertDesktopLyricsText('国', () => true)).toBe('國')
  })

  it('keeps simplified CJK when no converted glyph exists', () => {
    expect(convertDesktopLyricsText('国', () => false)).toBe('国')
  })

  it('converts only characters whose converted glyphs exist', () => {
    const result = convertDesktopLyricsText('国爱', (character) => character === '國')
    expect(result).toBe('國爱')
  })

  it('leaves traditional CJK unchanged', () => {
    expect(convertDesktopLyricsText('國', () => true)).toBe('國')
    expect(convertDesktopLyricsText('國', () => false)).toBe('國')
  })
})
