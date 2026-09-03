import { describe, expect, it } from 'vitest'
import { ipcChannels } from '@shared/ipc/channels'
import {
  domainIpcPayloadPolicies,
  IpcPayloadValidationError,
  parseDomainIpcPayload,
  type DomainIpcInvokeChannel,
} from './ipcPayloadValidation'

function flattenChannels(value: object): string[] {
  return Object.values(value).flatMap((group) => Object.values(group as Record<string, string>))
}

const nonInvokeChannels = new Set<string>([
  ipcChannels.app.rendererReady,
  ipcChannels.library.scanProgress,
  ipcChannels.library.changed,
  ipcChannels.systemMedia.updateThumbarState,
  ipcChannels.systemMedia.command,
  ipcChannels.desktopLyrics.changed,
  ipcChannels.desktopLyrics.visibilityChanged,
  ipcChannels.desktopLyrics.mousePassthroughChanged,
  ipcChannels.desktopLyrics.ready,
  ipcChannels.metadata.refreshProgress,
  ipcChannels.window.miniPlayerStateChanged,
])

const externalInvokeChannels = new Set<string>([
  ipcChannels.desktopLyrics.toggle,
  ipcChannels.desktopLyrics.isVisible,
  ipcChannels.desktopLyrics.setSuppressed,
  ipcChannels.desktopLyrics.toggleMousePassthrough,
  ipcChannels.desktopLyrics.isMousePassthroughEnabled,
  ipcChannels.desktopLyrics.update,
])

const expectedChannels = flattenChannels(ipcChannels)
  .filter((channel) => !nonInvokeChannels.has(channel) && !externalInvokeChannels.has(channel))
  .sort()

function parse(channel: DomainIpcInvokeChannel, payload?: unknown): unknown {
  return parseDomainIpcPayload(channel, [payload])
}

describe('domain IPC payload validation coverage', () => {
  it('classifies all 56 domain invoke channels exactly once', () => {
    const actualChannels = Object.keys(domainIpcPayloadPolicies).sort()
    const kinds = Object.values(domainIpcPayloadPolicies).reduce<Record<string, number>>(
      (counts, policy) => {
        counts[policy.kind] = (counts[policy.kind] ?? 0) + 1
        return counts
      },
      {},
    )

    expect(actualChannels).toEqual(expectedChannels)
    expect(actualChannels).toHaveLength(56)
    expect(kinds).toEqual({ void: 19, optional: 6, required: 31 })
  })

  it('enforces the declared void, optional, and required argument contracts', () => {
    for (const [channel, policy] of Object.entries(domainIpcPayloadPolicies)) {
      const typedChannel = channel as DomainIpcInvokeChannel
      if (policy.kind === 'void') {
        expect(parseDomainIpcPayload(typedChannel, [])).toBeUndefined()
        expect(parseDomainIpcPayload(typedChannel, [undefined])).toBeUndefined()
        expect(() => parseDomainIpcPayload(typedChannel, [{}])).toThrow(IpcPayloadValidationError)
      } else if (policy.kind === 'optional') {
        expect(parseDomainIpcPayload(typedChannel, [])).toBeUndefined()
        expect(parseDomainIpcPayload(typedChannel, [undefined])).toBeUndefined()
      } else {
        expect(() => parseDomainIpcPayload(typedChannel, [])).toThrow(IpcPayloadValidationError)
        expect(() => parseDomainIpcPayload(typedChannel, [undefined])).toThrow(
          IpcPayloadValidationError,
        )
      }
    }
  })
})

describe('domain IPC payload validation behavior', () => {
  it('accepts representative valid scalar, nested, optional, and batch payloads', () => {
    expect(
      parse('library:get-track-page', { cursor: 'snapshot:cursor', limit: 1_000, refresh: true }),
    ).toEqual({ cursor: 'snapshot:cursor', limit: 1_000, refresh: true })
    expect(parse('library:get-scan-status', { jobId: undefined })).toEqual({ jobId: undefined })
    expect(
      parse('playback:get-random-album-tracks', {
        excludeAlbumKey: { albumArtist: 'Artist', album: 'Album' },
      }),
    ).toEqual({ excludeAlbumKey: { albumArtist: 'Artist', album: 'Album' } })
    expect(
      parse('smart-playlists:create', {
        name: 'Recent instrumental music',
        rule: {
          expression: {
            type: 'and',
            operands: [
              { type: 'predicate', field: 'genre', operator: 'has', value: 'Instrumental' },
              { type: 'predicate', field: 'artist', operator: 'isEmpty' },
            ],
          },
        },
      }),
    ).toBeTruthy()
    expect(
      parse('metadata:update-track-metadata', {
        trackId: 42,
        title: 'Title',
        artistDisplay: null,
        albumTitle: 'Album',
        albumArtistDisplay: 'Artist',
        genreDisplay: 'Genre',
        year: 2026,
        releaseDate: '2026-08-24',
      }),
    ).toBeTruthy()
    expect(
      parse('archive:get-listening-ranking', {
        range: 'month',
        target: 'album',
        year: 2026,
        month: 8,
      }),
    ).toBeTruthy()
    expect(
      parse('playback:record-effective-play', {
        trackId: 42,
        sessionId: 'session-42',
        playedAtIso: '2026-08-24T12:34:56.789Z',
      }),
    ).toBeTruthy()
    expect(parse('playlists:add-tracks', { id: 7, trackIds: [1, 2, 3] })).toBeTruthy()
  })

  it.each([
    ['library:start-scan', { rootId: 0 }],
    ['library:cancel-scan', { jobId: Number.NaN }],
    ['lyrics:get-by-track-id', { trackId: Number.POSITIVE_INFINITY }],
    ['library:get-track-page', { limit: 5_001 }],
    ['playlists:update-view-mode', { id: 1, viewMode: 'tiles' }],
    ['playback:get-album-tracks', { albumKey: { albumArtist: 'A' } }],
    ['playback:record-effective-play', { trackId: 1, sessionId: 'x', playedAtIso: 'today' }],
    ['archive:get-daily-listening-detail', { date: '2026-02-30' }],
    ['archive:get-listening-ranking', { range: 'quarter', target: 'track' }],
    ['metadata:refresh-missing', { limit: -1 }],
    ['window:set-mini-player-popover', { open: true, direction: 'left', height: 200 }],
  ] as const)('rejects malformed payload for %s', (channel, payload) => {
    expect(() => parse(channel, payload)).toThrow(IpcPayloadValidationError)
  })

  it('rejects unexpected, accessor, symbol, and dangerous prototype properties', () => {
    expect(() => parse('library:start-scan', { rootId: 1, extra: true })).toThrow(
      /unexpected property/,
    )

    const accessorPayload = {}
    Object.defineProperty(accessorPayload, 'rootId', { get: () => 1, enumerable: true })
    expect(() => parse('library:start-scan', accessorPayload)).toThrow(/data property/)

    const symbolPayload = { rootId: 1, [Symbol('hidden')]: true }
    expect(() => parse('library:start-scan', symbolPayload)).toThrow(/symbol properties/)

    const pollutedPayload = Object.create({ rootId: 1 }) as { rootId: number }
    pollutedPayload.rootId = 1
    expect(() => parse('library:start-scan', pollutedPayload)).toThrow(/custom prototype/)

    const dangerousPayload = Object.create(null) as Record<string, unknown>
    dangerousPayload.rootId = 1
    Object.defineProperty(dangerousPayload, 'constructor', {
      value: 'do-not-run',
      enumerable: true,
    })
    expect(() => parse('library:start-scan', dangerousPayload)).toThrow(/forbidden property/)
  })

  it('accepts safe null-prototype records while rejecting oversized strings and ID batches', () => {
    const safePayload = Object.create(null) as Record<string, unknown>
    safePayload.rootId = 1
    expect(parse('library:start-scan', safePayload)).toBe(safePayload)

    expect(() => parse('smart-playlists:create-from-query', { query: 'q'.repeat(4_097) })).toThrow(
      /invalid length/,
    )
    expect(() =>
      parse('metadata:refresh-tracks', {
        trackIds: Array.from({ length: 10_001 }, (_, index) => index + 1),
      }),
    ).toThrow(/invalid item count/)
  })

  it('bounds recursive smart-playlist rules', () => {
    let expression: Record<string, unknown> = {
      type: 'predicate',
      field: 'genre',
      operator: 'has',
      value: 'ambient',
    }
    for (let index = 0; index < 17; index += 1) {
      expression = { type: 'and', operands: [expression] }
    }

    expect(() =>
      parse('smart-playlists:create', { name: 'Deep rule', rule: { expression } }),
    ).toThrow(/depth limit/)
  })

  it('rejects extra invoke arguments and never reflects sensitive payload values', () => {
    expect(() =>
      parseDomainIpcPayload('library:start-scan', [{ rootId: 1 }, 'secret-token']),
    ).toThrow(/only invoke argument/)

    try {
      parse('smart-playlists:create-from-query', {
        query: `sensitive-user-query-${'x'.repeat(4_096)}`,
      })
      throw new Error('Expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(IpcPayloadValidationError)
      expect((error as Error).message).not.toContain('sensitive-user-query')
    }
  })
})
