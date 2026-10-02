import { describe, expect, it } from 'vitest'
import type { SmartPlaylistRule } from '@shared/types/smartPlaylist'
import { assertValidSmartPlaylistRule } from './smartPlaylistService'
import { SmartPlaylistService } from './smartPlaylistService'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { SmartPlaylist } from '@shared/types/smartPlaylist'
import type { SmartPlaylistRepository } from '@main/repositories/smartPlaylistRepository'
import type { TrackRepository } from '@main/repositories/trackRepository'

describe('recent added album order', () => {
  function track(id: number, overrides: Partial<TrackListItem> = {}): TrackListItem {
    return {
      id,
      title: null,
      artist: 'Artist',
      albumArtist: 'Artist',
      album: 'A',
      discNo: 1,
      trackNo: 1,
      releaseDate: null,
      copyright: null,
      composer: null,
      durationSeconds: null,
      artworkCacheKey: null,
      genre: null,
      availability: 'available',
      playCount: 0,
      lastPlayedAt: null,
      createdAt: new Date(Date.now() - 1000).toISOString(),
      ...overrides,
    }
  }

  it.each<SmartPlaylistRule>([
    { preset: 'recentAdded', days: 30 },
    {
      expression: {
        type: 'predicate',
        field: 'added',
        operator: 'addedWithin',
        value: '30 days ago',
      },
    },
  ])('orders albums by newest addition and tracks by disc and track number: %j', (rule) => {
    const older = new Date(Date.now() - 86_400_000).toISOString()
    const tracks = [
      track(1, { trackNo: 3 }),
      track(2, { trackNo: 2, createdAt: older }),
      track(3, { trackNo: 1, discNo: 2 }),
      track(4, { trackNo: 1, discNo: null }),
      track(5, { trackNo: null }),
      track(6, { album: 'B', createdAt: older }),
      track(7, { albumArtist: 'Other', createdAt: older }),
      track(8, {
        album: 'Expired',
        createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
      }),
    ]
    const playlist: SmartPlaylist = {
      id: 1,
      name: '最近添加',
      rule,
      viewMode: 'cover',
      sortOrder: 0,
      createdAt: older,
      updatedAt: older,
    }
    const service = new SmartPlaylistService(
      { getById: () => playlist } as unknown as SmartPlaylistRepository,
      { getAll: () => tracks, getChangeToken: () => '1' } as unknown as TrackRepository,
    )
    expect(service.getDetail(1)?.tracks.map((item) => item.id)).toEqual([4, 2, 1, 5, 3, 7, 6])
    expect(tracks.map((item) => item.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

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
