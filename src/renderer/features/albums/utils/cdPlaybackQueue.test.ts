import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { buildCdPlaybackPlan, getNextCdPlaybackMode, type CdPlaybackMode } from './cdPlaybackQueue'

function createFakeTrack(id: number, title: string): TrackListItem {
  return {
    id,
    title,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    discNo: 1,
    trackNo: id,
    releaseDate: '2026',
    copyright: null,
    composer: null,
    durationSeconds: 180,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-09-26T00:00:00.000Z',
  }
}

describe('cdPlaybackQueue', () => {
  describe('getNextCdPlaybackMode', () => {
    it('cycles through all 4 modes in order', () => {
      expect(getNextCdPlaybackMode('catalog-sequential')).toBe('repeat-all')
      expect(getNextCdPlaybackMode('repeat-all')).toBe('shuffle')
      expect(getNextCdPlaybackMode('shuffle')).toBe('sequential')
      expect(getNextCdPlaybackMode('sequential')).toBe('catalog-sequential')
    })

    it('defaults to catalog-sequential for unknown mode', () => {
      expect(getNextCdPlaybackMode('unknown' as CdPlaybackMode)).toBe('catalog-sequential')
    })
  })

  describe('buildCdPlaybackPlan', () => {
    const albumA = {
      tracks: [createFakeTrack(1, 'A1'), createFakeTrack(2, 'A2')],
    }
    const albumB = {
      tracks: [createFakeTrack(3, 'B1'), createFakeTrack(4, 'B2'), createFakeTrack(5, 'B3')],
    }
    const albumC = {
      tracks: [createFakeTrack(6, 'C1')],
    }
    const albums = [albumA, albumB, albumC]

    it('returns null if track does not belong to any album', () => {
      const plan = buildCdPlaybackPlan(albums, 999, 'catalog-sequential')
      expect(plan).toBeNull()
    })

    it('builds catalog-sequential plan from starting album to end of catalog', () => {
      const plan = buildCdPlaybackPlan(albums, 4, 'catalog-sequential')
      expect(plan).not.toBeNull()
      expect(plan!.playbackMode).toBe('sequential')
      expect(plan!.queue.map((t) => t.id)).toEqual([3, 4, 5, 6])
      expect(plan!.shufflePool).toBeUndefined()
      expect(plan!.shuffleCycle).toBeUndefined()
    })

    it('builds catalog-sequential plan for the last album', () => {
      const plan = buildCdPlaybackPlan(albums, 6, 'catalog-sequential')
      expect(plan).not.toBeNull()
      expect(plan!.playbackMode).toBe('sequential')
      expect(plan!.queue.map((t) => t.id)).toEqual([6])
    })

    it('builds repeat-all plan limited to current album', () => {
      const plan = buildCdPlaybackPlan(albums, 4, 'repeat-all')
      expect(plan).not.toBeNull()
      expect(plan!.playbackMode).toBe('repeat-all')
      expect(plan!.queue.map((t) => t.id)).toEqual([3, 4, 5])
      expect(plan!.shufflePool).toBeUndefined()
    })

    it('builds sequential plan limited to current album', () => {
      const plan = buildCdPlaybackPlan(albums, 4, 'sequential')
      expect(plan).not.toBeNull()
      expect(plan!.playbackMode).toBe('sequential')
      expect(plan!.queue.map((t) => t.id)).toEqual([3, 4, 5])
      expect(plan!.shufflePool).toBeUndefined()
    })

    it('builds shuffle plan with album tracks as shuffle pool', () => {
      const plan = buildCdPlaybackPlan(albums, 4, 'shuffle')
      expect(plan).not.toBeNull()
      expect(plan!.playbackMode).toBe('shuffle')
      expect(plan!.queue.map((t) => t.id)).toEqual([3, 4, 5])
      expect(plan!.shufflePool?.map((t) => t.id)).toEqual([3, 4, 5])
      expect(plan!.shuffleCycle).toBe(true)
    })
  })
})
