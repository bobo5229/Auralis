import { effectScope, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { LIBRARY_LAYOUT_METRICS } from '../constants/libraryLayoutMetrics'
import {
  createLibraryFlatColumnLayoutController,
  createLibraryFlatColumnPreferenceStore,
} from '../composables/useLibraryFlatColumnLayout'
import {
  LIBRARY_FLAT_COLUMN_PREFERENCE_STORAGE_KEY,
  LIBRARY_FLAT_COLUMN_PREFERENCE_VERSION,
  getVisibleLibraryFlatColumnIds,
  parseLibraryFlatColumnPreferences,
  resolveLibraryFlatColumnLayout,
  resizeAdjacentLibraryColumns,
  type LibraryFlatColumnWidths,
} from './libraryFlatColumnLayout'

describe('library flat column layout', () => {
  it('keeps the normal wide artist width and hides columns at the established breakpoints', () => {
    const wide = resolveLibraryFlatColumnLayout({ containerWidth: 900, showPlayCount: false })
    expect(wide.widths.artist).toBe(300)
    expect(getVisibleLibraryFlatColumnIds(560, false)).not.toContain('album')
    expect(getVisibleLibraryFlatColumnIds(440, false)).not.toContain('artist')
  })

  it('preserves the saved artwork width across normal and play-count layouts when space allows', () => {
    const preferredWidths = { artwork: 120 }
    const normal = resolveLibraryFlatColumnLayout({
      containerWidth: 900,
      showPlayCount: false,
      preferredWidths,
    })
    const counted = resolveLibraryFlatColumnLayout({
      containerWidth: 900,
      showPlayCount: true,
      preferredWidths,
    })

    expect(normal.widths.artwork).toBe(120)
    expect(counted.widths.artwork).toBe(120)
    expect(normal.rowHeight).toBe(124)
    expect(counted.rowHeight).toBe(124)
    expect(counted.visibleColumnIds).toContain('play-count')
  })

  it('fits narrow layouts without negative widths or horizontal overflow', () => {
    for (const width of [400, 360, 280, 200]) {
      const layout = resolveLibraryFlatColumnLayout({
        containerWidth: width,
        showPlayCount: true,
        preferredWidths: { artwork: 120, title: 64, artist: 64, album: 64 },
      })
      const total = layout.visibleColumnIds.reduce((sum, column) => sum + layout.widths[column], 0)
      expect(layout.widths.artwork).toBeGreaterThanOrEqual(0)
      expect(
        layout.visibleColumnIds.every((column) => Number.isFinite(layout.widths[column])),
      ).toBe(true)
      expect(total).toBeCloseTo(layout.availableWidth)
      expect(layout.rowHeight).toBeGreaterThanOrEqual(layout.widths.artwork)
    }
  })

  it('keeps the default row height while using the artwork width plus its 4px inset', () => {
    const defaults = resolveLibraryFlatColumnLayout({ containerWidth: 960, showPlayCount: false })
    expect(defaults.widths.artwork).toBe(LIBRARY_LAYOUT_METRICS.flatArtworkSize)
    expect(defaults.rowHeight).toBe(LIBRARY_LAYOUT_METRICS.flatRowHeight)
  })

  it('resizes only adjacent visible columns and conserves their combined width', () => {
    const widths: LibraryFlatColumnWidths = {
      artwork: 44,
      title: 240,
      artist: 300,
      album: 240,
      'play-count': 80,
      duration: 56,
    }
    const resized = resizeAdjacentLibraryColumns({
      widths,
      visibleColumnIds: ['artwork', 'title', 'artist', 'album', 'duration'],
      leftColumn: 'title',
      rightColumn: 'artist',
      delta: 45,
    })

    expect(resized.title + resized.artist).toBe(widths.title + widths.artist)
    expect(resized.title).toBe(285)
    expect(resized.artist).toBe(255)
    expect(resized.artwork).toBe(widths.artwork)
    expect(resized.album).toBe(widths.album)
    expect(resized['play-count']).toBe(widths['play-count'])
  })

  it('stops at minimum widths and rejects hidden/non-adjacent handles', () => {
    const widths: LibraryFlatColumnWidths = {
      artwork: 44,
      title: 64,
      artist: 70,
      album: 240,
      'play-count': 80,
      duration: 56,
    }
    const atLimit = resizeAdjacentLibraryColumns({
      widths,
      visibleColumnIds: ['artwork', 'title', 'artist', 'duration'],
      leftColumn: 'title',
      rightColumn: 'artist',
      delta: 80,
    })
    expect(atLimit.title).toBe(70)
    expect(atLimit.artist).toBe(64)
    expect(
      resizeAdjacentLibraryColumns({
        widths,
        visibleColumnIds: ['artwork', 'title', 'artist', 'duration'],
        leftColumn: 'title',
        rightColumn: 'album',
        delta: 20,
      }),
    ).toEqual(widths)
  })

  it('validates versioned storage and preserves hidden values when committing visible columns', () => {
    expect(parseLibraryFlatColumnPreferences('broken')).toEqual({})
    expect(parseLibraryFlatColumnPreferences(JSON.stringify({ version: 99, widths: {} }))).toEqual(
      {},
    )
    expect(
      parseLibraryFlatColumnPreferences(
        JSON.stringify({ version: 1, widths: { artwork: 120, artist: -4, unknown: 10 } }),
      ),
    ).toEqual({ artwork: 120 })

    const stored = new Map<string, string>([
      [
        LIBRARY_FLAT_COLUMN_PREFERENCE_STORAGE_KEY,
        JSON.stringify({ version: 1, widths: { album: 500 } }),
      ],
    ])
    const storage = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    }
    const store = createLibraryFlatColumnPreferenceStore(storage)
    store.commit(
      { artwork: 44, title: 220, artist: 300, album: 240, 'play-count': 80, duration: 56 },
      ['artwork', 'title', 'artist', 'duration'],
    )

    expect(store.widths.value.album).toBe(500)
    expect(JSON.parse(stored.get(LIBRARY_FLAT_COLUMN_PREFERENCE_STORAGE_KEY)!).version).toBe(
      LIBRARY_FLAT_COLUMN_PREFERENCE_VERSION,
    )
  })

  it('keeps session widths when storage writes fail and reports the failure', () => {
    const errors: unknown[] = []
    const store = createLibraryFlatColumnPreferenceStore(
      {
        getItem: () => null,
        setItem: () => {
          throw new Error('blocked')
        },
      },
      (cause) => errors.push(cause),
    )
    const widths: LibraryFlatColumnWidths = {
      artwork: 44,
      title: 220,
      artist: 300,
      album: 240,
      'play-count': 80,
      duration: 56,
    }

    store.commit(widths, ['artwork', 'title', 'duration'])
    expect(store.widths.value.artwork).toBe(44)
    expect(store.widths.value.title).toBe(220)
    expect(errors).toHaveLength(1)
  })

  it('commits a narrow-window text pair without persisting auto-fit widths or jumping on release', async () => {
    const initialPreference = { artwork: 120, artist: 300, album: 240 }
    const stored = new Map<string, string>([
      [
        LIBRARY_FLAT_COLUMN_PREFERENCE_STORAGE_KEY,
        JSON.stringify({
          version: LIBRARY_FLAT_COLUMN_PREFERENCE_VERSION,
          widths: initialPreference,
        }),
      ],
    ])
    const preferenceStore = createLibraryFlatColumnPreferenceStore({
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
    })
    const containerWidth = ref(400)
    const showPlayCount = ref(true)
    const scope = effectScope()
    const controller = scope.run(() =>
      createLibraryFlatColumnLayoutController({
        containerWidth,
        showPlayCount,
        preferenceStore,
      }),
    )!

    const initial = controller.layout.value
    expect(initial.widths.artwork).toBe(120)
    const resized = resizeAdjacentLibraryColumns({
      widths: initial.widths,
      visibleColumnIds: initial.visibleColumnIds,
      leftColumn: 'title',
      rightColumn: 'play-count',
      delta: 16,
    })
    controller.preview(resized)
    controller.commit(resized, ['title', 'play-count'])

    expect(controller.layout.value.widths).toMatchObject({
      artwork: 120,
      title: 120,
      'play-count': 64,
    })
    expect(preferenceStore.widths.value).toMatchObject({
      artwork: 120,
      title: 120,
      'play-count': 64,
    })
    expect(preferenceStore.widths.value.artist).toBe(300)
    expect(preferenceStore.widths.value.album).toBe(240)

    containerWidth.value = 1400
    await nextTick()
    expect(controller.layout.value.widths.artwork).toBe(120)
    expect(controller.layout.value.widths.artist).toBeGreaterThan(300)
    expect(controller.layout.value.widths.album).toBeGreaterThan(240)

    containerWidth.value = 400
    await nextTick()
    expect(controller.layout.value.widths).toMatchObject({
      artwork: 120,
      title: 120,
      'play-count': 64,
    })
    scope.stop()
  })
})
