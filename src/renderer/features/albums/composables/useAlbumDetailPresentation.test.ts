import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { useAlbumDetailPresentation } from './useAlbumDetailPresentation'

vi.mock('vue-i18n', async () => {
  const { ref } = await import('vue')
  return {
    useI18n: () => ({
      locale: ref('en-US'),
      t: (key: string, params: Record<string, unknown> = {}) => JSON.stringify({ key, ...params }),
    }),
  }
})

function track(id: number, patch: Partial<TrackListItem> = {}): TrackListItem {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNo: id,
    discNo: 1,
    releaseDate: null,
    copyright: null,
    composer: null,
    durationSeconds: 180,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }
}

describe('useAlbumDetailPresentation', () => {
  it('deduplicates genres per track and orders by frequency with stable ties', () => {
    const tracks = ref([
      track(1, { genre: 'Rock; Rock; Jazz' }),
      track(2, { genre: 'Jazz; Pop' }),
      track(3, { genre: 'POP' }),
    ])
    const state = useAlbumDetailPresentation(tracks, ref(null))
    expect(state.albumGenrePills.value).toEqual(['Jazz', 'Pop', 'Rock'])
    tracks.value = []
    expect(state.albumGenrePills.value).toEqual([])
  })

  it('updates totals when tracks change and keeps singular play labels', () => {
    const tracks = ref([track(1, { durationSeconds: 61, playCount: 1 })])
    const state = useAlbumDetailPresentation(tracks, ref(null))
    expect(state.metricsTrackCount.value).toBe(1)
    expect(state.metricsTotalDuration.value).toBe('1\u52061\u79d2')
    expect(JSON.parse(state.metricsPlaysLabel.value)).toEqual({
      key: 'albums.detail.metrics.playsUnitOne',
      count: 1,
    })
    tracks.value = [
      track(2, { durationSeconds: 1800, playCount: 3 }),
      track(3, { durationSeconds: null }),
    ]
    expect(state.metricsTrackCount.value).toBe(2)
    expect(JSON.parse(state.metricsTotalTime.value)).toEqual({
      key: 'albums.detail.metrics.hoursUnit',
      hours: '1.5',
    })
    expect(JSON.parse(state.metricsPlaysLabel.value)).toEqual({
      key: 'albums.detail.metrics.playsUnit',
      count: 3,
    })
  })

  it('hides disc headings for one disc and groups multiple discs without reordering tracks', () => {
    const tracks = ref([track(1, { discNo: null }), track(2)])
    const state = useAlbumDetailPresentation(tracks, ref(null))
    expect(state.albumDiscGroups.value.map((group) => group.discNo)).toEqual([null])
    tracks.value.push(track(3, { discNo: 2 }))
    expect(
      state.albumDiscGroups.value.map((group) => ({
        disc: group.discNo,
        ids: group.tracks.map((item) => item.id),
      })),
    ).toEqual([
      { disc: 1, ids: [1, 2] },
      { disc: 2, ids: [3] },
    ])
    tracks.value = []
    expect(state.albumDiscGroups.value).toEqual([])
  })

  it('uses preview dates and removes the legal line when metadata and preview are empty', () => {
    const tracks = ref([track(1, { copyright: ' Example ' })])
    const preview = ref<string | null>('2025-08-01')
    const state = useAlbumDetailPresentation(tracks, preview)
    expect(state.albumReleaseYear.value).toBe('2025')
    expect(state.heroLegalLine.value).toBe('Example \u00b7 2025-08-01')
    tracks.value = [track(1, { releaseDate: '2026-09-22' })]
    expect(state.albumReleaseYear.value).toBe('2026')
    tracks.value = []
    preview.value = null
    expect(state.heroLegalLine.value).toBeNull()
    expect(JSON.parse(state.albumReleaseYear.value).key).toBe('albums.detail.unknownYear')
  })
})
