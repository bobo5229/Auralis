import { extname } from 'node:path'

export const supportedAudioExtensions = [
  '.mp3',
  '.flac',
  '.m4a',
  '.aac',
  '.wav',
  '.ogg',
  '.opus',
] as const

const audioExtensions = new Set<string>(supportedAudioExtensions)

export function isSupportedAudioFile(filePath: string): boolean {
  return audioExtensions.has(extname(filePath).toLowerCase())
}
