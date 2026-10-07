import { describe, expect, it } from 'vitest'
import { convertChineseText } from './chineseText'

describe('Chinese display text', () => {
  it('uses Taiwan glyphs and phrase context without translating regional vocabulary', () => {
    expect(convertChineseText('头发，出发，看着你，音乐软件', 'traditional')).toBe(
      '頭髮，出發，看著你，音樂軟件',
    )
    expect(convertChineseText('頭髮，出發，看著你，音樂軟件', 'simplified')).toBe(
      '头发，出发，看着你，音乐软件',
    )
  })
  it('preserves whitespace, punctuation and non-Chinese text', () => {
    const text = '  AC/DC — Café 😀\n꿈 あいうえお\t'
    expect(convertChineseText(text, 'traditional')).toBe(text)
    expect(convertChineseText(text, 'simplified')).toBe(text)
    expect(convertChineseText(null, 'traditional')).toBe('')
  })
  it('always converts the original source and remains correct after cache eviction', () => {
    const source = '苧與音樂'
    const traditional = convertChineseText(source, 'traditional')
    const simplified = convertChineseText(source, 'simplified')
    for (let i = 0; i < 2100; i++) convertChineseText(`歌曲 ${i}`, 'traditional')
    expect(convertChineseText(source, 'traditional')).toBe(traditional)
    expect(convertChineseText(source, 'simplified')).toBe(simplified)
  })
})
