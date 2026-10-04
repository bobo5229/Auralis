import { describe, expect, it } from 'vitest'
import type { MissingTrackCandidate } from '@main/repositories/trackRepository'
import { findUniqueRelocationCandidate, type FileIdentity } from './trackRelocationMatcher'

function candidate(overrides: Partial<MissingTrackCandidate> = {}): MissingTrackCandidate {
  return {
    trackId: 1,
    filePath: 'C:\\Music\\old.flac',
    title: 'Track',
    artist: 'Artist',
    album: 'Album',
    durationSeconds: 180,
    fileSize: 1_000,
    isrc: null,
    metadataSignature: null,
    missingSince: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function identity(overrides: Partial<FileIdentity> = {}): FileIdentity {
  return {
    title: 'Track',
    artist: 'Artist',
    album: 'Album',
    isrc: null,
    durationSeconds: 180,
    fileSize: 1_000,
    ...overrides,
  }
}

describe('findUniqueRelocationCandidate', () => {
  it('prefers a unique ISRC match', () => {
    const match = candidate({ trackId: 2, isrc: 'MATCH', title: 'Old title' })
    const result = findUniqueRelocationCandidate(
      [candidate(), match],
      identity({ isrc: 'MATCH', title: 'New title' }),
    )

    expect(result).toBe(match)
  })

  it('keeps a whole-album record separate from a track with the same ISRC', () => {
    const wholeAlbum = candidate({
      title: 'Dua Lipa - Dua Lipa Live from the Royal Albert Hall',
      durationSeconds: 4882.104354166667,
      isrc: 'GBAHT2400723',
    })
    expect(
      findUniqueRelocationCandidate(
        [wholeAlbum],
        identity({
          title: 'Overture (Live from the Royal Albert Hall)',
          durationSeconds: 106.86316666666667,
          isrc: 'GBAHT2400723',
        }),
      ),
    ).toBeNull()
  })

  it('accepts the same ISRC across codecs with close durations and different file sizes', () => {
    const match = candidate({ isrc: 'MATCH', durationSeconds: 180, fileSize: 1_000 })
    expect(
      findUniqueRelocationCandidate(
        [match],
        identity({ isrc: 'MATCH', durationSeconds: 180.067, fileSize: 100_000 }),
      ),
    ).toBe(match)
  })

  it('accepts an ISRC duration difference of 1s and rejects a larger difference', () => {
    const match = candidate({ isrc: 'MATCH' })
    expect(
      findUniqueRelocationCandidate([match], identity({ isrc: 'MATCH', durationSeconds: 181 })),
    ).toBe(match)
    expect(
      findUniqueRelocationCandidate([match], identity({ isrc: 'MATCH', durationSeconds: 181.01 })),
    ).toBeNull()
  })

  it.each([null, 0, Number.NaN, Number.POSITIVE_INFINITY])(
    'does not relocate by ISRC when either duration is unavailable or invalid: %s',
    (duration) => {
      expect(
        findUniqueRelocationCandidate(
          [candidate({ isrc: 'MATCH', durationSeconds: duration })],
          identity({ isrc: 'MATCH' }),
        ),
      ).toBeNull()
      expect(
        findUniqueRelocationCandidate(
          [candidate({ isrc: 'MATCH' })],
          identity({ isrc: 'MATCH', durationSeconds: duration }),
        ),
      ).toBeNull()
    },
  )

  it('does not bypass an ISRC duration conflict using another metadata candidate', () => {
    expect(
      findUniqueRelocationCandidate(
        [candidate({ isrc: 'MATCH', durationSeconds: 4882 }), candidate({ trackId: 2 })],
        identity({ isrc: 'MATCH' }),
      ),
    ).toBeNull()
  })

  it('rejects ambiguous ISRC matches', () => {
    const candidates = [
      candidate({ trackId: 1, isrc: 'MATCH' }),
      candidate({ trackId: 2, isrc: 'MATCH' }),
    ]

    expect(findUniqueRelocationCandidate(candidates, identity({ isrc: 'MATCH' }))).toBeNull()
  })

  it('falls back to metadata when no candidate has the requested ISRC', () => {
    const fallback = candidate({ trackId: 2 })
    const result = findUniqueRelocationCandidate(
      [candidate({ isrc: 'OTHER' }), fallback],
      identity({ isrc: 'MATCH' }),
    )

    expect(result).toBe(fallback)
  })

  it('accepts duration and file-size differences at their boundaries', () => {
    const match = candidate()
    const result = findUniqueRelocationCandidate(
      [match],
      identity({ durationSeconds: 181, fileSize: 1_020 }),
    )

    expect(result).toBe(match)
  })

  it('accepts an unknown album on either side', () => {
    const match = candidate({ album: 'Unknown Album' })
    expect(findUniqueRelocationCandidate([match], identity({ album: 'Renamed Album' }))).toBe(match)
  })

  it.each([
    identity({ durationSeconds: 181.01 }),
    identity({ fileSize: 1_021 }),
    identity({ title: 'Other track' }),
    identity({ artist: 'Other artist' }),
  ])('rejects metadata outside the relocation tolerance', (fileIdentity) => {
    expect(findUniqueRelocationCandidate([candidate()], fileIdentity)).toBeNull()
  })

  it('rejects ambiguous metadata matches', () => {
    expect(
      findUniqueRelocationCandidate(
        [candidate({ trackId: 1 }), candidate({ trackId: 2 })],
        identity(),
      ),
    ).toBeNull()
  })
})
