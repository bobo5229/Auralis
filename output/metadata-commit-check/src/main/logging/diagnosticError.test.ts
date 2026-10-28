import { describe, expect, it } from 'vitest'
import { normalizeDiagnosticError, sanitizeDiagnosticText } from './diagnosticError'

describe('normalizeDiagnosticError', () => {
  it('keeps useful error fields while redacting local paths and URLs', () => {
    const error = Object.assign(new Error('Could not open C:\\Users\\Bo Bo\\Music\\private.flac'), {
      code: 'ENOENT',
    })
    error.stack = 'Error: failed\n    at load (D:\\VSCode\\Auralis\\src\\main\\index.ts:10:2)'

    expect(normalizeDiagnosticError(error)).toEqual({
      name: 'Error',
      message: 'Could not open <redacted-path>',
      code: 'ENOENT',
      stack: 'Error: failed\n    at load (<redacted-path>)',
    })
    expect(sanitizeDiagnosticText('request https://example.test/a?token=secret', 1_000)).toBe(
      'request <redacted-url>',
    )
    expect(sanitizeDiagnosticText('request auralis-audio://track/42', 1_000)).toBe(
      'request <redacted-url>',
    )
  })

  it('bounds strings before they are recorded', () => {
    const normalized = normalizeDiagnosticError('x'.repeat(5_000))

    expect(normalized.message).toHaveLength(1_024)
    expect(normalized.message.endsWith('…')).toBe(true)
  })

  it('does not invoke object serialization or propagate hostile getters', () => {
    const rejection = new Proxy(
      {},
      {
        get() {
          throw new Error('getter failure')
        },
      },
    )

    expect(normalizeDiagnosticError(rejection)).toEqual({
      name: 'Error',
      message: 'Unknown object rejection',
    })
  })
})
