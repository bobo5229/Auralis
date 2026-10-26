import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IAudioMetadata } from 'music-metadata'
import { parseAudioMetadata } from './parseAudioMetadata'
import { verifyPreservedAudioTags } from './verifyPreservedAudioTags'

vi.mock('./parseAudioMetadata', () => ({ parseAudioMetadata: vi.fn() }))

function tags(native: IAudioMetadata['native']): IAudioMetadata {
  return {
    common: {
      track: { no: null, of: null },
      disk: { no: null, of: null },
      movementIndex: { no: null, of: null },
    },
    native,
    format: { trackInfo: [], tagTypes: [] },
    quality: { warnings: [] },
  }
}

beforeEach(() => vi.resetAllMocks())

describe('preserved native tags', () => {
  it('compares large common and native artwork bytes without serializing the image', async () => {
    const data = new Uint8Array(4 * 1024 * 1024).fill(71)
    const before = tags({ iTunes: [{ id: 'covr', value: { format: 'image/jpeg', data } }] })
    const after = tags({
      iTunes: [{ id: 'covr', value: { format: 'image/jpeg', data: data.slice() } }],
    })
    before.common.picture = [{ format: 'image/jpeg', description: 'Front', data }]
    after.common.picture = [{ format: 'image/jpeg', description: 'Front', data: data.slice() }]
    vi.mocked(parseAudioMetadata).mockResolvedValueOnce(before).mockResolvedValueOnce(after)
    const stringify = vi.spyOn(JSON, 'stringify')
    try {
      await expect(verifyPreservedAudioTags('source', 'staging')).resolves.toBeUndefined()
      // Only small tag identifiers may be serialized, never artwork/tag values.
      expect(
        stringify.mock.calls.every(
          ([value]) =>
            Array.isArray(value) &&
            value.length === 2 &&
            value.every((item) => typeof item === 'string'),
        ),
      ).toBe(true)
    } finally {
      stringify.mockRestore()
    }
  })

  it.each(['bytes', 'format', 'description', 'order', 'missing'])(
    'rejects a changed common picture %s',
    async (change) => {
      const picture = { format: 'image/jpeg', description: 'Front', data: Uint8Array.of(1, 2, 3) }
      const back = { ...picture, description: 'Back' }
      const before = tags({})
      const after = tags({})
      before.common.picture = [picture, back]
      after.common.picture = [
        {
          ...picture,
          ...(change === 'bytes' ? { data: Uint8Array.of(1, 2, 4) } : {}),
          ...(change === 'format' ? { format: 'image/png' } : {}),
          ...(change === 'description' ? { description: 'Changed' } : {}),
        },
        back,
      ]
      if (change === 'order') after.common.picture.reverse()
      if (change === 'missing') after.common.picture.pop()
      vi.mocked(parseAudioMetadata).mockResolvedValueOnce(before).mockResolvedValueOnce(after)
      await expect(verifyPreservedAudioTags('source', 'staging')).rejects.toThrow(
        'did not preserve picture',
      )
    },
  )

  it('rejects a changed private binary value even when common tags agree', async () => {
    vi.mocked(parseAudioMetadata)
      .mockResolvedValueOnce(
        tags({ iTunes: [{ id: 'PRIVATE', value: { data: Uint8Array.of(1, 2) } }] }),
      )
      .mockResolvedValueOnce(
        tags({ iTunes: [{ id: 'PRIVATE', value: { data: Uint8Array.of(1, 3) } }] }),
      )
    await expect(verifyPreservedAudioTags('source', 'staging')).rejects.toThrow(
      'did not preserve a native tag',
    )
  })

  it('preserves multiplicity of private binary tags during lyric-only writes', async () => {
    const value = { id: 'PRIVATE', value: Buffer.from([1, 2]) }
    vi.mocked(parseAudioMetadata)
      .mockResolvedValueOnce(tags({ iTunes: [value, value] }))
      .mockResolvedValueOnce(tags({ iTunes: [value] }))
    await expect(verifyPreservedAudioTags('source', 'staging', true)).rejects.toThrow(
      'did not preserve a native tag',
    )
  })

  it('allows a lyric change while preserving the original title in lyric-only mode', async () => {
    vi.mocked(parseAudioMetadata)
      .mockResolvedValueOnce(
        tags({
          vorbis: [
            { id: 'TITLE', value: 'Title' },
            { id: 'LYRICS', value: 'Old' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        tags({
          vorbis: [
            { id: 'TITLE', value: 'Title' },
            { id: 'LYRICS', value: 'New' },
          ],
        }),
      )
    await expect(verifyPreservedAudioTags('source', 'staging', true)).resolves.toBeUndefined()
  })
  it('rejects a title change during a lyric-only write', async () => {
    vi.mocked(parseAudioMetadata)
      .mockResolvedValueOnce(tags({ vorbis: [{ id: 'TITLE', value: 'Title' }] }))
      .mockResolvedValueOnce(tags({ vorbis: [{ id: 'TITLE', value: 'Changed' }] }))
    await expect(verifyPreservedAudioTags('source', 'staging', true)).rejects.toThrow(
      'did not preserve a native tag',
    )
  })
  it('allows the edited iTunes freeform genre to be replaced by the requested standard genre', async () => {
    vi.mocked(parseAudioMetadata)
      .mockResolvedValueOnce(
        tags({ iTunes: [{ id: '----:com.apple.iTunes:GENRE', value: 'Old' }] }),
      )
      .mockResolvedValueOnce(tags({ iTunes: [{ id: '©gen', value: 'New' }] }))
    await expect(verifyPreservedAudioTags('source', 'staging')).resolves.toBeUndefined()
  })

  it.each(['----:com.other:GENRE', '----:com.apple.iTunes:PRIVATE'])(
    'still rejects loss of %s',
    async (id) => {
      vi.mocked(parseAudioMetadata)
        .mockResolvedValueOnce(tags({ iTunes: [{ id, value: 'Retained' }] }))
        .mockResolvedValueOnce(tags({}))
      await expect(verifyPreservedAudioTags('source', 'staging')).rejects.toThrow(
        'did not preserve a native tag',
      )
    },
  )

  it('requires every repeated native composer occurrence even when common metadata agrees', async () => {
    const composer = { id: 'COMPOSER', value: 'Composer' }
    vi.mocked(parseAudioMetadata)
      .mockResolvedValueOnce(tags({ vorbis: [composer, composer] }))
      .mockResolvedValueOnce(tags({ vorbis: [composer] }))
    await expect(verifyPreservedAudioTags('source', 'staging')).rejects.toThrow(
      'did not preserve a native tag',
    )
  })
})
