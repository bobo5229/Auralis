import { open } from 'node:fs/promises'
import type { IAudioMetadata, ITag } from 'music-metadata'

const MAX_TEXT_BYTES = 1024 * 1024
const CONTAINERS = new Set(['moov', 'udta', 'meta', 'ilst'])

/** ID3v1 genre codes used by the MP4 `gnre` atom. Same table as music-metadata. */
const ID3V1_GENRES = [
  'Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop',
  'Jazz', 'Metal', 'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap', 'Reggae', 'Rock',
  'Techno', 'Industrial', 'Alternative', 'Ska', 'Death Metal', 'Pranks', 'Soundtrack',
  'Euro-Techno', 'Ambient', 'Trip-Hop', 'Vocal', 'Jazz+Funk', 'Fusion', 'Trance',
  'Classical', 'Instrumental', 'Acid', 'House', 'Game', 'Sound Clip', 'Gospel', 'Noise',
  'Alt. Rock', 'Bass', 'Soul', 'Punk', 'Space', 'Meditative', 'Instrumental Pop',
  'Instrumental Rock', 'Ethnic', 'Gothic', 'Darkwave', 'Techno-Industrial',
  'Electronic', 'Pop-Folk', 'Eurodance', 'Dream', 'Southern Rock', 'Comedy', 'Cult',
  'Gangsta Rap', 'Top 40', 'Christian Rap', 'Pop/Funk', 'Jungle', 'Native American',
  'Cabaret', 'New Wave', 'Psychedelic', 'Rave', 'Showtunes', 'Trailer', 'Lo-Fi', 'Tribal',
  'Acid Punk', 'Acid Jazz', 'Polka', 'Retro', 'Musical', 'Rock & Roll', 'Hard Rock',
  'Folk', 'Folk/Rock', 'National Folk', 'Swing', 'Fast-Fusion', 'Bebob', 'Latin', 'Revival',
  'Celtic', 'Bluegrass', 'Avantgarde', 'Gothic Rock', 'Progressive Rock', 'Psychedelic Rock',
  'Symphonic Rock', 'Slow Rock', 'Big Band', 'Chorus', 'Easy Listening', 'Acoustic', 'Humour',
  'Speech', 'Chanson', 'Opera', 'Chamber Music', 'Sonata', 'Symphony', 'Booty Bass', 'Primus',
  'Porn Groove', 'Satire', 'Slow Jam', 'Club', 'Tango', 'Samba', 'Folklore',
  'Ballad', 'Power Ballad', 'Rhythmic Soul', 'Freestyle', 'Duet', 'Punk Rock', 'Drum Solo',
  'A Cappella', 'Euro-House', 'Dance Hall', 'Goa', 'Drum & Bass', 'Club-House',
  'Hardcore', 'Terror', 'Indie', 'BritPop', 'Negerpunk', 'Polsk Punk', 'Beat',
  'Christian Gangsta Rap', 'Heavy Metal', 'Black Metal', 'Crossover', 'Contemporary Christian',
  'Christian Rock', 'Merengue', 'Salsa', 'Thrash Metal', 'Anime', 'JPop', 'Synthpop',
  'Abstract', 'Art Rock', 'Baroque', 'Bhangra', 'Big Beat', 'Breakbeat', 'Chillout',
  'Downtempo', 'Dub', 'EBM', 'Eclectic', 'Electro', 'Electroclash', 'Emo', 'Experimental',
  'Garage', 'Global', 'IDM', 'Illbient', 'Industro-Goth', 'Jam Band', 'Krautrock',
  'Leftfield', 'Lounge', 'Math Rock', 'New Romantic', 'Nu-Breakz', 'Post-Punk', 'Post-Rock',
  'Psytrance', 'Shoegaze', 'Space Rock', 'Trop Rock', 'World Music', 'Neoclassical', 'Audiobook',
  'Audio Theatre', 'Neue Deutsche Welle', 'Podcast', 'Indie Rock', 'G-Funk', 'Dubstep',
  'Garage Rock', 'Psybient',
]

export interface M4aByteReader {
  size: number
  readAt(position: number, length: number): Promise<Buffer>
}

interface AtomSpan {
  type: string
  start: number
  end: number
  payloadStart: number
}

/**
 * Read iTunes text atoms from an m4a file.
 * `covr` and `mdat` are skipped by atom length, so embedded JPEG and audio bytes are not read.
 */
export async function readM4aTextMetadata(filePath: string): Promise<IAudioMetadata> {
  const file = await open(filePath, 'r')
  try {
    const { size } = await file.stat()
    return await readM4aTextMetadataFromReader({
      size,
      async readAt(position, length) {
        const buffer = Buffer.alloc(length)
        const { bytesRead } = await file.read(buffer, 0, length, position)
        if (bytesRead !== length) throw new Error('Incomplete MP4 atom')
        return buffer
      },
    })
  } finally {
    await file.close()
  }
}

export async function readM4aTextMetadataFromReader(reader: M4aByteReader): Promise<IAudioMetadata> {
  const tags: ITag[] = []
  await walkAtoms(reader, 0, reader.size, null, tags)
  return metadataFromTags(tags)
}

async function walkAtoms(
  reader: M4aByteReader,
  start: number,
  end: number,
  parent: string | null,
  tags: ITag[],
): Promise<void> {
  let position = start
  while (end - position >= 8) {
    const span = await readSpan(reader, position, end)
    if (!span) return
    if (parent === 'ilst') {
      if (span.type !== 'covr') await readIlstItem(reader, span, tags)
    } else if (CONTAINERS.has(span.type)) {
      let childStart = span.payloadStart
      if (span.type === 'meta') childStart += await metaPadding(reader, span)
      await walkAtoms(reader, childStart, span.end, span.type, tags)
    }
    position = span.end
  }
}

async function readSpan(
  reader: M4aByteReader,
  position: number,
  parentEnd: number,
): Promise<AtomSpan | null> {
  const header = await reader.readAt(position, 8)
  const type = header.toString('latin1', 4, 8)
  if (type === '\0\0\0\0') return null
  let size = header.readUInt32BE(0)
  let headerLength = 8
  if (size === 1) {
    if (parentEnd - position < 16) throw new Error('Incomplete MP4 extended atom size')
    const extended = await reader.readAt(position + 8, 8)
    const big = extended.readBigUInt64BE(0)
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('MP4 atom is too large')
    size = Number(big)
    headerLength = 16
  } else if (size === 0) {
    size = parentEnd - position
  }
  if (!Number.isInteger(size) || size < headerLength || size > parentEnd - position) {
    throw new Error(`Invalid MP4 atom ${type}`)
  }
  return {
    type,
    start: position,
    end: position + size,
    payloadStart: position + headerLength,
  }
}

/** `meta` is a full box unless the next child is already `hdlr`. */
async function metaPadding(reader: M4aByteReader, span: AtomSpan): Promise<number> {
  if (span.end - span.payloadStart < 8) throw new Error('Incomplete MP4 meta atom')
  const peek = await reader.readAt(span.payloadStart, 8)
  return peek.toString('latin1', 4, 8) === 'hdlr' ? 0 : 4
}

async function readIlstItem(reader: M4aByteReader, item: AtomSpan, tags: ITag[]): Promise<void> {
  let key = item.type
  let position = item.payloadStart
  while (item.end - position >= 8) {
    const child = await readSpan(reader, position, item.end)
    if (!child) return
    if (child.type === 'data') await readDataAtom(reader, key, child, tags)
    else if (child.type === 'mean' || child.type === 'name') {
      key += `:${await readName(reader, child)}`
    }
    position = child.end
  }
}

async function readName(reader: M4aByteReader, span: AtomSpan): Promise<string> {
  const length = span.end - span.payloadStart
  if (length < 4) throw new Error('Incomplete MP4 name atom')
  if (length - 4 > MAX_TEXT_BYTES) throw new Error('MP4 name atom exceeds read limit')
  const bytes = await reader.readAt(span.payloadStart + 4, length - 4)
  return decodeUtf8(bytes)
}

async function readDataAtom(
  reader: M4aByteReader,
  key: string,
  span: AtomSpan,
  tags: ITag[],
): Promise<void> {
  const payloadLength = span.end - span.payloadStart
  if (payloadLength < 8) throw new Error('Incomplete MP4 data atom')
  const prefix = await reader.readAt(span.payloadStart, 8)
  if (prefix[0] !== 0) throw new Error('Unsupported MP4 data type set')
  const dataType = prefix.readUIntBE(1, 3)
  const valueStart = span.payloadStart + 8
  const valueLength = span.end - valueStart
  // JPEG and PNG stay on disk. A full import still reads them through music-metadata.
  if (dataType === 13 || dataType === 14) return
  if (dataType === 1 || dataType === 18) {
    if (valueLength > MAX_TEXT_BYTES) throw new Error('MP4 text atom exceeds read limit')
    const bytes = valueLength === 0 ? Buffer.alloc(0) : await reader.readAt(valueStart, valueLength)
    tags.push({ id: key, value: decodeUtf8(bytes) })
    return
  }
  if (dataType !== 0 || valueLength > 64) return
  const value = valueLength === 0 ? Buffer.alloc(0) : await reader.readAt(valueStart, valueLength)
  if ((key === 'trkn' || key === 'disk') && value.length >= 6) {
    tags.push({ id: key, value: `${value[3]}/${value[5]}` })
    return
  }
  if (key === 'gnre' && value.length >= 2) {
    const genre = ID3V1_GENRES[value[1]! - 1]
    if (genre) tags.push({ id: key, value: genre })
  }
}

function decodeUtf8(bytes: Buffer): string {
  return bytes.toString('utf8').replace(/\0+$/g, '')
}

function metadataFromTags(tags: ITag[]): IAudioMetadata {
  let title: string | undefined
  let album: string | undefined
  let date: string | undefined
  let year: number | undefined
  const track = { no: null as number | null, of: null as number | null }
  const disk = { no: null as number | null, of: null as number | null }
  for (const tag of tags) {
    const value = typeof tag.value === 'string' ? tag.value : ''
    if (tag.id === '\u00A9nam') title = value
    else if (tag.id === '\u00A9alb') album = value
    else if (tag.id === '\u00A9day') {
      date = value
      const parsed = Number.parseInt(value.slice(0, 4), 10)
      if (!Number.isNaN(parsed)) year = parsed
    } else if (tag.id === 'trkn' || tag.id === 'disk') {
      const [number, total] = value.split('/')
      const target = tag.id === 'trkn' ? track : disk
      target.no = Number.parseInt(number ?? '', 10) || null
      target.of = Number.parseInt(total ?? '', 10) || null
    }
  }
  const tagTypes: IAudioMetadata['format']['tagTypes'] = tags.length > 0 ? ['iTunes'] : []
  return {
    format: { trackInfo: [], tagTypes },
    native: tags.length > 0 ? { iTunes: tags } : {},
    quality: { warnings: [] },
    common: {
      title,
      album,
      date,
      year,
      track,
      disk,
      movementIndex: { no: null, of: null },
    },
  }
}
