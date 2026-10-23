import { describe, expect, it } from 'vitest'
import {
  isLibrarySearchBarHovered,
  librarySearchBarWidth,
  resolveHiddenLibrarySearchBarRect,
} from './librarySearchHover'

describe('library search hover target', () => {
  it('includes the external parameter button and gap before mounting, and shrinks the input first', () => {
    const container = { left: 0, top: 0, width: 800 }
    const tools = resolveHiddenLibrarySearchBarRect(container, true)
    expect(tools).toEqual({ left: 197, right: 603, top: 8, bottom: 46 })
    expect(isLibrarySearchBarHovered(565, 20, container, null, true)).toBe(true)
    expect(isLibrarySearchBarHovered(600, 20, container, null, true)).toBe(true)
    expect(isLibrarySearchBarHovered(604, 20, container, null, true)).toBe(false)
    expect(librarySearchBarWidth(300, true)).toBe(252)
    expect(librarySearchBarWidth(800)).toBe(360)
  })
  it('ignores the top corners and hits the centered resting bar', () => {
    const container = { left: 0, top: 100, width: 800 }
    const hidden = resolveHiddenLibrarySearchBarRect(container)

    expect(hidden).toEqual({ left: 220, right: 580, top: 108, bottom: 146 })
    expect(isLibrarySearchBarHovered(50, 120, container, null)).toBe(false)
    expect(isLibrarySearchBarHovered(750, 120, container, null)).toBe(false)
    expect(isLibrarySearchBarHovered(400, 120, container, null)).toBe(true)
    expect(isLibrarySearchBarHovered(400, 200, container, null)).toBe(false)
  })

  it('uses the mounted bar rect, including a narrow panel width', () => {
    const container = { left: 40, top: 10, width: 300 }
    const hidden = resolveHiddenLibrarySearchBarRect(container)
    const mounted = { ...hidden }

    expect(librarySearchBarWidth(300)).toBe(252)
    expect(hidden.right - hidden.left).toBe(252)
    expect(isLibrarySearchBarHovered(hidden.left, hidden.top + 8, container, null)).toBe(true)
    expect(isLibrarySearchBarHovered(hidden.left, hidden.top + 8, container, mounted)).toBe(true)
    expect(isLibrarySearchBarHovered(hidden.left - 1, hidden.top + 8, container, null)).toBe(false)
    expect(isLibrarySearchBarHovered(hidden.left - 1, hidden.top + 8, container, mounted)).toBe(
      false,
    )
    expect(isLibrarySearchBarHovered(hidden.right + 1, hidden.top + 8, container, mounted)).toBe(
      false,
    )
  })
})
