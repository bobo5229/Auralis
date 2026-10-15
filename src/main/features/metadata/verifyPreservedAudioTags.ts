import { isDeepStrictEqual } from 'node:util'
import { parseAudioMetadata } from './parseAudioMetadata'
import { MetadataSaveError } from './metadataSaveError'

export async function verifyPreservedAudioTags(
  source: string,
  staging: string,
  lyricsOnly = false,
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
  const nativeTags = (tags: typeof before.native) => {
    const values = new Map<string, unknown[]>()
    for (const [type, entries] of Object.entries(tags)) {
      for (const tag of entries) {
        if (editedNative.has(tag.id.toLowerCase())) continue
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
