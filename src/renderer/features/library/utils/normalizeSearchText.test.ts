import { describe, expect, it } from 'vitest'
import { normalizeSearchText } from './normalizeSearchText'
import {
  legacySimplifiedCharacters,
  legacyTraditionalCharacters,
} from './normalizeSearchText.legacy.fixture'

describe('normalizeSearchText', () => {
  it('preserves all 565 unique mappings from the historical search table', () => {
    const traditional = [...legacyTraditionalCharacters]
    const simplified = [...legacySimplifiedCharacters]
    expect(traditional).toHaveLength(565)
    expect(simplified).toHaveLength(traditional.length)
    for (let i = 0; i < traditional.length; i += 1) {
      expect(normalizeSearchText(traditional[i]), traditional[i]).toBe(simplified[i])
      expect(normalizeSearchText(simplified[i]), simplified[i]).toBe(simplified[i])
    }
  })

  it.each([
    [null, ''],
    [undefined, ''],
    ['', ''],
    ['  \t\n', ''],
    ['  ＡLPHA 與夢  ', 'alpha 与梦'],
    ['ＡＣ／ＤＣ', 'ac/dc'],
    ['① Ｔrack', '1 track'],
    ['BÉYONCÉ', 'béyoncé'],
    ['BEYONCE\u0301', 'beyoncé'],
    ['ＡＬＢＵＭ\u00a0Ⅰ', 'album i'],
    ['😀音樂🎵', '😀音乐🎵'],
    ['お帰り', 'お帰り'],
    ['꿈', '꿈'],
    ['鬱可唯', '郁可唯'],
    ['夢裏花', '梦里花'],
    ['鐘聲', '钟声'],
    ['一隻貓', '一只猫'],
    ['蕭敬騰', '萧敬腾'],
  ])('normalizes %j to %j without changing other search rules', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected)
  })

  it.each([
    ['乾坤', '乾'],
    ['乾隆', '乾'],
    ['沈默是金', '沈'],
    ['藉口', '藉'],
    ['瞭解', '瞭'],
    ['著名', '著'],
    ['著作權', '著作'],
    ['看著你', '看著'],
    ['髮發', '髮'],
  ])('keeps the prefix %s / %s searchable without phrase context', (text, prefix) => {
    expect(normalizeSearchText(text).startsWith(normalizeSearchText(prefix))).toBe(true)
  })

  it.each([
    ['滑鼠', '鼠标'],
    ['軟體', '软件'],
    ['妳好', '你好'],
    ['看著', '看着'],
  ])('keeps %s and %s distinct rather than expanding vocabulary', (left, right) => {
    expect(normalizeSearchText(left)).not.toBe(normalizeSearchText(right))
  })

  it('performs only one character pass on original metadata', () => {
    // Upstream 1.4.2 maps 薴 -> 苧 and 苧 -> 苎; do not recursively fold keys.
    expect(normalizeSearchText('薴')).toBe('苧')
    expect(normalizeSearchText('苧')).toBe('苎')
  })
})
