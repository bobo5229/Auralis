import { describe, expect, it } from 'vitest'
import {
  buildDesktopLyricsPayload,
  getDesktopLyricsPayloadKey,
  getPlainLyricLines,
} from './buildDesktopLyricsPayload'

describe('getPlainLyricLines', () => {
  it('handles null and empty lyrics', () => {
    expect(getPlainLyricLines(null)).toEqual([])
    expect(getPlainLyricLines('')).toEqual([])
    expect(getPlainLyricLines('   \n  \n')).toEqual([])
  })

  it('splits and trims non-empty lines', () => {
    const raw = '  Line 1  \n\n  Line 2\nLine 3   '
    expect(getPlainLyricLines(raw)).toEqual(['Line 1', 'Line 2', 'Line 3'])
  })
})

describe('buildDesktopLyricsPayload', () => {
  const defaultTrack = {
    id: 42,
    title: 'Test Song',
    artist: 'Test Artist',
  }

  const identityFormat = (v: string) => v

  it('returns idle payload when track is null', () => {
    const payload = buildDesktopLyricsPayload({
      track: null,
      isPlaying: false,
      lyricsStatus: 'no-track' as const,
      rawLyrics: null,
      parsedLines: [],
      activeIndex: -1,
      showPrelude: false,
      preludeLitDotCount: 0,
      loadingText: 'Loading...',
      emptyText: 'No lyrics',
      formatText: identityFormat,
    })

    expect(payload).toEqual({
      trackId: null,
      title: null,
      artist: null,
      currentLine: '',
      nextLine: '',
      status: 'idle',
      isPlaying: false,
    })
  })

  it('maps no-track status to idle even when track is present (fallback)', () => {
    const payload = buildDesktopLyricsPayload({
      track: defaultTrack,
      isPlaying: true,
      lyricsStatus: 'no-track' as const,
      rawLyrics: null,
      parsedLines: [],
      activeIndex: -1,
      showPrelude: false,
      preludeLitDotCount: 0,
      loadingText: 'Loading...',
      emptyText: 'No lyrics',
      formatText: identityFormat,
    })

    expect(payload.status).toBe('idle')
    expect(payload.currentLine).toBe('')
    expect(payload.nextLine).toBe('')
  })

  it('handles loading status with loadingText', () => {
    const payload = buildDesktopLyricsPayload({
      track: defaultTrack,
      isPlaying: true,
      lyricsStatus: 'loading' as const,
      rawLyrics: null,
      parsedLines: [],
      activeIndex: -1,
      showPrelude: false,
      preludeLitDotCount: 0,
      loadingText: 'Loading lyrics...',
      emptyText: 'No lyrics',
      formatText: identityFormat,
    })

    expect(payload).toEqual({
      trackId: 42,
      title: 'Test Song',
      artist: 'Test Artist',
      currentLine: 'Loading lyrics...',
      nextLine: '',
      status: 'loading',
      isPlaying: true,
    })
  })

  it('handles empty status with emptyText', () => {
    const payload = buildDesktopLyricsPayload({
      track: defaultTrack,
      isPlaying: false,
      lyricsStatus: 'empty' as const,
      rawLyrics: null,
      parsedLines: [],
      activeIndex: -1,
      showPrelude: false,
      preludeLitDotCount: 0,
      loadingText: 'Loading...',
      emptyText: 'No lyrics available',
      formatText: identityFormat,
    })

    expect(payload).toEqual({
      trackId: 42,
      title: 'Test Song',
      artist: 'Test Artist',
      currentLine: 'No lyrics available',
      nextLine: '',
      status: 'empty',
      isPlaying: false,
    })
  })

  it('handles plain lyrics with two lines', () => {
    const payload = buildDesktopLyricsPayload({
      track: defaultTrack,
      isPlaying: true,
      lyricsStatus: 'plain' as const,
      rawLyrics: 'First Line\nSecond Line\nThird Line',
      parsedLines: [],
      activeIndex: -1,
      showPrelude: false,
      preludeLitDotCount: 0,
      loadingText: 'Loading...',
      emptyText: 'No lyrics',
      formatText: identityFormat,
    })

    expect(payload.currentLine).toBe('First Line')
    expect(payload.nextLine).toBe('Second Line')
    expect(payload.status).toBe('plain')
  })

  it('handles plain lyrics with only one line or empty plain lyrics', () => {
    const oneLinePayload = buildDesktopLyricsPayload({
      track: defaultTrack,
      isPlaying: true,
      lyricsStatus: 'plain' as const,
      rawLyrics: 'Solo Line',
      parsedLines: [],
      activeIndex: -1,
      showPrelude: false,
      preludeLitDotCount: 0,
      loadingText: 'Loading...',
      emptyText: 'No lyrics',
      formatText: identityFormat,
    })

    expect(oneLinePayload.currentLine).toBe('Solo Line')
    expect(oneLinePayload.nextLine).toBe('')

    const emptyPlainPayload = buildDesktopLyricsPayload({
      track: defaultTrack,
      isPlaying: true,
      lyricsStatus: 'plain' as const,
      rawLyrics: '   \n  ',
      parsedLines: [],
      activeIndex: -1,
      showPrelude: false,
      preludeLitDotCount: 0,
      loadingText: 'Loading...',
      emptyText: 'No lyrics',
      formatText: identityFormat,
    })

    expect(emptyPlainPayload.currentLine).toBe('No lyrics')
    expect(emptyPlainPayload.nextLine).toBe('')
  })

  it('handles lrc lyrics with current and next line', () => {
    const parsedLines = [
      { id: '1', text: 'Line 1' },
      { id: '2', text: 'Line 2' },
      { id: '3', text: 'Line 3' },
    ]

    const payload = buildDesktopLyricsPayload({
      track: defaultTrack,
      isPlaying: true,
      lyricsStatus: 'lrc' as const,
      rawLyrics: null,
      parsedLines,
      activeIndex: 1,
      showPrelude: false,
      preludeLitDotCount: 0,
      loadingText: 'Loading...',
      emptyText: 'No lyrics',
      formatText: identityFormat,
    })

    expect(payload.currentLine).toBe('Line 2')
    expect(payload.nextLine).toBe('Line 3')
    expect(payload.status).toBe('lrc')
  })

  it('handles lrc empty text filtering and id alignment', () => {
    const parsedLines = [
      { id: '1', text: 'Intro line' },
      { id: '2', text: '' }, // empty text line
      { id: '3', text: 'Chorus line' },
      { id: '4', text: 'Outro line' },
    ]

    // When activeIndex points to line 3 (Chorus line)
    const payload = buildDesktopLyricsPayload({
      track: defaultTrack,
      isPlaying: true,
      lyricsStatus: 'lrc' as const,
      rawLyrics: null,
      parsedLines,
      activeIndex: 2,
      showPrelude: false,
      preludeLitDotCount: 0,
      loadingText: 'Loading...',
      emptyText: 'No lyrics',
      formatText: identityFormat,
    })

    expect(payload.currentLine).toBe('Chorus line')
    expect(payload.nextLine).toBe('Outro line')
  })

  it('handles prelude dots and next line when activeIndex < 0', () => {
    const parsedLines = [
      { id: '1', text: 'First active line' },
      { id: '2', text: 'Second active line' },
    ]

    const payloadPrelude = buildDesktopLyricsPayload({
      track: defaultTrack,
      isPlaying: true,
      lyricsStatus: 'lrc' as const,
      rawLyrics: null,
      parsedLines,
      activeIndex: -1,
      showPrelude: true,
      preludeLitDotCount: 3,
      loadingText: 'Loading...',
      emptyText: 'No lyrics',
      formatText: identityFormat,
    })

    expect(payloadPrelude.currentLine).toBe('...')
    expect(payloadPrelude.nextLine).toBe('First active line')

    const payloadNoPrelude = buildDesktopLyricsPayload({
      track: defaultTrack,
      isPlaying: true,
      lyricsStatus: 'lrc' as const,
      rawLyrics: null,
      parsedLines,
      activeIndex: -1,
      showPrelude: false,
      preludeLitDotCount: 0,
      loadingText: 'Loading...',
      emptyText: 'No lyrics',
      formatText: identityFormat,
    })

    expect(payloadNoPrelude.currentLine).toBe('')
    expect(payloadNoPrelude.nextLine).toBe('First active line')
  })

  it('applies formatText to both currentLine and nextLine', () => {
    const uppercaseFormat = (text: string) => text.toUpperCase()

    const payload = buildDesktopLyricsPayload({
      track: defaultTrack,
      isPlaying: true,
      lyricsStatus: 'plain' as const,
      rawLyrics: 'hello world\nfoo bar',
      parsedLines: [],
      activeIndex: -1,
      showPrelude: false,
      preludeLitDotCount: 0,
      loadingText: 'Loading...',
      emptyText: 'No lyrics',
      formatText: uppercaseFormat,
    })

    expect(payload.currentLine).toBe('HELLO WORLD')
    expect(payload.nextLine).toBe('FOO BAR')
  })
})

describe('getDesktopLyricsPayloadKey', () => {
  it('generates consistent key for identical payloads', () => {
    const payload1 = {
      trackId: 10,
      title: 'Title',
      artist: 'Artist',
      currentLine: 'Line 1',
      nextLine: 'Line 2',
      status: 'lrc' as const,
      isPlaying: true,
    }
    const payload2 = { ...payload1 }

    expect(getDesktopLyricsPayloadKey(payload1)).toBe(getDesktopLyricsPayloadKey(payload2))
  })

  it('changes key when isPlaying changes', () => {
    const payload1 = {
      trackId: 10,
      title: 'Title',
      artist: 'Artist',
      currentLine: 'Line 1',
      nextLine: 'Line 2',
      status: 'lrc' as const,
      isPlaying: true,
    }
    const payload2 = {
      ...payload1,
      isPlaying: false,
    }

    expect(getDesktopLyricsPayloadKey(payload1)).not.toBe(getDesktopLyricsPayloadKey(payload2))
  })

  it('changes key when lines, track, or status change', () => {
    const base = {
      trackId: 10,
      title: 'Title',
      artist: 'Artist',
      currentLine: 'Line 1',
      nextLine: 'Line 2',
      status: 'lrc' as const,
      isPlaying: true,
    }

    expect(getDesktopLyricsPayloadKey(base)).not.toBe(
      getDesktopLyricsPayloadKey({ ...base, currentLine: 'Line 1 modified' }),
    )
    expect(getDesktopLyricsPayloadKey(base)).not.toBe(
      getDesktopLyricsPayloadKey({ ...base, nextLine: 'Line 2 modified' }),
    )
    expect(getDesktopLyricsPayloadKey(base)).not.toBe(
      getDesktopLyricsPayloadKey({ ...base, trackId: 11 }),
    )
    expect(getDesktopLyricsPayloadKey(base)).not.toBe(
      getDesktopLyricsPayloadKey({ ...base, status: 'plain' }),
    )
  })
})
