import { describe, expect, it } from 'vitest'
import { normalizeEditableMetadata } from './editableMetadataValidation'

describe('normalizeEditableMetadata', () => {
  it('uses canonical multi-values without changing punctuation in scalar fields', () => {
    const request = {
      trackId: 1,
      title: ' A; B ',
      artistDisplay: ' A;  ; B; a ',
      albumTitle: ' C; D ',
      albumArtistDisplay: 'AC/DC; Tyler, The Creator',
      genreDisplay: 'Pop; pop; Live',
      year: 2026,
      releaseDate: ' 2026-10-03 ',
    }
    expect(normalizeEditableMetadata(request)).toEqual({
      ...request,
      title: 'A; B',
      artistDisplay: 'A; B',
      albumTitle: 'C; D',
      genreDisplay: 'Pop; Live',
      releaseDate: '2026-10-03',
    })
    expect(request.artistDisplay).toBe(' A;  ; B; a ')
  })

  it.each(['A;B', 'A；B', 'A/B', 'A, B', 'A & B'])('preserves %s as a single value', (value) => {
    const normalized = normalizeEditableMetadata({
      trackId: 1,
      title: null,
      artistDisplay: value,
      albumTitle: null,
      albumArtistDisplay: value,
      genreDisplay: value,
      year: null,
      releaseDate: null,
    })
    expect(normalized).toMatchObject({
      artistDisplay: value,
      albumArtistDisplay: value,
      genreDisplay: value,
    })
  })
})
