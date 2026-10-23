import { describe, expect, it } from 'vitest'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import { createLibraryMetadataSaveCommit } from './libraryMetadataSaveCommit'

const seed: EditableTrackMetadata = {
  trackId: 1,
  title: 'Original',
  artistDisplay: null,
  albumTitle: null,
  albumArtistDisplay: null,
  genreDisplay: null,
  year: null,
  releaseDate: null,
}
describe('library metadata commit record', () => {
  it('compares an unchanged form with its original seed until publication', () => {
    const save = createLibraryMetadataSaveCommit()
    expect(save.current).toBeNull()
    expect(save.isUnchanged({ ...seed }, seed)).toBe(true)
    expect(save.isUnchanged({ ...seed, title: 'Edited' }, seed)).toBe(false)
  })
  it('compares a refresh retry against a copy of the confirmed disk values', () => {
    const save = createLibraryMetadataSaveCommit()
    const metadata = { ...seed, title: 'Edited' }
    save.beginWrite(1)
    save.recordCommitted(metadata, { ok: true, libraryRevision: 'revision-1' })
    metadata.title = 'Modified again'
    expect(save.current).toEqual({
      metadata: { ...seed, title: 'Edited' },
      libraryRevision: 'revision-1',
    })
    expect(save.isUnchanged({ ...seed, title: 'Edited' }, seed)).toBe(true)
    expect(save.isUnchanged(metadata, seed)).toBe(false)
  })
  it('retains uncertainty across dialog resets and isolates it by track ID', () => {
    const save = createLibraryMetadataSaveCommit()
    save.beginWrite(1)
    save.reset()
    expect(save.isUnchanged(seed, seed)).toBe(false)
    expect(save.isUnchanged({ ...seed, trackId: 2 }, { ...seed, trackId: 2 })).toBe(true)
    save.recordCommitted(seed, undefined)
    expect(save.isUnchanged(seed, seed)).toBe(true)
  })
  it.each([undefined, null, {}, { ok: true }, { ok: true, libraryRevision: 7 }])(
    'accepts existing unversioned success responses: %j',
    (result) => {
      const save = createLibraryMetadataSaveCommit()
      save.recordCommitted(seed, result)
      expect(save.current?.libraryRevision).toBeUndefined()
      expect(save.current?.metadata).toEqual(seed)
    },
  )
  it('clears only the committed baseline when an editing session closes', () => {
    const save = createLibraryMetadataSaveCommit()
    save.recordCommitted({ ...seed, title: 'Edited' }, { ok: true, libraryRevision: 'old' })
    save.reset()
    expect(save.current).toBeNull()
    expect(save.isUnchanged(seed, seed)).toBe(true)
  })
})
