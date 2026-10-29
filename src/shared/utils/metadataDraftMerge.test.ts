import { describe, expect, it } from 'vitest'
import { mergeMetadataDraft } from './metadataDraftMerge'
import type { EditableTrackMetadata } from '../types/libraryScan'
const base: EditableTrackMetadata = {
  trackId: 1,
  title: 'Title',
  artistDisplay: 'A; B',
  albumTitle: 'Album',
  albumArtistDisplay: null,
  genreDisplay: null,
  year: 2026,
  releaseDate: '2026',
  editToken: 'old',
}
describe('metadata draft three-way reconciliation', () => {
  it('merges unrelated edits and renews credentials without losing the draft', () => {
    const result = mergeMetadataDraft(
      base,
      { ...base, albumTitle: 'New album', editToken: 'new' },
      { ...base, title: 'My title' },
    )
    expect(result.value).toMatchObject({
      title: 'My title',
      albumTitle: 'New album',
      editToken: 'new',
    })
    expect(result.conflicts).toEqual([])
  })
  it('requires a choice for divergent edits and preserves the user input', () => {
    const result = mergeMetadataDraft(
      base,
      { ...base, title: 'External' },
      { ...base, title: 'Mine' },
    )
    expect(result.conflicts).toEqual(['title'])
    expect(result.value.title).toBe('Mine')
  })
  it('treats normalized identical list changes as resolved and retains intentional empty values', () => {
    const result = mergeMetadataDraft(
      base,
      { ...base, artistDisplay: 'A; B; C', genreDisplay: 'Rock' },
      { ...base, artistDisplay: ' A; B; C ', title: null },
    )
    expect(result.conflicts).toEqual([])
    expect(result.value).toMatchObject({ title: null, genreDisplay: 'Rock' })
  })
})
