import { describe, expect, it } from 'vitest'
import { resolveArchiveYear } from './archiveYear'

describe('archive year navigation', () => {
  it.each(['1900', '2025', '9999'])(
    'restores the supported year %s from a return link',
    (value) => {
      expect(resolveArchiveYear(value, 2026)).toBe(Number(value))
    },
  )
  it.each([undefined, null, ['2025'], '1899', '10000', '2025.5', '2e3', '', 2025])(
    'uses the current year for an unsupported query value: %s',
    (value) => {
      expect(resolveArchiveYear(value, 2026)).toBe(2026)
    },
  )
})
