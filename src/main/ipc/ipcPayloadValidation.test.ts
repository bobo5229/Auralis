import { describe, expect, it } from 'vitest'
import { ipcChannels } from '@shared/ipc/channels'
import { validIpcPayloads } from './ipcPayloadValidation.compatibility.fixture'
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
  ipcChannels.playback.spectrumFrame,
  ipcChannels.playback.nativeEvent,
  ipcChannels.app.rendererReady,
  ipcChannels.app.splashReady,
  ipcChannels.library.scanProgress,
  ipcChannels.library.changed,
  ipcChannels.systemMedia.updateThumbarState,
  ipcChannels.systemMedia.command,
  ipcChannels.metadata.refreshProgress,
  ipcChannels.metadata.trackEditStateChanged,
  ipcChannels.window.maximizedChanged,
])

const expectedChannels = flattenChannels(ipcChannels)
  .filter((channel) => !nonInvokeChannels.has(channel))
  .sort()

function parse(channel: DomainIpcInvokeChannel, payload?: unknown): unknown {
  return parseDomainIpcPayload(channel, [payload])
}

describe('domain IPC payload validation coverage', () => {
  it.each(Object.keys(domainIpcPayloadPolicies) as DomainIpcInvokeChannel[])(
    'accepts a representative payload without cloning or coercing it for %s',
    (channel) => {
      const policy = domainIpcPayloadPolicies[channel]
      if (policy.kind === 'void') {
        expect(parseDomainIpcPayload(channel, [])).toBeUndefined()
      } else {
        expect(Object.hasOwn(validIpcPayloads, channel)).toBe(true)
        const payload = structuredClone(validIpcPayloads[channel])
        expect(parse(channel, payload)).toBe(payload)
        expect(payload).toEqual(validIpcPayloads[channel])
      }
    },
  )
  it('accepts custom rolling days and rejects intervals or invalid day counts', () => {
    expect(parse('smart-playlists:create-recent-added', {})).toEqual({})
    expect(parse('smart-playlists:create-recent-added', { days: 30 })).toEqual({ days: 30 })
    expect(parse('smart-playlists:update-recent-added-days', { id: 1, days: 365 })).toEqual({
      id: 1,
      days: 365,
    })
    expect(
      parse('smart-playlists:create', {
        name: '最近常听',
        rule: { preset: 'recentAdded', days: 30 },
      }),
    ).toBeTruthy()
    for (const days of [0, -1, 1.5, '7', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => parse('smart-playlists:create-recent-added', { days })).toThrow()
      expect(() => parse('smart-playlists:update-recent-added-days', { id: 1, days })).toThrow()
      expect(() =>
        parse('smart-playlists:create', {
          name: '最近常听',
          rule: { preset: 'recentFrequent', days },
        }),
      ).toThrow()
    }
    expect(() =>
      parse('smart-playlists:create-recent-added', {
        startDate: '2026-01-01',
        endDate: '2026-02-01',
      }),
    ).toThrow()
    expect(() =>
      parse('smart-playlists:create', {
        name: 'Mixed',
        rule: { preset: 'recentFrequent', days: 30, conditions: [] },
      }),
    ).toThrow()
  })

  it('classifies all domain invoke channels exactly once', () => {
    const actualChannels = Object.keys(domainIpcPayloadPolicies).sort()
    const kinds = Object.values(domainIpcPayloadPolicies).reduce<Record<string, number>>(
      (counts, policy) => {
        counts[policy.kind] = (counts[policy.kind] ?? 0) + 1
        return counts
      },
      {},
    )

    expect(actualChannels).toEqual(expectedChannels)
    expect(actualChannels).toHaveLength(63)
    expect(kinds).toEqual({ void: 18, optional: 5, required: 40 })
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

describe('IPC schema security and resource compatibility', () => {
  it('keeps own non-enumerable data properties and rejects hidden unknown fields', () => {
    const payload = Object.create(null, { rootId: { value: 1 } })
    expect(parse('library:start-scan', payload)).toBe(payload)
    Object.defineProperty(payload, 'secret-field', { value: 'sensitive-value' })
    expect(() => parse('library:start-scan', payload)).toThrow(/unexpected property/)
  })

  it.each([
    ['playback:native-command', 'action', { session: 0 }, 'start'],
    ['smart-playlists:create', 'preset', {}, 'mostListened'],
  ] as const)(
    'rejects discriminator accessors without executing them for %s',
    (channel, key, rest, value) => {
      let calls = 0
      const object = { ...rest }
      Object.defineProperty(object, key, {
        enumerable: true,
        get: () => {
          calls++
          return value
        },
      })
      const payload = channel === 'smart-playlists:create' ? { name: 'Name', rule: object } : object
      expect(() => parse(channel, payload)).toThrow(/data property/)
      expect(calls).toBe(0)
    },
  )

  it('rejects sparse and custom-prototype arrays, before accepting any inherited element', () => {
    const sparse = new Array(1)
    expect(() => parse('metadata:refresh-tracks', { trackIds: sparse })).toThrow(/must be present/)
    const custom = [1]
    Object.setPrototypeOf(custom, Object.create(Array.prototype))
    expect(() => parse('metadata:refresh-tracks', { trackIds: custom })).toThrow(/plain array/)
  })

  it('rejects oversized arrays before reading their elements', () => {
    const ids = new Array(10001)
    Object.defineProperty(ids, 0, {
      get: () => {
        throw new Error('element must not be read')
      },
    })
    expect(() => parse('metadata:refresh-tracks', { trackIds: ids })).toThrow(/invalid item count/)
  })

  it('preserves aggregate UTF-16 string accounting at its exact boundary', () => {
    const conditions = Array.from({ length: 32 }, () => ({
      field: 'genre',
      value: 'x'.repeat(8192),
    }))
    conditions[31].value = 'x'.repeat(8191)
    const payload = { name: 'n', rule: { conditions } }
    expect(parse('smart-playlists:create', payload)).toBe(payload)
    conditions[31].value += 'x'
    expect(() => parse('smart-playlists:create', payload)).toThrow(/aggregate string size limit/)
    conditions[31].value = '😀'.repeat(4095) + 'x'
    expect(parse('smart-playlists:create', payload)).toBe(payload)
  })

  it('keeps the structural node budget and resets counters between invokes', () => {
    const validate = domainIpcPayloadPolicies['library:start-scan'].validator!
    const context = { nodes: 49998, stringUnits: 0 }
    validate({ rootId: 1 }, 'payload', context)
    expect(context.nodes).toBe(50000)
    expect(() => validate({ rootId: 1 }, 'payload', { nodes: 49999, stringUnits: 0 })).toThrow(
      /structural size limit/,
    )
    expect(parse('library:start-scan', { rootId: 1 })).toEqual({ rootId: 1 })
  })

  it('keeps both exact recursive-rule boundaries and rejects cycles', () => {
    const leaf = { type: 'predicate', field: 'genre', operator: 'has', value: 'Ambient' }
    let expression: object = leaf
    for (let i = 1; i < 16; i++) expression = { type: 'and', operands: [expression] }
    expect(parse('smart-playlists:create', { name: 'Name', rule: { expression } })).toBeTruthy()
    expect(() =>
      parse('smart-playlists:create', {
        name: 'Name',
        rule: { expression: { type: 'and', operands: [expression] } },
      }),
    ).toThrow(/depth limit/)
    const node: { type: string; operands: object[] } = { type: 'and', operands: [] }
    node.operands.push(node)
    expect(() =>
      parse('smart-playlists:create', { name: 'Name', rule: { expression: node } }),
    ).toThrow(/depth limit/)
    const branch = (count: number) => ({
      type: 'and',
      operands: Array.from({ length: count }, () => ({ ...leaf })),
    })
    const root = { type: 'and', operands: [branch(64), branch(64), branch(64), branch(59)] }
    expect(
      parse('smart-playlists:create', { name: 'Name', rule: { expression: root } }),
    ).toBeTruthy()
    root.operands[3].operands.push({ ...leaf })
    expect(() =>
      parse('smart-playlists:create', { name: 'Name', rule: { expression: root } }),
    ).toThrow(/rule node limit/)
  })

  it('does not leak payload values, unexpected keys, or accessor exceptions in validation errors', () => {
    const cases = [
      { rootId: 'sensitive-value' },
      { rootId: 1, 'sensitive-field': 'sensitive-value' },
      new Proxy(
        {},
        {
          ownKeys: () => {
            throw new Error('sensitive-value')
          },
        },
      ),
    ]
    for (const payload of cases) {
      try {
        parse('library:start-scan', payload)
        throw new Error('Expected rejection')
      } catch (error) {
        expect(error).toBeInstanceOf(IpcPayloadValidationError)
        expect((error as Error).message).not.toMatch(/sensitive-value|sensitive-field/)
      }
    }
  })
})

describe('domain IPC payload validation behavior', () => {
  it('accepts a bounded spectrum subscription and rejects paths and decoder options', () => {
    const request = {
      subscriptionId: 1,
      revision: 2,
      enabled: true,
      trackId: 3,
      currentTime: 1.5,
      isPlaying: true,
    }
    expect(parse(ipcChannels.playback.spectrumSubscribe, request)).toEqual(request)
    for (const extra of [{ path: 'secret.m4a' }, { ffmpegArgs: ['-i'] }, { bands: 100000 }])
      expect(() =>
        parse(ipcChannels.playback.spectrumSubscribe, { ...request, ...extra }),
      ).toThrow()
    for (const patch of [
      { trackId: -1 },
      { currentTime: NaN },
      { currentTime: 604801 },
      { enabled: 'true' },
      { revision: 0.1 },
    ])
      expect(() =>
        parse(ipcChannels.playback.spectrumSubscribe, { ...request, ...patch }),
      ).toThrow()
  })
  it('accepts only a boolean soft-transition flag and never accepts player paths', () => {
    const payload = { action: 'next', session: 1, trackId: 2, trimDigitalSilence: false }
    expect(
      parse(ipcChannels.playback.nativeCommand, { ...payload, softTransition: true }),
    ).toBeTruthy()
    expect(parse(ipcChannels.playback.nativeCommand, payload)).toBeTruthy()
    for (const softTransition of ['true', 2, {}, null])
      expect(() =>
        parse(ipcChannels.playback.nativeCommand, { ...payload, softTransition }),
      ).toThrow(IpcPayloadValidationError)
    expect(() =>
      parse(ipcChannels.playback.nativeCommand, { ...payload, path: 'bridge.wav' }),
    ).toThrow(IpcPayloadValidationError)
  })
  it('accepts representative valid scalar, nested, optional, and batch payloads', () => {
    expect(
      parse('library:get-track-page', { cursor: 'snapshot:cursor', limit: 1_000, refresh: true }),
    ).toEqual({ cursor: 'snapshot:cursor', limit: 1_000, refresh: true })
    expect(
      parse('library:get-album-detail', { albumArtist: 'Artist', albumTitle: 'Album' }),
    ).toEqual({ albumArtist: 'Artist', albumTitle: 'Album' })
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
    expect(parse('window:control', { action: 'toggle-maximize' })).toEqual({
      action: 'toggle-maximize',
    })
  })

  it.each([
    ['library:start-scan', { rootId: 0 }],
    ['library:cancel-scan', { jobId: Number.NaN }],
    ['lyrics:get-by-track-id', { trackId: Number.POSITIVE_INFINITY }],
    ['library:get-track-page', { limit: 5_001 }],
    ['playlists:update-view-mode', { id: 1, viewMode: 'tiles' }],
    ['playback:get-album-tracks', { albumKey: { albumArtist: 'A' } }],
    ['playback:record-effective-play', { trackId: 1, sessionId: 'x', playedAtIso: 'today' }],
    ['archive:get-daily-listening-detail', { date: '02/30/2026' }],
    ['archive:get-daily-album-stats', { date: '02/30/2026' }],
    ['archive:get-listening-ranking', { range: 'quarter', target: 'track' }],
    ['window:control', { action: 'open-devtools' }],
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

  it('accepts structurally valid years and dates without calendar or range checks', () => {
    expect(parse('archive:get-listening-heatmap', { year: 1969 })).toEqual({ year: 1969 })
    expect(parse('archive:get-daily-listening-detail', { date: '2026-02-30' })).toEqual({
      date: '2026-02-30',
    })
    expect(
      parse('metadata:update-track-metadata', {
        trackId: 42,
        title: 'Title',
        artistDisplay: null,
        albumTitle: 'Album',
        albumArtistDisplay: 'Artist',
        genreDisplay: 'Genre',
        year: 0,
        releaseDate: '2026-02-30',
      }),
    ).toBeTruthy()
    expect(() => parse('archive:get-listening-heatmap', { year: Number.NaN })).toThrow(
      /finite number/,
    )
    expect(() =>
      parse('archive:get-listening-heatmap', { year: Number.POSITIVE_INFINITY }),
    ).toThrow(/finite number/)
  })

  it('validates daily album stats date shape while leaving calendar checks to the service', () => {
    expect(parse('archive:get-daily-album-stats', { date: '2026-02-28' })).toEqual({
      date: '2026-02-28',
    })
    expect(parse('archive:get-daily-album-stats', { date: '2026-02-30' })).toEqual({
      date: '2026-02-30',
    })
    expect(() => parse('archive:get-daily-album-stats')).toThrow(IpcPayloadValidationError)
    expect(() => parse('archive:get-daily-album-stats', { date: 20260228 })).toThrow(
      IpcPayloadValidationError,
    )
    expect(() =>
      parse('archive:get-daily-album-stats', { date: '2026-02-28', unexpected: true }),
    ).toThrow(IpcPayloadValidationError)
    expect(() =>
      parseDomainIpcPayload('archive:get-daily-album-stats', [
        { date: '2026-02-28' },
        { date: '2026-02-28' },
      ]),
    ).toThrow(IpcPayloadValidationError)
  })

  it('keeps smart-playlist resource and enum-shape checks without business pairing', () => {
    expect(parse('smart-playlists:create', { name: 'Empty rule', rule: {} })).toBeTruthy()
    expect(
      parse('smart-playlists:create', {
        name: 'Mixed shape',
        rule: {
          expression: {
            type: 'predicate',
            field: 'genre',
            operator: 'has',
            value: 'ambient',
            operands: [{ type: 'predicate', field: 'artist', operator: 'isEmpty' }],
          },
        },
      }),
    ).toBeTruthy()
    expect(() =>
      parse('smart-playlists:create', {
        name: 'Bad enum',
        rule: { expression: { type: 'xor' } },
      }),
    ).toThrow(/unsupported value/)
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
