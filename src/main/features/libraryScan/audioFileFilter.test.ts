import { describe, expect, it } from 'vitest'
import { isSupportedAudioFile, supportedAudioExtensions } from './audioFileFilter'

describe('audioFileFilter', () => {
  it.each(supportedAudioExtensions)('accepts %s files', (extension) => {
    expect(isSupportedAudioFile(`C:\\Music\\track${extension}`)).toBe(true)
  })

  it('matches extensions case-insensitively', () => {
    expect(isSupportedAudioFile('C:\\Music\\track.FLAC')).toBe(true)
  })

  it.each(['track', 'track.txt', 'track.mp3.tmp', '.mp3-folder'])('rejects %s', (fileName) => {
    expect(isSupportedAudioFile(`C:\\Music\\${fileName}`)).toBe(false)
  })
})
