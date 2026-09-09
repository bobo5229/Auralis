import { describe, expect, it } from 'vitest'
import type { SmartPlaylistRule } from '@shared/types/smartPlaylist'
import { assertValidSmartPlaylistRule } from './smartPlaylistService'

describe('assertValidSmartPlaylistRule', () => {
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
