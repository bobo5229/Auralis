import { describe, expect, it } from 'vitest'
import { resolveRovingIndex } from './rovingIndex'

describe('resolveRovingIndex', () => {
  it('wraps horizontal and vertical arrows', () => {
    expect(resolveRovingIndex(0, 2, 'ArrowLeft')).toBe(1)
    expect(resolveRovingIndex(0, 2, 'ArrowUp')).toBe(1)
    expect(resolveRovingIndex(1, 2, 'ArrowRight')).toBe(0)
    expect(resolveRovingIndex(1, 2, 'ArrowDown')).toBe(0)
  })

  it('maps Home and End to the edges', () => {
    expect(resolveRovingIndex(1, 2, 'Home')).toBe(0)
    expect(resolveRovingIndex(0, 2, 'End')).toBe(1)
  })

  it('ignores unrelated keys and invalid indexes', () => {
    expect(resolveRovingIndex(0, 2, 'Enter')).toBeNull()
    expect(resolveRovingIndex(-1, 2, 'ArrowRight')).toBeNull()
    expect(resolveRovingIndex(0, 0, 'Home')).toBeNull()
  })
})
