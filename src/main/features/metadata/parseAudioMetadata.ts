import { open } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import { parseFile, type IAudioMetadata, type IOptions } from 'music-metadata'

const MAX_TAG_BYTES = 64 * 1024 * 1024
const MAX_TEXT_BYTES = 1024 * 1024
const TEXT_FIELDS = {
  TPE1: 'artists',
  TP1: 'artists',
  TCON: 'genre',
  TCO: 'genre',
  TCOM: 'composer',
  TCM: 'composer',
} as const
type TextField = (typeof TEXT_FIELDS)[keyof typeof TEXT_FIELDS]

/** foobar2000 serializes multiple ID3v2.3 genres with a bare semicolon. */
function decodeId3v23Genres(metadata: IAudioMetadata): IAudioMetadata {
  const tags = metadata.native['ID3v2.3']
  if (!tags) return metadata
  const originalValues = new Set(
    tags
      .filter((tag) => tag.id === 'TCON' && typeof tag.value === 'string')
      .map((tag) => tag.value as string),
  )
  if (![...originalValues].some((value) => value.includes(';'))) return metadata

  const parts = (value: string) =>
    value
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
  metadata.native['ID3v2.3'] = tags.flatMap((tag) =>
    tag.id === 'TCON' && typeof tag.value === 'string'
      ? parts(tag.value).map((value) => ({ ...tag, value }))
      : [tag],
  )
  // Decode only common values originating from these TCON entries. Other tag
  // sources keep their own delimiter rules and existing genre-code mappings.
  metadata.common.genre = metadata.common.genre
    ? metadata.common.genre.flatMap((value) => (originalValues.has(value) ? parts(value) : [value]))
    : [...originalValues].flatMap(parts)
  return metadata
}

function removeUnsynchronization(bytes: Buffer): Buffer {
  const result = Buffer.allocUnsafe(bytes.length)
  let length = 0
  for (let index = 0; index < bytes.length; index++) {
    result[length++] = bytes[index]!
    if (bytes[index] === 0xff && bytes[index + 1] === 0) index++
  }
  return result.subarray(0, length)
}

function decodeText(bytes: Buffer): string[] {
  const encoding = bytes[0]
  let text: string
  let content = bytes.subarray(1)
  if (encoding === 0) text = content.toString('latin1')
  else if (encoding === 3) text = content.toString('utf8')
  else if (encoding === 1 || encoding === 2) {
    const bigEndian = encoding === 2 || (content[0] === 0xfe && content[1] === 0xff)
    if (
      (content[0] === 0xfe && content[1] === 0xff) ||
      (content[0] === 0xff && content[1] === 0xfe)
    )
      content = content.subarray(2)
    content = Buffer.from(content.subarray(0, content.length - (content.length % 2)))
    if (bigEndian) content.swap16()
    text = content.toString('utf16le')
  } else return []
  // NUL represents a separate data item. Literal slash belongs to the item text.
  return text
    .split('\0')
    .map((value) => value.trim())
    .filter(Boolean)
}

async function legacyTextValues(filePath: string): Promise<Map<string, string[]>> {
  const file = await open(filePath, 'r')
  try {
    const header = Buffer.alloc(10)
    if (
      (await file.read(header, 0, 10, 0)).bytesRead !== 10 ||
      header.toString('ascii', 0, 3) !== 'ID3'
    )
      return new Map()
    const major = header[3]
    if (major !== 2 && major !== 3) return new Map()
    if (major === 2 && header[5]! & 0x40) throw new Error('Compressed ID3v2.2 text is unsupported')
    if (header.subarray(6, 10).some((byte) => byte >= 0x80)) throw new Error('Invalid ID3 tag size')
    const size = header.subarray(6, 10).reduce((value, byte) => value * 128 + byte, 0)
    if (size > MAX_TAG_BYTES) throw new Error('ID3 tag exceeds text preservation read limit')
    let body: Buffer = Buffer.alloc(size)
    if ((await file.read(body, 0, size, 10)).bytesRead !== size)
      throw new Error('Incomplete ID3 tag')
    if (header[5]! & 0x80) body = removeUnsynchronization(body)
    let offset = 0
    if (major === 3 && header[5]! & 0x40) {
      if (body.length < 4) throw new Error('Incomplete ID3 extended header')
      offset = 4 + body.readUInt32BE(0)
    }
    const headerBytes = major === 2 ? 6 : 10
    const idBytes = major === 2 ? 3 : 4
    const values = new Map<string, string[]>()
    while (offset + headerBytes <= body.length) {
      const id = body.toString('ascii', offset, offset + idBytes)
      if (!new RegExp(`^[A-Z0-9]{${idBytes}}$`).test(id)) break
      const frameSize = major === 2 ? body.readUIntBE(offset + 3, 3) : body.readUInt32BE(offset + 4)
      const flags = major === 3 ? body[offset + 9]! : 0
      const start = offset + headerBytes
      offset = start + frameSize
      if (offset > body.length || frameSize === 0) throw new Error('Invalid ID3 frame size')
      if (!(id in TEXT_FIELDS)) continue
      if (frameSize > MAX_TEXT_BYTES) throw new Error('ID3 text frame exceeds read limit')
      if (flags & 0x40) throw new Error('Encrypted ID3 text cannot be normalized')
      let text = body.subarray(start, offset)
      const compressed = Boolean(flags & 0x80)
      if (compressed) {
        if (text.length < 4) throw new Error('Incomplete compressed ID3 text')
        text = text.subarray(4)
      }
      if (flags & 0x20) text = text.subarray(1)
      if (compressed) text = inflateSync(text, { maxOutputLength: MAX_TEXT_BYTES })
      values.set(id, [...(values.get(id) ?? []), ...decodeText(text)])
    }
    return values
  } finally {
    await file.close()
  }
}

/** Shared file reader for import, scan, refresh and verified edits. */
export async function parseAudioMetadata(
  filePath: string,
  options?: IOptions,
): Promise<IAudioMetadata> {
  const metadata = await parseFile(filePath, options)
  const tagType = ['ID3v2.3', 'ID3v2.2'].find((type) => metadata.native[type])
  if (!tagType) return metadata
  const tags = metadata.native[tagType]!
  const needsOriginalText = Object.keys(TEXT_FIELDS).some(
    (id) => tags.filter((tag) => tag.id === id).length > 1,
  )
  if (!needsOriginalText) return decodeId3v23Genres(metadata)
  const original = await legacyTextValues(filePath)
  for (const [id, values] of original) {
    if (!values.some((value) => value.includes('/'))) continue
    const field = TEXT_FIELDS[id as keyof typeof TEXT_FIELDS] as TextField
    metadata.common[field] = values
    if (field === 'artists') metadata.common.artist = values.join('; ')
    metadata.native[tagType] = metadata.native[tagType]!.filter((tag) => tag.id !== id)
    metadata.native[tagType]!.push(...values.map((value) => ({ id, value })))
  }
  return decodeId3v23Genres(metadata)
}
