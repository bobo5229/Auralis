import { extname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { supportedAudioExtensions } from '@main/features/libraryScan/audioFileFilter'
import { resolveAudioCandidatesForLyricSidecar } from './lyricSidecarPaths'

const expectedCandidatesForBase = (basePath: string): string[] =>
  supportedAudioExtensions.flatMap((extension) => [
    `${basePath}${extension}`,
    `${basePath}${extension.toUpperCase()}`,
  ])

describe('resolveAudioCandidatesForLyricSidecar', () => {
  it('maps song.lrc and song.LRC to the same audio candidates', () => {
    const fromLower = resolveAudioCandidatesForLyricSidecar('D:\\lib\\song.lrc')
    const fromUpper = resolveAudioCandidatesForLyricSidecar('D:\\lib\\song.LRC')

    expect(fromLower).toEqual(fromUpper)
    expect(fromLower).toEqual(expectedCandidatesForBase('D:\\lib\\song'))
  })

  it('includes each supported audio extension in lower and toUpperCase form', () => {
    const candidates = resolveAudioCandidatesForLyricSidecar('D:\\lib\\song.lrc')
    const requiredExtensions = ['.mp3', '.flac', '.m4a', '.aac', '.wav', '.ogg', '.opus']

    expect(requiredExtensions).toEqual([...supportedAudioExtensions])

    for (const extension of requiredExtensions) {
      expect(candidates).toContain(`D:\\lib\\song${extension}`)
      expect(candidates).toContain(`D:\\lib\\song${extension.toUpperCase()}`)
    }
  })

  it('returns [] when the extension is not .lrc / .LRC', () => {
    expect(resolveAudioCandidatesForLyricSidecar('D:\\lib\\song.mp3')).toEqual([])
    expect(resolveAudioCandidatesForLyricSidecar('D:\\lib\\song.txt')).toEqual([])
    expect(resolveAudioCandidatesForLyricSidecar('D:\\lib\\song.lrc.bak')).toEqual([])
  })

  it('returns [] when the path has no extension', () => {
    expect(extname('D:\\lib\\song')).toBe('')
    expect(resolveAudioCandidatesForLyricSidecar('D:\\lib\\song')).toEqual([])
  })

  it('does not rewrite drive-letter case or normalize parent segments', () => {
    expect(resolveAudioCandidatesForLyricSidecar('d:\\lib\\song.lrc')[0]).toBe('d:\\lib\\song.mp3')
    expect(resolveAudioCandidatesForLyricSidecar('D:\\lib\\foo\\..\\song.lrc')[0]).toBe(
      'D:\\lib\\foo\\..\\song.mp3',
    )
  })
})
