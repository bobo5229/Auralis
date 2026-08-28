import { describe, expect, it } from 'vitest'
import { sanitizeLogValue, sanitizeSerializedLogLine } from './logSanitizer'

describe('logSanitizer', () => {
  it('redacts sensitive keys, local paths, URLs, nested errors, and circular values', () => {
    const value: Record<string, unknown> = {
      token: 'top-secret',
      nested: {
        api_key: 'also-secret',
        filePath: 'C:\\Users\\Listener\\Music\\private.flac',
        sourceUrl: 'https://example.test/private?token=secret',
        error: new Error('Cannot read D:\\Music\\album\\song.flac'),
      },
    }
    value.circular = value

    expect(sanitizeLogValue(value)).toMatchObject({
      token: '<redacted>',
      nested: {
        api_key: '<redacted>',
        filePath: '<redacted-path>',
        sourceUrl: '<redacted-url>',
        error: { message: 'Cannot read <redacted-path>' },
      },
      circular: '<circular>',
    })
  })

  it('re-sanitizes serialized JSON before persistence or export', () => {
    const line = JSON.stringify({
      authorization: 'Bearer private',
      path: 'C:\\Users\\Listener\\Music\\song.flac',
      url: 'https://example.test/private',
    })

    expect(JSON.parse(sanitizeSerializedLogLine(line))).toEqual({
      authorization: '<redacted>',
      path: '<redacted-path>',
      url: '<redacted-url>',
    })
  })
})
