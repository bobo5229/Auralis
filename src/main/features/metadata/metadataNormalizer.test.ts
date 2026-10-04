import { describe, expect, it } from 'vitest'
import type { IAudioMetadata } from 'music-metadata'
import {
  normalizeMetadata,
  resolveArtists,
  resolveAlbumArtists,
  resolveComposers,
  resolveGenres,
} from './metadataNormalizer'

function audio(
  common: Partial<IAudioMetadata['common']> = {},
  native: IAudioMetadata['native'] = {},
): IAudioMetadata {
  return {
    format: { duration: 180, trackInfo: [], tagTypes: [] },
    native,
    quality: { warnings: [] },
    common: {
      track: { no: null, of: null },
      disk: { no: null, of: null },
      movementIndex: { no: null, of: null },
      title: 'Title',
      artist: 'Artist',
      album: 'Album',
      ...common,
    },
  }
}

describe('resolveGenres', () => {
  it('keeps a single genre unchanged', () => {
    expect(resolveGenres(audio({ genre: ['Cantopop'] }))).toEqual(['Cantopop'])
    expect(normalizeMetadata(audio({ genre: ['Cantopop'] })).genre).toBe('Cantopop')
  })

  it('splits semicolon-separated genres with spaces into distinct genres', () => {
    expect(resolveGenres(audio({ genre: ['Cantopop; Live'] }))).toEqual(['Cantopop', 'Live'])
    expect(normalizeMetadata(audio({ genre: ['Cantopop; Live'] })).genre).toBe('Cantopop; Live')
  })

  it('keeps semicolons without a following space inside one genre', () => {
    expect(resolveGenres(audio({ genre: ['Cantopop;Live'] }))).toEqual(['Cantopop;Live'])
    expect(normalizeMetadata(audio({ genre: ['Cantopop;Live'] })).genre).toBe('Cantopop;Live')
  })

  it('collects multiple native genre atoms and flattens them', () => {
    const metadata = audio(
      {},
      {
        iTunes: [
          { id: '----:com.apple.iTunes:GENRE', value: 'Electropop' },
          { id: '----:com.apple.iTunes:GENRE', value: 'Dance-Pop' },
        ],
      },
    )
    expect(resolveGenres(metadata)).toEqual(['Electropop', 'Dance-Pop'])
    expect(normalizeMetadata(metadata).genre).toBe('Electropop; Dance-Pop')
  })

  it('preserves slash compounds without splitting', () => {
    expect(resolveGenres(audio({ genre: ['R&B/Soul; Hip-Hop/Rap'] }))).toEqual([
      'R&B/Soul',
      'Hip-Hop/Rap',
    ])
    expect(normalizeMetadata(audio({ genre: ['R&B/Soul; Hip-Hop/Rap'] })).genre).toBe(
      'R&B/Soul; Hip-Hop/Rap',
    )
  })

  it('deduplicates case-insensitively while preserving first-seen casing', () => {
    expect(resolveGenres(audio({ genre: ['Pop', 'pop; Rock'] }))).toEqual(['Pop', 'Rock'])
  })

  it('returns empty array and null for missing or blank genres', () => {
    expect(resolveGenres(audio())).toEqual([])
    expect(normalizeMetadata(audio()).genre).toBeNull()
    expect(resolveGenres(audio({ genre: ['  ', ''] }))).toEqual([])
    expect(normalizeMetadata(audio({ genre: ['  ', ''] })).genre).toBeNull()
  })
})

describe('resolveComposers', () => {
  it('keeps a single composer unchanged', () => {
    expect(resolveComposers(audio({ composer: ['Johann Sebastian Bach'] }))).toEqual([
      'Johann Sebastian Bach',
    ])
    expect(normalizeMetadata(audio({ composer: ['Johann Sebastian Bach'] })).composer).toBe(
      'Johann Sebastian Bach',
    )
  })

  it('stores multiple composers as A; B; C without truncating', () => {
    const metadata = audio({
      composer: ['A', 'B', 'C', 'D', 'E', 'F'],
    })
    expect(resolveComposers(metadata)).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
    expect(normalizeMetadata(metadata).composer).toBe('A; B; C; D; E; F')
  })

  it('splits composer tags only on "; " and trims labels', () => {
    const metadata = audio({ composer: [' A;B; C '] })
    expect(resolveComposers(metadata)).toEqual(['A;B', 'C'])
    expect(normalizeMetadata(metadata).composer).toBe('A;B; C')
  })

  it('returns null when composer tags are missing or blank', () => {
    expect(normalizeMetadata(audio()).composer).toBeNull()
    expect(normalizeMetadata(audio({ composer: [] })).composer).toBeNull()
    expect(normalizeMetadata(audio({ composer: ['  ', ''] })).composer).toBeNull()
  })

  it('reads native composer tags when common.composer is empty', () => {
    const metadata = audio({}, { 'ID3v2.4': [{ id: 'TCOM', value: 'Bach; Mozart' }] })
    expect(normalizeMetadata(metadata).composer).toBe('Bach; Mozart')
  })

  it('does not fall back to the performing artist', () => {
    expect(normalizeMetadata(audio({ artist: 'Performer' })).composer).toBeNull()
  })
})

describe('multi-value artist normalization', () => {
  it('uses explicit artist lists without appending the combined display value', () => {
    const metadata = audio({
      artists: ['A', 'B'],
      artist: 'A & B',
      albumartists: ['C', 'D'],
      albumartist: 'C, D',
    })
    expect(resolveArtists(metadata)).toEqual(['A', 'B'])
    expect(resolveAlbumArtists(metadata)).toEqual(['C', 'D'])
    expect(normalizeMetadata(metadata)).toMatchObject({
      artistDisplay: 'A; B',
      albumArtistDisplay: 'C; D',
    })
  })

  it('uses repeated freeform MP4 tags for all five multi-value fields', () => {
    const metadata = audio(
      { artist: 'A & B', albumartist: 'C & D' },
      {
        iTunes: [
          { id: '----:com.apple.iTunes:ARTISTS', value: 'A' },
          { id: '----:com.apple.iTunes:ARTISTS', value: 'B' },
          { id: '----:com.apple.iTunes:ALBUMARTISTS', value: 'C' },
          { id: '----:com.apple.iTunes:ALBUMARTISTS', value: 'D' },
          { id: '----:com.apple.iTunes:GENRE', value: ['Pop', 'Live'] },
          { id: '----:com.apple.iTunes:COMPOSER', value: { text: ['E', 'F'] } },
          { id: 'cprt', value: ' Label; Other; label ' },
        ],
      },
    )
    expect(normalizeMetadata(metadata)).toMatchObject({
      artistDisplay: 'A; B',
      albumArtistDisplay: 'C; D',
      genre: 'Pop; Live',
      composer: 'E; F',
      copyright: 'Label; Other',
    })
  })

  it('keeps empty album-artist tags empty for verification and applies fallback only for display', () => {
    const metadata = audio({ artist: 'AC/DC; B' })
    expect(resolveAlbumArtists(metadata)).toEqual([])
    expect(normalizeMetadata(metadata).albumArtistDisplay).toBe('AC/DC; B')
  })
  it('splits artists and album artists only on "; " while deduplicating native entries', () => {
    const metadata = normalizeMetadata(
      audio({
        artists: [' A;B; C ', 'a;b', 'c'],
        artist: 'A;B; C',
        albumartists: [' D；E; F ', 'd；e', 'f'],
        albumartist: 'D；E; F',
      }),
    )
    expect(metadata.artists).toEqual(['A;B', 'C'])
    expect(metadata.artistDisplay).toBe('A;B; C')
    expect(metadata.albumArtists).toEqual(['D；E', 'F'])
    expect(metadata.albumArtistDisplay).toBe('D；E; F')
  })
})
