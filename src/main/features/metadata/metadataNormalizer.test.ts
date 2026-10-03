import { describe, expect, it } from 'vitest'
import type { IAudioMetadata } from 'music-metadata'
import { normalizeMetadata, resolveComposers, resolveGenres } from './metadataNormalizer'

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

  it('splits tight semicolon-separated genres without spaces into distinct genres', () => {
    expect(resolveGenres(audio({ genre: ['Cantopop;Live'] }))).toEqual(['Cantopop', 'Live'])
    expect(normalizeMetadata(audio({ genre: ['Cantopop;Live'] })).genre).toBe('Cantopop; Live')
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

  it('splits a semicolon-separated composer tag and trims spacing', () => {
    expect(normalizeMetadata(audio({ composer: ['A;B; C'] })).composer).toBe('A; B; C')
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
