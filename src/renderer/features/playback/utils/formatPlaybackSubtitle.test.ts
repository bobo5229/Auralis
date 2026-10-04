import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '@renderer/i18n'
import type { PlaybackTrack } from '../types'
import { formatPlaybackSubtitle } from './formatPlaybackSubtitle'
import { formatGenre } from '../../library/utils/formatGenre'

describe('playback multi-value display', () => {
  afterEach(() => {
    i18n.global.locale.value = 'zh-Hans'
  })
  it('localizes only the missing metadata fallback in both directions', () => {
    const empty = { artist: null, albumArtist: null, album: null } as PlaybackTrack
    expect(formatPlaybackSubtitle(empty)).toBe('未知艺人')
    i18n.global.locale.value = 'en'
    expect(formatPlaybackSubtitle(empty)).toBe('Unknown artist')
    expect(
      formatPlaybackSubtitle({
        artist: '真实艺术家',
        albumArtist: null,
        album: '原文专辑',
      } as PlaybackTrack),
    ).toBe('真实艺术家 - 原文专辑')
    i18n.global.locale.value = 'zh-Hans'
    expect(formatPlaybackSubtitle(empty)).toBe('未知艺人')
  })
  it.each([
    ['A; B', 'A & B'],
    ['A; B; C', 'A, B & C'],
    ['AC/DC; Tyler, The Creator', 'AC/DC & Tyler, The Creator'],
    ['A;B', 'A;B'],
    ['A；B', 'A；B'],
    ['R&B/Soul; Hip-Hop/Rap', 'R&B/Soul & Hip-Hop/Rap'],
  ])('uses canonical parsing for %s', (value, display) => {
    expect(formatGenre(value)).toBe(display)
    expect(
      formatPlaybackSubtitle({ artist: value, albumArtist: null, album: 'Album' } as PlaybackTrack),
    ).toBe(`${display} - Album`)
    expect(
      formatPlaybackSubtitle({
        artist: 'Other',
        albumArtist: value,
        album: 'Album',
      } as PlaybackTrack),
    ).toBe(`${display} - Album`)
  })
})
