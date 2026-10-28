import { expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { UNKNOWN_ALBUM_ARTIST, UNKNOWN_ALBUM_TITLE } from '@shared/utils/albumIdentity'
import { buildAlbumFacetOptions, buildFacetPlaylistName } from './facetOptions'

it('counts collaborations once and retains exact identities for same-title albums', () => {
  const options = buildAlbumFacetOptions(
    [
      { albumArtist: 'A; B', album: 'Shared' },
      { albumArtist: 'A; B', album: 'Shared' },
      { albumArtist: 'a; B', album: 'Shared' },
      { albumArtist: 'Other', album: 'Shared' },
    ] as TrackListItem[],
    '未知专辑',
    '未知艺人',
  )
  expect(options).toHaveLength(3)
  expect(options.find((option) => option.albumArtist === 'A; B')).toMatchObject({
    albumTitle: 'Shared',
    artistLabel: 'A & B',
    trackCount: 2,
  })
  expect(new Set(options.map((option) => option.key)).size).toBe(3)
})

it('separates display fallbacks from the query identity for missing tags', () => {
  const options = buildAlbumFacetOptions(
    [
      { albumArtist: null, artist: null, album: null },
      { albumArtist: null, artist: 'Fallback', album: '' },
      { albumArtist: 'Fallback', album: '未知专辑' },
    ] as TrackListItem[],
    '未知专辑',
    '未知艺人',
  )
  expect(options).toHaveLength(3)
  expect(options.find((option) => option.albumArtist === UNKNOWN_ALBUM_ARTIST)).toMatchObject({
    albumTitle: UNKNOWN_ALBUM_TITLE,
    label: '未知专辑',
    artistLabel: '未知艺人',
  })
  expect(
    options
      .filter((option) => option.albumArtist === 'Fallback')
      .map((option) => option.albumTitle),
  ).toEqual(expect.arrayContaining([UNKNOWN_ALBUM_TITLE, '未知专辑']))
})

it.each([['流派'.repeat(260), '艺术家'.repeat(260)], ['x'.repeat(511) + '😀'], ['😀'.repeat(400)]])(
  'bounds a default name without leaving a broken surrogate: %j',
  (...labels) => {
    const name = buildFacetPlaylistName(labels)
    expect(name.length).toBeLessThanOrEqual(512)
    expect(/[\uD800-\uDBFF]$/u.test(name)).toBe(false)
  },
)
