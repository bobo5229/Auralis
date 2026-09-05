import { describe, expect, it } from 'vitest'
import { createPlaybackRequestGate } from './playbackRequestGate'

describe('playback request gate', () => {
  it('allows the active request to finish and clear pending', () => {
    const gate = createPlaybackRequestGate()
    const token = gate.begin()

    expect(gate.isCurrent(token)).toBe(true)
    expect(gate.finish(token)).toBe(true)
    expect(gate.isCurrent(token)).toBe(false)
    expect(gate.finish(token)).toBe(false)
  })

  it('keeps a newer request active when an older request finishes late', () => {
    const gate = createPlaybackRequestGate()
    const first = gate.begin()
    const second = gate.begin()

    expect(gate.isCurrent(first)).toBe(false)
    expect(gate.isCurrent(second)).toBe(true)
    expect(gate.finish(first)).toBe(false)
    expect(gate.isCurrent(second)).toBe(true)
    expect(gate.finish(second)).toBe(true)
  })

  it('invalidates a request when the playback instance is removed', () => {
    const gate = createPlaybackRequestGate()
    const token = gate.begin()

    gate.invalidate()

    expect(gate.isCurrent(token)).toBe(false)
    expect(gate.finish(token)).toBe(false)
  })
})
