import { describe, expect, it } from 'vitest'
import { normalizeMetadata } from '../metadata/metadataNormalizer'
import { readM4aTextMetadataFromReader, type M4aByteReader } from './m4aTextTags'

function atom(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(8 + payload.length, 0)
  header.write(type, 4, 4, 'latin1')
  return Buffer.concat([header, payload])
}

function textData(value: string): Buffer {
  const prefix = Buffer.alloc(8)
  prefix.writeUInt32BE(1, 0)
  return atom('data', Buffer.concat([prefix, Buffer.from(value, 'utf8')]))
}

function nameAtom(value: string): Buffer {
  return Buffer.concat([Buffer.alloc(4), Buffer.from(value, 'utf8')])
}

function sampleFile(): Buffer {
  const title = atom('\u00A9nam', textData('Song'))
  const coverPrefix = Buffer.alloc(8)
  coverPrefix.writeUInt32BE(13, 0)
  const cover = atom(
    'covr',
    atom('data', Buffer.concat([coverPrefix, Buffer.alloc(64 * 1024, 0xab)])),
  )
  const trackValue = Buffer.alloc(8)
  trackValue.writeUInt16BE(7, 2)
  trackValue.writeUInt16BE(12, 4)
  const track = atom('trkn', atom('data', Buffer.concat([Buffer.alloc(8), trackValue])))
  const isrc = atom(
    '----',
    Buffer.concat([
      atom('mean', nameAtom('com.apple.iTunes')),
      atom('name', nameAtom('ISRC')),
      textData('USRC17607839'),
    ]),
  )
  const ilst = atom('ilst', Buffer.concat([title, cover, track, isrc]))
  const meta = atom('meta', Buffer.concat([Buffer.alloc(4), atom('hdlr', Buffer.alloc(8)), ilst]))
  const moov = atom('moov', atom('udta', meta))
  return Buffer.concat([
    atom('ftyp', Buffer.from('M4A ')),
    moov,
    atom('mdat', Buffer.alloc(8 * 1024, 0x11)),
  ])
}

function payloadRegion(file: Buffer, type: string): [number, number] {
  const nameAt = file.indexOf(Buffer.from(type, 'latin1'))
  const start = nameAt - 4
  return [nameAt + 4, start + file.readUInt32BE(start)]
}

describe('m4a text tag reader', () => {
  it('reads text atoms and does not read covr or mdat payloads', async () => {
    const file = sampleFile()
    const cover = payloadRegion(file, 'covr')
    const audio = payloadRegion(file, 'mdat')
    const reads: Array<[number, number]> = []
    const reader: M4aByteReader = {
      size: file.length,
      async readAt(position, length) {
        if (position < 0 || length < 0 || position + length > file.length) {
          throw new Error(`read outside file at ${position}+${length}`)
        }
        reads.push([position, length])
        return file.subarray(position, position + length)
      },
    }
    const metadata = await readM4aTextMetadataFromReader(reader)
    const normalized = normalizeMetadata(metadata, 'song.m4a')
    expect(normalized).toMatchObject({ title: 'Song', trackNo: 7, isrc: 'USRC17607839' })
    expect(metadata.common.picture).toBeUndefined()
    const overlaps = (start: number, end: number, region: [number, number]) =>
      start < region[1] && end > region[0]
    expect(
      reads.some(([position, length]) => overlaps(position, position + length, cover)),
    ).toBe(false)
    expect(
      reads.some(([position, length]) => overlaps(position, position + length, audio)),
    ).toBe(false)
  })
})
