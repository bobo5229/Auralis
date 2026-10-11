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
