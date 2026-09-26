import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { AlbumSummary } from '../types'
import {
  buildCdAlbumIndex,
  canShareCdIndexRow,
  cdAlbumFocusQuery,
  cdFocusBackTarget,
  cdIndexArtistOrder,
  cdIndexReleaseLabel,
  cdIndexReleaseOrder,
  findCdIndexAlbumRow,
  groupCdAlbumIndexArtists,
  isCdAlbumIndexSource,
  isSameAlbumTrack,
  layoutCdAlbumIndex,
  shouldShowCdFocusedPlayback,
  type CdIndexSharedRow,
} from './cdAlbumIndex'
import {
  clearCdIndexReturn,
  consumeCdIndexReturn,
  rememberCdIndexDeparture,
} from './cdAlbumIndexReturn'

function mockTrack(id: number): TrackListItem {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNo: id,
    discNo: 1,
    releaseDate: null,
    copyright: null,
    composer: null,
    durationSeconds: 180,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function album(
  albumArtist: string,
  title: string,
  releaseDate: string | null = null,
  trackCount = 0,
): AlbumSummary {
  return {
    key: `${albumArtist}\u0000${title}`,
    title,
    albumArtist,
    releaseDate,
    artworkCacheKey: null,
    tracks: Array.from({ length: trackCount }, (_, i) => mockTrack(i + 1)),
  }
}

describe('cd album index ordering', () => {
  it('buckets Chinese names by polyphonic pinyin and keeps the original name', () => {
    expect(cdIndexArtistOrder('音乐').letter).toBe('Y')
    expect(cdIndexArtistOrder('重庆').letter).toBe('C')
    expect(cdIndexArtistOrder('成长').sortKey.startsWith('cheng zhang')).toBe(true)
    expect(cdIndexArtistOrder('长江').sortKey.startsWith('chang jiang')).toBe(true)
    expect(cdIndexArtistOrder('周杰伦')).toMatchObject({ letter: 'Z', sortKey: 'zhou jie lun' })
    expect(cdIndexArtistOrder('Beatles').letter).toBe('B')
    expect(cdIndexArtistOrder('123乐队').letter).toBe('#')
    expect(cdIndexArtistOrder('Unknown Artist').letter).toBe('#')
    expect(cdIndexArtistOrder('Øystein').letter).toBe('#')
  })

  it('sorts artists by pinyin, then original name, with # last', () => {
    const rawAlbums = [
      album('周杰伦', '叶惠美', '2003-07-31'),
      album('Unknown Artist', 'Lost'),
      album('重庆', '早'),
      album('音乐', '晚'),
      album('Beatles', 'Abbey Road', '1969-09-26'),
      album('123乐队', '编号'),
      album('章伟', '同音'),
      album('张伟', '同音乙'),
    ]
    const grouped = groupCdAlbumIndexArtists(rawAlbums).map((g) => g.name)
    expect(grouped).toEqual([
      'Beatles',
      '重庆',
      '音乐',
      '张伟',
      '章伟',
      '周杰伦',
      '123乐队',
      'Unknown Artist',
    ])

    // Artists with more albums than columns use heading rows.
    const multiAlbums = [
      '周杰伦',
      'Unknown Artist',
      '重庆',
      '音乐',
      'Beatles',
      '123乐队',
      '章伟',
      '张伟',
    ].flatMap((name) => [
      album(name, 'A1'),
      album(name, 'A2'),
      album(name, 'A3'),
      album(name, 'A4'),
      album(name, 'A5'),
    ])
    const model = buildCdAlbumIndex(multiAlbums, 4)
    const artists = model.rows.filter((row) => row.type === 'heading').map((row) => row.artist)
    expect(artists).toEqual([
      'Beatles',
      '重庆',
      '音乐',
      '张伟',
      '章伟',
      '周杰伦',
      '123乐队',
      'Unknown Artist',
    ])
    expect(model.anchors.find((anchor) => anchor.letter === 'C')?.rowIndex).toBe(
      model.rows.findIndex((row) => row.type === 'heading' && row.artist === '重庆'),
    )
    expect(model.anchors.find((anchor) => anchor.letter === 'D')?.rowIndex).toBeNull()
    expect(model.anchors.find((anchor) => anchor.letter === '#')?.rowIndex).toBe(
      model.rows.findIndex((row) => row.type === 'heading' && row.artist === '123乐队'),
    )
  })

  it('sorts an artist by full release date and parks missing dates last', () => {
    const model = buildCdAlbumIndex(
      [
        album('周杰伦', '十一月', '2005-11-01'),
        album('周杰伦', '无日期'),
        album('周杰伦', '同年后作', '2000-06-01'),
        album('周杰伦', '仅年份', '2000'),
        album('周杰伦', '坏日期', '2000-13-01'),
        album('周杰伦', '同日乙', '2005-11-01'),
        album('周杰伦', '同日甲', '2005-11-01'),
      ],
      3,
    )
    const titles = model.rows
      .filter((row) => row.type === 'albums')
      .flatMap((row) => row.albums.map((item) => item.title))
    expect(titles).toEqual(['仅年份', '同年后作', '十一月', '同日甲', '同日乙', '坏日期', '无日期'])
    expect(cdIndexReleaseOrder('2000')).toBe('2000-01-01')
    expect(cdIndexReleaseOrder('2000-13-01')).toBeNull()
    expect(cdIndexReleaseLabel('2000-06-01')).toBe('2000-06-01')
    expect(cdIndexReleaseLabel('不久')).toBeNull()
  })

  it('moves letter anchors when the column count changes', () => {
    const albums = [
      album('Aimer', 'One', '2011-01-01'),
      album('Aimer', 'Two', '2012-01-01'),
      album('Aimer', 'Three', '2013-01-01'),
      album('Beatles', 'Please Please Me', '1963-03-22'),
    ]
    const artists = groupCdAlbumIndexArtists(albums)
    const narrow = layoutCdAlbumIndex(artists, 1)
    const wide = layoutCdAlbumIndex(artists, 3)
    const narrowB = narrow.anchors.find((anchor) => anchor.letter === 'B')?.rowIndex
    const wideB = wide.anchors.find((anchor) => anchor.letter === 'B')?.rowIndex
    expect(narrowB).toBeGreaterThan(wideB ?? 0)
    expect(findCdIndexAlbumRow(wide.rows, 'Aimer\u0000Three')).toBe(0)
    expect(findCdIndexAlbumRow(wide.rows, 'missing')).toBe(-1)
  })

  it('builds the CD focus query and returns through browsing before leaving', () => {
    expect(cdAlbumFocusQuery(album('周杰伦', '叶惠美'))).toEqual({
      artist: '周杰伦',
      title: '叶惠美',
      from: 'index',
    })
    expect(isCdAlbumIndexSource('index')).toBe(true)
    expect(isCdAlbumIndexSource('browse')).toBe(false)
    expect(cdFocusBackTarget(true)).toBe('browse')
    expect(cdFocusBackTarget(false)).toBe('albums')
  })

  it('consumes a return marker once', () => {
    rememberCdIndexDeparture({ albumKey: 'artist\u0000title', scrollTop: 480 })
    expect(consumeCdIndexReturn()).toEqual({ albumKey: 'artist\u0000title', scrollTop: 480 })
    expect(consumeCdIndexReturn()).toBeNull()
  })

  it('clears an unconsumed return marker', () => {
    rememberCdIndexDeparture({ albumKey: 'artist\u0000title', scrollTop: 480 })
    clearCdIndexReturn()
    expect(consumeCdIndexReturn()).toBeNull()
  })
})

describe('cd album index shared rows', () => {
  it('combines artists with 1-2 albums into shared grid rows regardless of track count', () => {
    const albums = [
      album('Aimer', 'Album 1', '2020-01-01', 12),
      album('Aimer', 'Album 2', '2020-02-01', 1),
      album('Bob', 'Album A', '2021-01-01', 15),
      album('Cat', 'Album X', '2022-01-01', 8),
    ]
    const artistGroups = groupCdAlbumIndexArtists(albums)
    expect(canShareCdIndexRow(artistGroups[0]!, 4)).toBe(true)
    const model = buildCdAlbumIndex(albums, 4)
    expect(model.rows).toHaveLength(1)
    expect(model.rows[0].type).toBe('shared')
    const sharedRow = model.rows[0] as CdIndexSharedRow
    expect(sharedRow.blocks).toHaveLength(3)
    expect(sharedRow.blocks.map((b) => b.artist)).toEqual(['Aimer', 'Bob', 'Cat'])
    expect(sharedRow.blocks[0].albums).toHaveLength(2)
    expect(sharedRow.blocks[1].albums).toHaveLength(1)
    expect(sharedRow.blocks[2].albums).toHaveLength(1)

    expect(model.anchors.find((a) => a.letter === 'A')?.rowIndex).toBe(0)
    expect(model.anchors.find((a) => a.letter === 'B')?.rowIndex).toBe(0)
    expect(model.anchors.find((a) => a.letter === 'C')?.rowIndex).toBe(0)

    expect(findCdIndexAlbumRow(model.rows, 'Aimer\u0000Album 2')).toBe(0)
    expect(findCdIndexAlbumRow(model.rows, 'Cat\u0000Album X')).toBe(0)
  })

  it('wraps the whole artist block to next row when it cannot fit remaining columns', () => {
    const albums = [
      album('Aimer', 'Album 1', '2020-01-01', 10),
      album('Aimer', 'Album 2', '2020-02-01', 12),
      album('Bob', 'Album B1', '2021-01-01', 8),
      album('Bob', 'Album B2', '2021-02-01', 14),
    ]
    const model = buildCdAlbumIndex(albums, 3)
    expect(model.rows).toHaveLength(2)
    expect(model.rows[0].type).toBe('shared')
    expect(model.rows[1].type).toBe('shared')
    const row0 = model.rows[0] as CdIndexSharedRow
    const row1 = model.rows[1] as CdIndexSharedRow
    expect(row0.blocks.map((b) => b.artist)).toEqual(['Aimer'])
    expect(row1.blocks.map((b) => b.artist)).toEqual(['Bob'])
    expect(model.anchors.find((a) => a.letter === 'A')?.rowIndex).toBe(0)
    expect(model.anchors.find((a) => a.letter === 'B')?.rowIndex).toBe(1)
    expect(findCdIndexAlbumRow(model.rows, 'Bob\u0000Album B1')).toBe(1)
  })

  it('places an artist with a single multi-track album into the next available column of a shared row (e.g. Ed Sheeran with ÷)', () => {
    // 上一行已有四个艺术家块且右侧仍有空列，Ed Sheeran 在曲库中只有《÷》一张专辑时，应排在该行下一个空列
    const albums = [
      album('Artist A', 'Album A', '2020-01-01', 10),
      album('Artist B', 'Album B', '2020-02-01', 12),
      album('Artist C', 'Album C', '2020-03-01', 8),
      album('Artist D', 'Album D', '2020-04-01', 14),
      album('Ed Sheeran', '÷', '2017-03-03', 16),
    ]
    // 5 列网格下，前 4 个艺术家各占 1 列（共 4 列），Ed Sheeran 只有 1 张专辑占 1 列，应排在同一行的第 5 列
    const model5 = buildCdAlbumIndex(albums, 5)
    expect(model5.rows).toHaveLength(1)
    expect(model5.rows[0].type).toBe('shared')
    const sharedRow5 = model5.rows[0] as CdIndexSharedRow
    expect(sharedRow5.blocks).toHaveLength(5)
    expect(sharedRow5.blocks.map((b) => b.artist)).toEqual([
      'Artist A',
      'Artist B',
      'Artist C',
      'Artist D',
      'Ed Sheeran',
    ])
    expect(sharedRow5.blocks[4].artist).toBe('Ed Sheeran')
    expect(sharedRow5.blocks[4].albums[0].title).toBe('÷')

    // 6 列网格下，右侧仍有空列，同样排在第 5 列
    const model6 = buildCdAlbumIndex(albums, 6)
    expect(model6.rows).toHaveLength(1)
    expect(model6.rows[0].type).toBe('shared')
    const sharedRow6 = model6.rows[0] as CdIndexSharedRow
    expect(sharedRow6.blocks).toHaveLength(5)
    expect(sharedRow6.blocks[4].artist).toBe('Ed Sheeran')
  })

  it('keeps dedicated heading and album rows when an artist exceeds the column count', () => {
    const albums = [
      album('Aimer', 'Album 1', '2020-01-01', 1),
      album('Aimer', 'Album 2', '2020-02-01', 1),
      album('Aimer', 'Album 3', '2020-03-01', 1),
      album('Aimer', 'Album 4', '2020-04-01', 1),
      album('Aimer', 'Album 5', '2020-05-01', 1),
      album('Bob', 'Album 1', '2021-01-01', 10),
    ]
    const model = buildCdAlbumIndex(albums, 4)
    expect(model.rows.map((r) => r.type)).toEqual(['heading', 'albums', 'albums', 'shared'])
    expect(model.rows[0].type === 'heading' && model.rows[0].artist).toBe('Aimer')
    expect(
      model.rows[3].type === 'shared' && (model.rows[3] as CdIndexSharedRow).blocks[0].artist,
    ).toBe('Bob')
  })

  it('shares any artist block that fits within the column count', () => {
    // 0 albums -> false
    expect(
      canShareCdIndexRow({ name: 'Empty', letter: '#', sortKey: 'empty', albums: [] }, 4),
    ).toBe(false)

    // 1 album with many tracks -> true
    const oneAlbumArtist = groupCdAlbumIndexArtists([album('Solo', 'LP', null, 16)])[0]!
    expect(canShareCdIndexRow(oneAlbumArtist, 4)).toBe(true)

    // 2 albums with many tracks -> true
    const twoAlbumArtist = groupCdAlbumIndexArtists([
      album('Duo', 'LP1', null, 12),
      album('Duo', 'LP2', null, 14),
    ])[0]!
    expect(canShareCdIndexRow(twoAlbumArtist, 4)).toBe(true)

    // 3 albums fit in 4 columns, regardless of track count.
    const threeAlbumArtist = groupCdAlbumIndexArtists([
      album('Trio', 'S1', null, 1),
      album('Trio', 'S2', null, 1),
      album('Trio', 'S3', null, 1),
    ])[0]!
    expect(canShareCdIndexRow(threeAlbumArtist, 4)).toBe(true)
    expect(canShareCdIndexRow(threeAlbumArtist, 2)).toBe(false)
  })

  it('places Adele after AC/DC when their five albums fit in a six-column row', () => {
    const albums = [
      album('AC/DC', 'Highway to Hell'),
      album('AC/DC', 'Back in Black'),
      album('Adele', '21'),
      album('Adele', '25'),
      album('Adele', '30'),
    ]
    const wide = buildCdAlbumIndex(albums, 6)
    expect(wide.rows.map((row) => row.type)).toEqual(['shared'])
    const row = wide.rows[0] as CdIndexSharedRow
    expect(row.blocks.map((block) => [block.artist, block.albums.length])).toEqual([
      ['AC/DC', 2],
      ['Adele', 3],
    ])
    expect(findCdIndexAlbumRow(wide.rows, 'Adele\u000030')).toBe(0)
    expect(wide.anchors.find((anchor) => anchor.letter === 'A')?.rowIndex).toBe(0)

    const narrow = buildCdAlbumIndex(albums, 4)
    expect(narrow.rows.map((item) => item.type)).toEqual(['shared', 'shared'])
    expect((narrow.rows[1] as CdIndexSharedRow).blocks.map((block) => block.artist)).toEqual([
      'Adele',
    ])
  })

  it('correctly sequences interleaved shared and regular artists with accurate letter anchors and album row lookup', () => {
    const albums = [
      album('Aimer', 'Album A', '2020-01-01', 12),
      album('Bob', 'Album B1', '2020-02-01', 8),
      album('Bob', 'Album B2', '2020-03-01', 9),
      album('Bob', 'Album B3', '2020-04-01', 10),
      album('Cat', 'Album C1', '2020-05-01', 1),
      album('Cat', 'Album C2', '2020-06-01', 2),
      album('Cat', 'Album C3', '2020-07-01', 3),
      album('Cat', 'Album C4', '2020-08-01', 4),
      album('Cat', 'Album C5', '2020-09-01', 5),
      album('David', 'Album D1', '2020-10-01', 11),
      album('David', 'Album D2', '2020-11-01', 13),
      album('Eva', 'Album E', '2020-12-01', 15),
    ]
    // With 4 columns:
    // Aimer: 1 album -> shared row (Row 0)
    // Bob: 3 albums fill the remaining columns in row 0 with Aimer.
    // Cat: 5 albums exceed 4 columns, so uses a heading and two album rows.
    // David and Eva share row 4 with three columns in total.
    const model = buildCdAlbumIndex(albums, 4)
    expect(model.rows.map((r) => r.type)).toEqual([
      'shared',
      'heading',
      'albums',
      'albums',
      'shared',
    ])

    expect(model.anchors.find((a) => a.letter === 'A')?.rowIndex).toBe(0)
    expect(model.anchors.find((a) => a.letter === 'B')?.rowIndex).toBe(0)
    expect(model.anchors.find((a) => a.letter === 'C')?.rowIndex).toBe(1)
    expect(model.anchors.find((a) => a.letter === 'D')?.rowIndex).toBe(4)
    expect(model.anchors.find((a) => a.letter === 'E')?.rowIndex).toBe(4)

    // Verify findCdIndexAlbumRow finds all albums regardless of row type
    expect(findCdIndexAlbumRow(model.rows, 'Aimer\u0000Album A')).toBe(0)
    expect(findCdIndexAlbumRow(model.rows, 'Bob\u0000Album B2')).toBe(0)
    expect(findCdIndexAlbumRow(model.rows, 'Cat\u0000Album C1')).toBe(2)
    expect(findCdIndexAlbumRow(model.rows, 'Cat\u0000Album C5')).toBe(3)
    expect(findCdIndexAlbumRow(model.rows, 'David\u0000Album D2')).toBe(4)
    expect(findCdIndexAlbumRow(model.rows, 'Eva\u0000Album E')).toBe(4)
  })

  it('falls back to heading and album rows when columns is 1 and artist has 2 albums', () => {
    const albums = [
      album('Aimer', 'A1', '2020-01-01', 10),
      album('Aimer', 'A2', '2020-02-01', 12),
      album('Bob', 'B1', '2020-03-01', 14),
    ]
    const artists = groupCdAlbumIndexArtists(albums)

    // At 1 column: Aimer has 2 albums > 1 col -> falls back to heading + 2 album rows
    // Bob has 1 album <= 1 col -> shared row
    const modelNarrow = layoutCdAlbumIndex(artists, 1)
    expect(modelNarrow.rows.map((r) => r.type)).toEqual(['heading', 'albums', 'albums', 'shared'])
    expect(modelNarrow.anchors.find((a) => a.letter === 'A')?.rowIndex).toBe(0)
    expect(modelNarrow.anchors.find((a) => a.letter === 'B')?.rowIndex).toBe(3)
    expect(findCdIndexAlbumRow(modelNarrow.rows, 'Aimer\u0000A2')).toBe(2)
    expect(findCdIndexAlbumRow(modelNarrow.rows, 'Bob\u0000B1')).toBe(3)
  })
})

describe('cd focused playback display conditions', () => {
  const focusedAlbum = album('Artist A', 'Album A', '2020-01-01', 3)
  const trackInFocusedAlbum = focusedAlbum.tracks[0]!
  const trackInOtherAlbum = mockTrack(999)
  trackInOtherAlbum.albumArtist = 'Artist B'
  trackInOtherAlbum.album = 'Album B'
  const trackNotInCatalog = mockTrack(888)
  trackNotInCatalog.albumArtist = 'Artist Unknown'
  trackNotInCatalog.album = 'Album Not In Catalog'

  it('determines whether a track belongs to the focused album', () => {
    // Matches by track ID
    expect(isSameAlbumTrack(trackInFocusedAlbum, focusedAlbum)).toBe(true)

    // Matches by albumArtist + album title even if track ID is not in album.tracks
    const trackWithSameAlbumMeta: TrackListItem = {
      ...mockTrack(1001),
      albumArtist: 'Artist A',
      album: 'Album A',
    }
    expect(isSameAlbumTrack(trackWithSameAlbumMeta, focusedAlbum)).toBe(true)

    // Belongs to another album
    expect(isSameAlbumTrack(trackInOtherAlbum, focusedAlbum)).toBe(false)

    // Belongs to an album not in catalog
    expect(isSameAlbumTrack(trackNotInCatalog, focusedAlbum)).toBe(false)
  })

  it('shows focused playback info and handle when current track belongs to another album or is not in catalog', () => {
    // Playing track from another album in catalog -> SHOWS
    expect(
      shouldShowCdFocusedPlayback(true, true, false, false, trackInOtherAlbum, focusedAlbum),
    ).toBe(true)

    // Playing track from an album NOT in catalog -> SHOWS
    expect(
      shouldShowCdFocusedPlayback(true, true, false, false, trackNotInCatalog, focusedAlbum),
    ).toBe(true)

    // Paused state also shows as long as track is from another album
    expect(
      shouldShowCdFocusedPlayback(true, true, false, false, trackInOtherAlbum, focusedAlbum),
    ).toBe(true)
  })

  it('hides focused playback info and handle when focused album is playing or when not in settled focus', () => {
    // Focused on the current playing album -> HIDES
    expect(
      shouldShowCdFocusedPlayback(true, true, false, false, trackInFocusedAlbum, focusedAlbum),
    ).toBe(false)

    // No track playing -> HIDES
    expect(shouldShowCdFocusedPlayback(true, true, false, false, null, focusedAlbum)).toBe(false)

    // Not in focus mode -> HIDES
    expect(
      shouldShowCdFocusedPlayback(false, false, false, false, trackInOtherAlbum, focusedAlbum),
    ).toBe(false)

    // Focus animation not settled -> HIDES
    expect(
      shouldShowCdFocusedPlayback(true, false, false, false, trackInOtherAlbum, focusedAlbum),
    ).toBe(false)

    // Loading -> HIDES
    expect(
      shouldShowCdFocusedPlayback(true, true, true, false, trackInOtherAlbum, focusedAlbum),
    ).toBe(false)

    // Failed -> HIDES
    expect(
      shouldShowCdFocusedPlayback(true, true, false, true, trackInOtherAlbum, focusedAlbum),
    ).toBe(false)

    // No focused album -> HIDES
    expect(shouldShowCdFocusedPlayback(true, true, false, false, trackInOtherAlbum, null)).toBe(
      false,
    )
  })
})
