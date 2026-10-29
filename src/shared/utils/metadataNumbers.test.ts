import { describe, expect, it } from 'vitest'
import { validateMetadataChanges } from './metadataNumbers'
import type { EditableTrackMetadata } from '../types/libraryScan'
const base: EditableTrackMetadata = {
  trackId: 1,
  title: 'Title',
  artistDisplay: null,
  albumTitle: null,
  albumArtistDisplay: null,
  genreDisplay: null,
  year: null,
  releaseDate: null,
  editToken: 'token',
  trackNo: 2,
  trackTotal: 12,
  discNo: 1,
  discTotal: 2,
}
describe('metadata number combinations', () => {
  it.each([
    [{ trackTotal: 70000 }, { trackNo: 3 }],
    [{ trackNo: -1 }, { trackTotal: 12 }],
    [{ discTotal: 70000 }, { discNo: 2 }],
    [{ discNo: 1.5 }, { discTotal: 3 }],
    [{ trackTotal: 0 }, { trackNo: null }],
  ])('validates both components of a touched pair %j', (before, changes) => {
    expect(() => validateMetadataChanges({ ...base, ...before }, changes)).toThrow(
      'between 1 and 65535',
    )
  })
  it('retains invalid pairs that were not touched', () => {
    expect(() =>
      validateMetadataChanges({ ...base, trackNo: -1, trackTotal: 70000 }, { title: 'New' }),
    ).not.toThrow()
    expect(() =>
      validateMetadataChanges({ ...base, trackNo: -1, trackTotal: 70000 }, { discTotal: 3 }),
    ).not.toThrow()
  })
  it('allows repairing and explicitly clearing invalid pairs', () => {
    expect(() =>
      validateMetadataChanges(
        { ...base, trackNo: -1, trackTotal: 70000 },
        { trackNo: 3, trackTotal: 12 },
      ),
    ).not.toThrow()
    expect(() =>
      validateMetadataChanges(
        { ...base, trackNo: -1, trackTotal: 70000 },
        { trackNo: null, trackTotal: null },
      ),
    ).not.toThrow()
    expect(() => validateMetadataChanges(base, { trackNo: 13 })).toThrow('Number exceeds total')
  })
})
