import { describe, expect, it } from 'vitest'
import type { SmartPlaylistRule } from '@shared/types/smartPlaylist'
import { assertValidSmartPlaylistRule } from './smartPlaylistService'

describe('assertValidSmartPlaylistRule', () => {
  it('accepts custom recent frequent days and rejects malformed preset rules', () => {
    expect(() =>
      assertValidSmartPlaylistRule({
        preset: 'recentFrequent',
        days: 30,
        startDate: '2026-01-01',
      } as never),
    ).toThrow(/预设/)
    expect(() => assertValidSmartPlaylistRule({ preset: 'recentFrequent', days: 12 })).not.toThrow()
    expect(() => assertValidSmartPlaylistRule({ preset: 'recentFrequent', days: 0 })).toThrow(
      /正整数/,
    )
    expect(() => assertValidSmartPlaylistRule({ preset: 'unknown', days: 30 } as never)).toThrow(
      /预设/,
    )
    expect(() => assertValidSmartPlaylistRule({ preset: 'recentFrequent' } as never)).toThrow(
      /正整数/,
    )
    expect(() =>
      assertValidSmartPlaylistRule({
        preset: 'recentFrequent',
        days: 30,
        conditions: [],
      } as never),
    ).toThrow(/预设/)
  })

  it('rejects unsupported field and operator combinations', () => {
    expect(() =>
      assertValidSmartPlaylistRule({
        expression: {
          type: 'predicate',
          field: 'genre',
          operator: 'addedBefore',
          value: '30 days ago',
        },
      }),
    ).toThrow(/不支持操作符/)
    expect(() =>
      assertValidSmartPlaylistRule({
        expression: { type: 'predicate', field: 'added', operator: 'has', value: 'ambient' },
      }),
    ).toThrow(/ADDED/)
    expect(() =>
      assertValidSmartPlaylistRule({
        expression: {
          type: 'predicate',
          field: 'mood' as never,
          operator: 'has',
          value: 'ambient',
        },
      }),
    ).toThrow(/不支持的查询字段/)
  })

  it('rejects a rule that is not a usable representation', () => {
    expect(() => assertValidSmartPlaylistRule({} as SmartPlaylistRule)).toThrow(
      /无效的智能歌单规则/,
    )
    expect(() => assertValidSmartPlaylistRule({ conditions: [] })).toThrow(/不能为空/)
  })
})
