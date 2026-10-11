import { describe, expect, it } from 'vitest'
import {
  LibraryNavigationViewportStore,
  resolveNavigationScrollTop,
  type LibraryNavigationViewport,
} from './libraryNavigationViewport'

const position: LibraryNavigationViewport = {
  scrollTop: 508,
  viewMode: 'flat',
  anchorTrackIds: [11, 12, 10],
  anchorOffset: 12,
  anchorRowHeight: 48,
}

describe('library navigation viewport', () => {
  it('isolates all songs, playlist ids and smart playlist ids within a renderer session', () => {
    const store = new LibraryNavigationViewportStore()
    store.save({ kind: 'library' }, position)
    store.save({ kind: 'playlist', id: 1 }, { ...position, scrollTop: 120 })
    store.save({ kind: 'smart-playlist', id: 1 }, { ...position, scrollTop: 240 })
    expect(store.get({ kind: 'library' })?.scrollTop).toBe(508)
    expect(store.get({ kind: 'playlist', id: 1 })?.scrollTop).toBe(120)
    expect(store.get({ kind: 'smart-playlist', id: 1 })?.scrollTop).toBe(240)
    expect(store.get({ kind: 'playlist', id: 2 })).toBeUndefined()
    expect(new LibraryNavigationViewportStore().get({ kind: 'library' })).toBeUndefined()
  })

  it('keeps the last valid record through loading, empty and detached captures', () => {
    const store = new LibraryNavigationViewportStore()
    store.save({ kind: 'library' }, position)
    store.save({ kind: 'library' }, null)
    expect(store.get({ kind: 'library' })).toEqual(position)
  })

  it('preserves row fraction after layout changes and clamps only to the available scroll range', () => {
    expect(
      resolveNavigationScrollTop(position, {
        viewMode: 'flat',
        anchorTop: 648,
        rowHeight: 60,
        headerHeight: 32,
        maxScrollTop: 5000,
      }),
    ).toBe(631)
    expect(
      resolveNavigationScrollTop(position, {
        viewMode: 'flat',
        anchorTop: null,
        rowHeight: 48,
        headerHeight: 32,
        maxScrollTop: 200,
      }),
    ).toBe(200)
  })
})
