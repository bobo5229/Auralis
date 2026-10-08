import { parseAudioMetadata } from './parseAudioMetadata'

export async function verifyPreservedAudioTags(source: string, staging: string): Promise<void> {
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
    'genre',
    'date',
    'year',
  ])
  for (const key of Object.keys(before.common)) {
    if (edited.has(key)) continue
    const name = key as keyof typeof before.common
    if (JSON.stringify(before.common[name]) !== JSON.stringify(after.common[name]))
      throw new Error(`Tag preparation did not preserve ${key}`)
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
  const nativeTags = (tags: typeof before.native) => {
    const values = new Map<string, number>()
    for (const [type, entries] of Object.entries(tags)) {
      for (const tag of entries) {
        if (editedNative.has(tag.id.toLowerCase())) continue
        const key = `${type.startsWith('ID3v2.') ? 'ID3v2' : type}:${tag.id}:${JSON.stringify(tag.value)}`
        values.set(key, (values.get(key) ?? 0) + 1)
      }
    }
    return values
  }
  const afterTags = nativeTags(after.native)
  for (const [tag, count] of nativeTags(before.native))
    if ((afterTags.get(tag) ?? 0) < count)
      throw new Error('Tag preparation did not preserve a native tag')
}
