import { describe, expect, it } from 'vitest'
import {
  areTrackIdSequencesEqual,
  resolveLibraryViewportRestoreAction,
  type LibraryViewportRestore,
} from './libraryViewportRestore'

const captured: LibraryViewportRestore = {
  scrollTop: 4200,
  firstVisibleTrackId: 105,
  scrollGeneration: 7,
}

function base() {
  return {
    captured,
    currentScrollGeneration: 7,
    previousTrackIds: [101, 102, 103, 104, 105, 106],
    nextTrackIds: [101, 102, 103, 104, 105, 106],
    hasTrack: (id: number) => id === 105,
  }
}

describe('resolveLibraryViewportRestoreAction', () => {
  it('writes back the captured scrollTop when the ordered sequence is unchanged', () => {
    expect(resolveLibraryViewportRestoreAction(base())).toEqual({
      type: 'keep-scroll-top',
      scrollTop: 4200,
    })
  })

  it('abandons the restore when the user scrolled during the refresh', () => {
    const input = { ...base(), currentScrollGeneration: 8 }
    expect(resolveLibraryViewportRestoreAction(input)).toEqual({ type: 'no-op' })
  })

  it('scrolls the surviving first visible track when the sequence changed', () => {
    const input = {
      ...base(),
      nextTrackIds: [101, 102, 103, 104, 105, 106, 107],
      hasTrack: (id: number) => id === 105,
    }
    expect(resolveLibraryViewportRestoreAction(input)).toEqual({
      type: 'scroll-to-track',
      trackId: 105,
    })
  })

  it('never falls back to the playing track: no viewport candidate means no-op', () => {
    const input = {
      ...base(),
      captured: { ...captured, firstVisibleTrackId: null },
      nextTrackIds: [101, 102, 103, 104, 106],
      hasTrack: () => true,
    }
    expect(resolveLibraryViewportRestoreAction(input)).toEqual({ type: 'no-op' })
  })

  it('does not scroll when the first visible track is gone from the new list', () => {
    const input = {
      ...base(),
      nextTrackIds: [101, 102, 103, 104, 106],
      hasTrack: () => false,
    }
    expect(resolveLibraryViewportRestoreAction(input)).toEqual({ type: 'no-op' })
  })
})

describe('areTrackIdSequencesEqual', () => {
  it('accepts identical ordered sequences', () => {
    expect(areTrackIdSequencesEqual([1, 2, 3], [1, 2, 3])).toBe(true)
  })

  it('rejects different lengths', () => {
    expect(areTrackIdSequencesEqual([1, 2], [1, 2, 3])).toBe(false)
  })

  it('rejects reordered sequences', () => {
    expect(areTrackIdSequencesEqual([1, 2, 3], [1, 3, 2])).toBe(false)
  })
})
