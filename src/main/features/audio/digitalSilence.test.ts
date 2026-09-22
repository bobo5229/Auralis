import { describe, expect, it } from 'vitest'
import { DigitalZeroCounter, isConsecutiveAlbumPair, chooseDigitalBoundary } from './digitalSilence'
import { parseDomainIpcPayload } from '@main/ipc/ipcPayloadValidation'

describe('strict digital silence', () => {
  it('preserves tiny nonzero samples and handles partial multichannel frames', () => {
    const samples = [0, -0, 0, 1e-20, 0, 0]
    const bytes = Buffer.alloc(samples.length * 4)
    samples.forEach((value, i) => bytes.writeFloatLE(value, i * 4))
    const counter = new DigitalZeroCounter(2)
    for (let i = 0; i < bytes.length; i += 3) counter.push(bytes.subarray(i, i + 3))
    counter.finish()
    expect(counter.frames).toBe(3)
    expect(counter.leading).toBe(1)
    expect(counter.trailing).toBe(1)
  })
  it('rejects all-silent audio and preserves long pauses', () => {
    const counter = new DigitalZeroCounter(2)
    counter.push(Buffer.alloc(80))
    expect(() => counter.finish()).toThrow()
    expect(
      chooseDigitalBoundary({ frames: 480000, trailing: 2400 }, { leading: 2401 }, 48000),
    ).toBeNull()
    expect(
      chooseDigitalBoundary({ frames: 480000, trailing: 2400 }, { leading: 2400 }, 48000),
    ).toEqual({ start: (2400 + 0.25) / 48000, end: (477600 + 0.25) / 48000 })
  })
  it('requires known same-disc consecutive metadata, not filename order', () => {
    const track = { album: 'Live', artist: 'Artist', track: { no: 1 }, disk: { no: 1 } }
    const next = { ...track, track: { no: 2 } }
    expect(isConsecutiveAlbumPair(track, next)).toBe(true)
    expect(isConsecutiveAlbumPair(track, { ...next, disk: { no: 2 } })).toBe(false)
    expect(isConsecutiveAlbumPair(track, { ...next, track: { no: 3 } })).toBe(false)
    expect(isConsecutiveAlbumPair({ ...track, disk: { no: null } }, next)).toBe(false)
  })
})

describe('native playback capability validation', () => {
  const parse = (value: unknown) => parseDomainIpcPayload('playback:native-command', [value])
  it('accepts bounded playback controls and rejects raw commands and paths', () => {
    expect(
      parse({ action: 'start', session: 1, trackId: 5, volume: 0.8, muted: false }),
    ).toBeDefined()
    for (const value of [
      { action: 'run', session: 1, command: ['quit'] },
      { action: 'start', session: 1, trackId: 5, volume: 0.8, muted: false, path: 'C:/secret' },
      { action: 'seek', session: 1, time: Infinity },
      { action: 'next', session: 1, trackId: -1, trimDigitalSilence: true },
    ])
      expect(() => parse(value)).toThrow()
  })
})
