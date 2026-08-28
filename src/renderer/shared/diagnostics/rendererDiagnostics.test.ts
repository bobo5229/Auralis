import { describe, expect, it, vi } from 'vitest'
import { createRendererDiagnostics, normalizeRendererDiagnosticEvent } from './rendererDiagnostics'

function createSink() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

describe('rendererDiagnostics', () => {
  it('normalizes structured events and summarizes causes without stacks', () => {
    const error = Object.assign(new Error('decode failed at C:\\Music\\private\\song.flac'), {
      code: 'DECODE_FAILURE',
    })

    expect(
      normalizeRendererDiagnosticEvent('error', {
        scope: ' playback.audio ',
        message: ' Audio failed ',
        context: { trackId: 42 },
        cause: error,
      }),
    ).toEqual({
      level: 'error',
      scope: 'playback.audio',
      message: 'Audio failed',
      context: { trackId: 42 },
      cause: {
        name: 'Error',
        message: 'decode failed at [local-path]',
        code: 'DECODE_FAILURE',
      },
    })
  })

  it('redacts sensitive fields and bounds nested context', () => {
    const event = normalizeRendererDiagnosticEvent('warn', {
      scope: 'library.scan',
      message: 'Scan fallback',
      context: {
        filePath: 'D:\\Music\\secret.flac',
        artworkUrl: 'file:///D:/Music/cover.jpg',
        items: Array.from({ length: 20 }, (_, index) => index),
        nested: { one: { two: { three: 'hidden' } } },
      },
    })

    expect(event.context).toEqual({
      filePath: '[redacted]',
      artworkUrl: '[redacted]',
      items: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, '[+8 items]'],
      nested: { one: { two: '[truncated]' } },
    })
  })

  it('filters events below the configured minimum level', () => {
    const sink = createSink()
    const diagnostics = createRendererDiagnostics({ minimumLevel: 'warn', sink })

    diagnostics.info({ scope: 'library.catalog', message: 'Snapshot loaded' })
    diagnostics.warn({ scope: 'playback.gapless', message: 'Using fallback' })
    diagnostics.error({ scope: 'playback.audio', message: 'Audio failed' })

    expect(sink.info).not.toHaveBeenCalled()
    expect(sink.warn).toHaveBeenCalledWith(
      '[Auralis diagnostic]',
      expect.objectContaining({ level: 'warn', scope: 'playback.gapless' }),
    )
    expect(sink.error).toHaveBeenCalledWith(
      '[Auralis diagnostic]',
      expect.objectContaining({ level: 'error', scope: 'playback.audio' }),
    )
  })

  it('never throws when event access or the local sink fails', () => {
    const sink = createSink()
    const diagnostics = createRendererDiagnostics({ sink })
    const hostileContext = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('blocked')
        },
      },
    )

    expect(() =>
      diagnostics.warn({
        scope: 'library.catalog',
        message: 'Refresh failed',
        context: hostileContext,
      }),
    ).not.toThrow()
    expect(sink.warn).toHaveBeenCalledWith('[Auralis diagnostic]', {
      level: 'warn',
      scope: 'renderer.diagnostics',
      message: 'Diagnostic event could not be normalized',
      cause: {
        name: 'DiagnosticNormalizationError',
        message: 'Diagnostic details unavailable',
      },
    })

    sink.error.mockImplementationOnce(() => {
      throw new Error('sink unavailable')
    })
    expect(() =>
      diagnostics.error({ scope: 'playback.audio', message: 'Audio failed' }),
    ).not.toThrow()
  })
})
