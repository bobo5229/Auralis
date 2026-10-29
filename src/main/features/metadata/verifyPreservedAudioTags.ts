import { isDeepStrictEqual } from 'node:util'
import { parseAudioMetadata } from './parseAudioMetadata'
import { MetadataSaveError } from './metadataSaveError'
import { resolveArtists, resolveAlbumArtists } from './metadataNormalizer'
import type { EditableTagField } from '@shared/types/trackMetadata'

export async function verifyPreservedAudioTags(
  source: string,
  staging: string,
  lyricsOnly = false,
  editedFields?: readonly EditableTagField[],
  artworkChanges?: import('./metadataArtworkEdits').ResolvedArtworkChange[],
): Promise<void> {
  const [before, after] = await Promise.all([
    parseAudioMetadata(source),
    parseAudioMetadata(staging),
  ])
  const edited = new Set([
    'title',
    'artist',
    'artists',
    'album',
    'albumartist',
    'albumartists',
    'genre',
    'date',
    'year',
  ])
  if (lyricsOnly) {
    edited.clear()
    edited.add('lyrics')
  }
  const commonGroups: Record<EditableTagField, string[]> = {
    title: ['title'],
    artistDisplay: ['artist', 'artists'],
    albumTitle: ['album'],
    albumArtistDisplay: ['albumartist', 'albumartists'],
    genreDisplay: ['genre'],
    releaseDate: ['date', 'year'],
    trackNo: ['track'],
    trackTotal: ['track'],
    discNo: ['disk'],
    discTotal: ['disk'],
    composer: ['composer'],
    copyright: ['copyright'],
    isrc: ['isrc'],
  }
  if (editedFields && !lyricsOnly) {
    edited.clear()
    for (const field of editedFields) for (const key of commonGroups[field]) edited.add(key)
  }
  if (artworkChanges?.length) {
    edited.add('picture')
    const original = before.common.picture ?? [],
      actual = after.common.picture ?? []
    const selected = new Map(
      artworkChanges
        .filter((change) => change.kind !== 'add')
        .map((change) => [change.index, change]),
    )
    const expected: Array<{
      original?: (typeof original)[number]
      data?: Buffer
      mimeType?: string
    }> = []
    for (const [index, picture] of original.entries()) {
      const change = selected.get(index)
      if (!change) expected.push({ original: picture })
      else if (change.kind === 'replace') expected.push(change)
    }
    expected.push(...artworkChanges.filter((change) => change.kind === 'add'))
    if (
      actual.length !== expected.length ||
      expected.some((picture, index) =>
        picture.original
          ? !isDeepStrictEqual(picture.original, actual[index])
          : !Buffer.from(actual[index]!.data).equals(picture.data!) ||
            actual[index]!.format !== picture.mimeType,
      )
    )
      throw new MetadataSaveError('tag-preservation-failed', 'Artwork selection was not preserved')
  }
  const artistsChanged = !isDeepStrictEqual(resolveArtists(before), resolveArtists(after))
  const albumArtistsChanged = !isDeepStrictEqual(
    resolveAlbumArtists(before),
    resolveAlbumArtists(after),
  )
  for (const key of Object.keys(before.common)) {
    if (edited.has(key)) continue
    const name = key as keyof typeof before.common
    // Typed-array artwork is compared as bytes, without expanding every byte
    // into JSON text. Array order and all picture properties remain protected.
    if (!isDeepStrictEqual(before.common[name], after.common[name]))
      throw new MetadataSaveError(
        'tag-preservation-failed',
        `Tag preparation did not preserve ${key}`,
      )
  }
  // Common fields do not include private tags. Reject a remux that loses them,
  // including multiplicity, instead of silently committing a partial tag set.
  const editedNative = new Set([
    'title',
    'artist',
    'artists',
    'album',
    'album_artist',
    'albumartist',
    'genre',
    'date',
    'year',
    'tit2',
    'tt2',
    'tpe1',
    'tp1',
    'tpe2',
    'tp2',
    'talb',
    'tal',
    'tcon',
    'tco',
    'tdrc',
    'tyer',
    'tye',
    'tdat',
    'tda',
    'txxx:date',
    'txxx:year',
    'txxx:album_artist',
    '©nam',
    '©art',
    'aart',
    '©alb',
    '©gen',
    'gnre',
    // This freeform MP4 field is part of the editable genre list, whose final
    // value is checked by verifyWrittenMetadata rather than preserved verbatim.
    '----:com.apple.itunes:genre',
    '©day',
    'inam',
    'iart',
    'iprd',
    'icrd',
    'ignr',
    // Artwork is verified byte-for-byte above; muxer signatures are generated.
    'apic',
    'pic',
    'metadata_block_picture',
    'covr',
    'encoder',
    'tsse',
    'tss',
    'isft',
    '©too',
  ])
  if (lyricsOnly) {
    editedNative.clear()
    // Plain lyric fields are intentionally edited; synchronized/private fields remain protected.
    for (const id of ['uslt', 'ult', 'lyrics', 'unsyncedlyrics', '©lyr']) editedNative.add(id)
  }
  if (editedFields && !lyricsOnly) {
    const nativeGroups: Record<EditableTagField, string[]> = {
      trackNo: ['trck', 'trk', 'tracknumber', 'tracktotal', 'totaltracks', 'trkn'],
      trackTotal: ['trck', 'trk', 'tracknumber', 'tracktotal', 'totaltracks', 'trkn'],
      discNo: ['tpos', 'tpa', 'discnumber', 'disctotal', 'totaldiscs', 'disk'],
      discTotal: ['tpos', 'tpa', 'discnumber', 'disctotal', 'totaldiscs', 'disk'],
      composer: ['composer', 'tcom', 'tcm', '©wrt'],
      copyright: ['copyright', 'tcop', 'tcr', 'cprt'],
      isrc: ['isrc', 'tsrc', 'trc', '----:com.apple.itunes:isrc'],
      title: ['title', 'tit2', 'tt2', '©nam', 'inam'],
      artistDisplay: ['artist', 'artists', 'tpe1', 'tp1', '©art', 'iart'],
      albumTitle: ['album', 'talb', 'tal', '©alb', 'iprd'],
      albumArtistDisplay: [
        'album_artist',
        'albumartist',
        'tpe2',
        'tp2',
        'aart',
        'txxx:album_artist',
      ],
      genreDisplay: ['genre', 'tcon', 'tco', '©gen', 'gnre', 'ignr', '----:com.apple.itunes:genre'],
      releaseDate: [
        'date',
        'year',
        'tdrc',
        'tyer',
        'tye',
        'tdat',
        'tda',
        'txxx:date',
        'txxx:year',
        '©day',
        'icrd',
      ],
    }
    editedNative.clear()
    for (const field of editedFields) for (const id of nativeGroups[field]) editedNative.add(id)
    for (const id of [
      'apic',
      'pic',
      'metadata_block_picture',
      'covr',
      'encoder',
      'tsse',
      'tss',
      'isft',
      '©too',
    ])
      editedNative.add(id)
  }
  const nativeTags = (tags: typeof before.native) => {
    const values = new Map<string, unknown[]>()
    for (const [type, entries] of Object.entries(tags)) {
      for (const tag of entries) {
        if (editedNative.has(tag.id.toLowerCase())) continue
        const freeform = /^----:([^:]+):(.+)$/.exec(tag.id)
        if (
          !lyricsOnly &&
          type === 'iTunes' &&
          freeform?.[1]?.toLowerCase() === 'com.apple.itunes' &&
          ((freeform[2]?.toLowerCase() === 'artists' &&
            artistsChanged &&
            (!editedFields || editedFields.includes('artistDisplay'))) ||
            (freeform[2]?.toLowerCase() === 'albumartists' &&
              albumArtistsChanged &&
              (!editedFields || editedFields.includes('albumArtistDisplay'))))
        )
          continue
        const key = JSON.stringify([type.startsWith('ID3v2.') ? 'ID3v2' : type, tag.id])
        const occurrences = values.get(key) ?? []
        occurrences.push(tag.value)
        values.set(key, occurrences)
      }
    }
    return values
  }
  const afterTags = nativeTags(after.native)
  for (const [tag, values] of nativeTags(before.native)) {
    const remaining = afterTags.get(tag) ?? []
    for (const value of values) {
      const index = remaining.findIndex((candidate) => isDeepStrictEqual(value, candidate))
      if (index < 0)
        throw new MetadataSaveError(
          'tag-preservation-failed',
          'Tag preparation did not preserve a native tag',
        )
      // Consume each matching item so one retained tag cannot satisfy several
      // original occurrences, including private binary tags and artwork.
      remaining.splice(index, 1)
    }
  }
}
