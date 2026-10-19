import { describe, expect, it } from 'vitest'
import { decodeScanFileFingerprint, encodeScanFileFingerprint } from './libraryScanFileFingerprint'

describe('persisted scan file fingerprint', () => {
  it('round trips every stat field without rounding timestamps', () => {
    const file = { size: 100, mtimeMs: 123.25, ctimeMs: 456.75, dev: 1, ino: 2 }
    expect(encodeScanFileFingerprint(file)).toBe('[100,123.25,456.75,1,2]')
    expect(decodeScanFileFingerprint('[100,123.25,456.75,1,2]')).toEqual(file)
  })

  it.each([null, '', '{', '[100,123]', '[100,123,456,1,null]', '[100,123,456,1,"2"]'])(
    'treats missing or invalid stored data as an unknown baseline: %s',
    (value) => {
      expect(decodeScanFileFingerprint(value)).toBeNull()
    },
  )

  it('does not publish an incomplete or nonfinite stat as a checked baseline', () => {
    expect(encodeScanFileFingerprint(undefined)).toBeNull()
    expect(
      encodeScanFileFingerprint({ size: 100, mtimeMs: 1, ctimeMs: Number.NaN, dev: 1, ino: 1 }),
    ).toBeNull()
  })
})
