import { describe, expect, it } from 'vitest'
import type { IAudioMetadata } from 'music-metadata'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import { verifyWrittenMetadata } from './verifyWrittenMetadata'

const fields = ['artistDisplay', 'albumArtistDisplay', 'genreDisplay'] as const
type MultiValueField = (typeof fields)[number]

describe('native multi-value verification', () => {
  it('verifies the same native genre and album-artist values used during scans', () => {
    const { expected, actual } = fixture('genreDisplay', 'Pop; Live', '')
    delete actual.common.genre
    expected.artistDisplay = 'A; B'
    actual.common.artists = ['A', 'B']
    actual.common.artist = 'A & B'
    expected.albumArtistDisplay = 'C; D'
    actual.native.iTunes = [
      { id: '----:com.apple.iTunes:GENRE', value: 'Pop' },
      { id: '----:com.apple.iTunes:GENRE', value: 'Live' },
      { id: '----:com.apple.iTunes:ALBUMARTISTS', value: 'C' },
      { id: '----:com.apple.iTunes:ALBUMARTISTS', value: 'D' },
    ]
    expect(() => verifyWrittenMetadata(expected, actual)).not.toThrow()
    actual.native.iTunes.pop()
    expect(() => verifyWrittenMetadata(expected, actual)).toThrow('Written audio tags do not match')
  })
})

function fixture(field: MultiValueField, expectedValue: string, actualValue: string) {
  const expected: EditableTrackMetadata = {
    trackId: 1,
    title: 'Title',
    artistDisplay: null,
    albumTitle: null,
    albumArtistDisplay: null,
    genreDisplay: null,
    year: null,
    releaseDate: null,
    [field]: expectedValue,
  }
  const actual: Pick<IAudioMetadata, 'common' | 'native'> = {
    native: {},
    common: {
      title: 'Title',
      track: { no: null, of: null },
      disk: { no: null, of: null },
      movementIndex: { no: null, of: null },
    },
  }
  if (field === 'artistDisplay') actual.common.artist = actualValue
  if (field === 'albumArtistDisplay') actual.common.albumartist = actualValue
  if (field === 'genreDisplay') actual.common.genre = [actualValue]
  return { expected, actual }
}

describe.each(fields)('verifyWrittenMetadata: %s', (field) => {
  it('accepts matching multi-values after trimming labels and removing empty parts', () => {
    const { expected, actual } = fixture(field, ' A; ; B ', 'A; B')
    expect(() => verifyWrittenMetadata(expected, actual)).not.toThrow()
  })

  it.each(['A;B', 'A；B', 'A;\tB'])('accepts matching atomic value %s', (value) => {
    const { expected, actual } = fixture(field, value, value)
    expect(() => verifyWrittenMetadata(expected, actual)).not.toThrow()
  })

  it.each(['A;B', 'A；B', 'A;\tB'])(
    'rejects a change between atomic value %s and multiple values in both directions',
    (value) => {
      for (const [expectedValue, actualValue] of [
        [value, 'A; B'],
        ['A; B', value],
      ] as const) {
        const { expected, actual } = fixture(field, expectedValue, actualValue)
        expect(() => verifyWrittenMetadata(expected, actual)).toThrow(
          'Written audio tags do not match',
        )
      }
    },
  )
})
