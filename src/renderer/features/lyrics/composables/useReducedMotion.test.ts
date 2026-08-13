import { describe, expect, it } from 'vitest'
import { useReducedMotion } from './useReducedMotion'

function createFakeQuery(initial: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>()
  return {
    matches: initial,
    addEventListener: (type: string, listener: (event: { matches: boolean }) => void) => {
      if (type === 'change') listeners.add(listener)
    },
    removeEventListener: (type: string, listener: (event: { matches: boolean }) => void) => {
      if (type === 'change') listeners.delete(listener)
    },
    emit: (matches: boolean) => {
      for (const listener of [...listeners]) listener({ matches })
    },
  }
}

function createReducedMotion(initial: boolean) {
  const query = createFakeQuery(initial)
  const reduced = useReducedMotion(() => query as unknown as MediaQueryList)
  return { query, reduced }
}

describe('useReducedMotion', () => {
  it('reflects the initial media query state', () => {
    const { reduced } = createReducedMotion(true)
    expect(reduced.matches.value).toBe(true)
  })

  it('tracks preference changes', () => {
    const { query, reduced } = createReducedMotion(false)
    expect(reduced.matches.value).toBe(false)
    query.emit(true)
    expect(reduced.matches.value).toBe(true)
    query.emit(false)
    expect(reduced.matches.value).toBe(false)
  })

  it('stops tracking after dispose', () => {
    const { query, reduced } = createReducedMotion(true)
    reduced.dispose()
    query.emit(false)
    expect(reduced.matches.value).toBe(true)
  })
})
