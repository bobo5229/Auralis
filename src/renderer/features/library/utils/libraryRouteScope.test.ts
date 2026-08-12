import { describe, expect, it } from 'vitest'
import { isSameLibraryRouteScope } from './libraryRouteScope'

describe('isSameLibraryRouteScope', () => {
  it('matches route kinds and scoped ids', () => {
    expect(isSameLibraryRouteScope({ kind: 'library' }, { kind: 'library' })).toBe(true)
    expect(isSameLibraryRouteScope({ kind: 'playlist', id: 7 }, { kind: 'playlist', id: 7 })).toBe(
      true,
    )
    expect(
      isSameLibraryRouteScope({ kind: 'smart-playlist', id: 7 }, { kind: 'smart-playlist', id: 8 }),
    ).toBe(false)
    expect(
      isSameLibraryRouteScope({ kind: 'playlist', id: 7 }, { kind: 'smart-playlist', id: 7 }),
    ).toBe(false)
  })
})
