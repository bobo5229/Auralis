import { describe, expect, it } from 'vitest'
import { resolveArchiveFontFamily } from './resolveArchiveFontFamily'

describe('resolveArchiveFontFamily', () => {
  const fallback = "'Plus Jakarta Sans', 'Auralis Archive CJK', sans-serif"

  it('keeps an already resolved family stack', () => {
    expect(
      resolveArchiveFontFamily("'Plus Jakarta Sans', 'Auralis Archive CJK', sans-serif", fallback),
    ).toBe("'Plus Jakarta Sans', 'Auralis Archive CJK', sans-serif")
  })

  it('uses the fallback for a missing family token', () => {
    expect(resolveArchiveFontFamily('  ', fallback)).toBe(fallback)
  })

  it('uses the fallback when a computed token still contains var()', () => {
    expect(resolveArchiveFontFamily('var(--auralis-font-latin), serif', fallback)).toBe(fallback)
  })
})
