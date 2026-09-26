import { describe, expect, it } from 'vitest'
import { resolveMenuNavigationIndex } from './menuKeyboardNavigation'

describe('menu keyboard navigation', () => {
  const enabled = [1, 3, 4]

  it('skips disabled items and wraps at both ends', () => {
    expect(resolveMenuNavigationIndex('ArrowDown', 1, enabled)).toBe(3)
    expect(resolveMenuNavigationIndex('ArrowUp', 3, enabled)).toBe(1)
    expect(resolveMenuNavigationIndex('ArrowDown', 4, enabled)).toBe(1)
    expect(resolveMenuNavigationIndex('ArrowUp', 1, enabled)).toBe(4)
  })

  it('enters from either direction when focus is missing or the item becomes disabled', () => {
    expect(resolveMenuNavigationIndex('ArrowDown', -1, enabled)).toBe(1)
    expect(resolveMenuNavigationIndex('ArrowUp', 2, enabled)).toBe(4)
  })

  it('uses the first and last enabled items for Home and End', () => {
    expect(resolveMenuNavigationIndex('Home', 3, enabled)).toBe(1)
    expect(resolveMenuNavigationIndex('End', 3, enabled)).toBe(4)
  })

  it('leaves activation, closing and empty menus to the caller', () => {
    expect(resolveMenuNavigationIndex('Enter', 1, enabled)).toBeNull()
    expect(resolveMenuNavigationIndex('Escape', 1, enabled)).toBeNull()
    expect(resolveMenuNavigationIndex('ArrowDown', -1, [])).toBeNull()
    expect(resolveMenuNavigationIndex('ArrowUp', 2, [2])).toBe(2)
  })
})
