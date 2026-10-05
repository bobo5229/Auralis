import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { i18n } from '@renderer/i18n'
import { auralis } from '@renderer/shared/ipc/client'
import { useArchiveMacData } from './useArchiveMacData'
import type { DailyAlbumStats } from '@shared/types/archive'

vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: {
    archive: {
      getListeningHeatmap: vi.fn().mockResolvedValue({
        year: 2026,
        firstRecordedYear: 2024,
        days: [
          { date: '2026-10-01', playCount: 5, durationSeconds: 600 },
          { date: '2025-05-20', playCount: 2, durationSeconds: 240 },
        ],
      }),
      getDailyAlbumStats: vi.fn().mockResolvedValue({
        date: '2026-10-01',
        items: [
          {
            key: 'album-1',
            albumKey: { albumArtist: 'Artist A', album: 'Album A' },
            title: 'Album A',
            artist: 'Artist A',
            artworkCacheKey: 'art-1',
            playCount: 10,
            durationSeconds: 1200,
          },
        ],
      }),
    },
  },
}))

describe('useArchiveMacData', () => {
  const fakeNow = () => new Date(2026, 9, 1, 12, 0, 0) // 2026-10-01
  afterEach(() => {
    i18n.global.locale.value = 'zh-Hans'
  })

  it('initializes with today and loads initial stats', async () => {
    const mockStats = vi.fn().mockResolvedValue({
      date: '2026-10-01',
      items: [
        {
          key: 'item-1',
          albumKey: { albumArtist: 'Artist 1', album: 'Album 1' },
          title: 'Album 1',
          artist: 'Artist 1',
          artworkCacheKey: 'art-1',
          playCount: 15,
          durationSeconds: 900,
        },
      ],
    } satisfies DailyAlbumStats)

    const scope = effectScope()
    let data!: ReturnType<typeof useArchiveMacData>

    scope.run(() => {
      data = useArchiveMacData({ now: fakeNow, getDailyAlbumStats: mockStats })
    })

    expect(data.selectedDate.value).toBe('2026-10-01')
    expect(data.selectedYear.value).toBe(2026)

    await nextTick()
    await new Promise((r) => setTimeout(r, 10))

    expect(data.items.value).toHaveLength(1)
    expect(data.selectedAlbumKey.value).toBe('item-1')
    expect(data.dayLoading.value).toBe(false)
    expect(data.dayError.value).toBeNull()

    const items = data.items.value
    const heatmapRequests = vi.mocked(auralis.archive.getListeningHeatmap).mock.calls.length
    const dailyRequests = mockStats.mock.calls.length
    i18n.global.locale.value = 'en'
    await nextTick()
    expect(data.calendarDays.value[0].label).toBe('Jan 1')
    expect(data.selectedDate.value).toBe('2026-10-01')
    expect(data.selectedAlbumKey.value).toBe('item-1')
    expect(data.items.value).toBe(items)
    expect(data.items.value[0].title).toBe('Album 1')
    expect(mockStats).toHaveBeenCalledTimes(dailyRequests)
    expect(auralis.archive.getListeningHeatmap).toHaveBeenCalledTimes(heatmapRequests)
    i18n.global.locale.value = 'zh-Hans'
    await nextTick()
    expect(data.calendarDays.value[0].label).toContain('1月')

    scope.stop()
  })

  it('handles empty date records cleanly', async () => {
    const mockStats = vi.fn().mockResolvedValue({
      date: '2026-10-01',
      items: [],
    } satisfies DailyAlbumStats)

    const scope = effectScope()
    let data!: ReturnType<typeof useArchiveMacData>

    scope.run(() => {
      data = useArchiveMacData({ now: fakeNow, getDailyAlbumStats: mockStats })
    })

    await nextTick()
    await new Promise((r) => setTimeout(r, 10))

    expect(data.items.value).toEqual([])
    expect(data.selectedAlbumKey.value).toBeNull()
    expect(data.dayLoading.value).toBe(false)
    expect(data.dayError.value).toBeNull()

    scope.stop()
  })

  it('handles error and supports retry', async () => {
    let callCount = 0
    const mockStats = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('Database disk I/O error')
      }
      return {
        date: '2026-10-01',
        items: [
          {
            key: 'item-retry',
            albumKey: null,
            title: 'Recovered Album',
            artist: 'Artist',
            artworkCacheKey: null,
            playCount: 1,
            durationSeconds: 100,
          },
        ],
      }
    })

    const scope = effectScope()
    let data!: ReturnType<typeof useArchiveMacData>

    scope.run(() => {
      data = useArchiveMacData({ now: fakeNow, getDailyAlbumStats: mockStats })
    })

    await nextTick()
    await new Promise((r) => setTimeout(r, 10))

    expect(data.dayError.value).toBe('无法读取当天专辑')
    const failedRequests = mockStats.mock.calls.length
    i18n.global.locale.value = 'en'
    await nextTick()
    expect(data.dayError.value).toBe('Could not load albums for this day')
    expect(mockStats).toHaveBeenCalledTimes(failedRequests)
    i18n.global.locale.value = 'zh-Hans'
    expect(data.items.value).toEqual([])

    // Retry
    data.retryDay('2026-10-01')
    await nextTick()
    await new Promise((r) => setTimeout(r, 10))

    expect(data.dayError.value).toBeNull()
    expect(data.items.value).toHaveLength(1)
    expect(data.selectedAlbumKey.value).toBe('item-retry')

    scope.stop()
  })

  it('ignores outdated response if user switches date quickly', async () => {
    let resolveFirst!: (val: DailyAlbumStats) => void
    const mockStats = vi.fn().mockImplementation((date: string) => {
      if (date === '2026-10-01') {
        return new Promise<DailyAlbumStats>((resolve) => {
          resolveFirst = resolve
        })
      }
      return Promise.resolve({
        date: '2026-09-30',
        items: [
          {
            key: 'item-fast',
            albumKey: null,
            title: 'Fast Target',
            artist: 'Artist',
            artworkCacheKey: null,
            playCount: 3,
            durationSeconds: 120,
          },
        ],
      })
    })

    const scope = effectScope()
    let data!: ReturnType<typeof useArchiveMacData>

    scope.run(() => {
      data = useArchiveMacData({ now: fakeNow, getDailyAlbumStats: mockStats })
    })

    // Quickly switch to previous day before first returns
    await data.selectDate('2026-09-30')
    await nextTick()
    await new Promise((r) => setTimeout(r, 10))

    expect(data.items.value[0]?.key).toBe('item-fast')

    // Now resolve first outdated request
    resolveFirst({
      date: '2026-10-01',
      items: [
        {
          key: 'item-outdated',
          albumKey: null,
          title: 'Outdated Target',
          artist: 'Artist',
          artworkCacheKey: null,
          playCount: 99,
          durationSeconds: 999,
        },
      ],
    })

    await nextTick()
    await new Promise((r) => setTimeout(r, 10))

    // Should still have 'item-fast', not overwritten by outdated request
    expect(data.items.value[0]?.key).toBe('item-fast')

    scope.stop()
  })

  it('preserves selectedAlbumKey on refresh if key is still present', async () => {
    let currentCall = 0
    const mockStats = vi.fn().mockImplementation(async () => {
      currentCall++
      return {
        date: '2026-10-01',
        items: [
          {
            key: 'album-1',
            albumKey: null,
            title: 'Album 1',
            artist: 'A1',
            artworkCacheKey: null,
            playCount: 10 + currentCall,
            durationSeconds: 100,
          },
          {
            key: 'album-2',
            albumKey: null,
            title: 'Album 2',
            artist: 'A2',
            artworkCacheKey: null,
            playCount: 5 + currentCall,
            durationSeconds: 80,
          },
        ],
      }
    })

    const scope = effectScope()
    let data!: ReturnType<typeof useArchiveMacData>

    scope.run(() => {
      data = useArchiveMacData({ now: fakeNow, getDailyAlbumStats: mockStats })
    })

    await nextTick()
    await new Promise((r) => setTimeout(r, 10))

    // Select second album
    data.selectAlbum('album-2')
    expect(data.selectedAlbumKey.value).toBe('album-2')

    // Refresh triggered
    await data.refresh()

    // selectedAlbumKey should still be 'album-2'
    expect(data.selectedAlbumKey.value).toBe('album-2')

    scope.stop()
  })

  it('does not update state after scope disposal', async () => {
    let resolveDisposed!: (val: DailyAlbumStats) => void
    const mockStats = vi.fn().mockImplementation(() => {
      return new Promise<DailyAlbumStats>((resolve) => {
        resolveDisposed = resolve
      })
    })

    const scope = effectScope()
    let data!: ReturnType<typeof useArchiveMacData>

    scope.run(() => {
      data = useArchiveMacData({ now: fakeNow, getDailyAlbumStats: mockStats })
    })

    // Stop scope before promise resolves
    scope.stop()

    resolveDisposed({
      date: '2026-10-01',
      items: [
        {
          key: 'item-after-dispose',
          albumKey: null,
          title: 'Title',
          artist: 'Artist',
          artworkCacheKey: null,
          playCount: 1,
          durationSeconds: 10,
        },
      ],
    })

    await nextTick()
    await new Promise((r) => setTimeout(r, 10))

    expect(data.items.value).toEqual([])
  })
})
