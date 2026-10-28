import { extname } from 'node:path'

/** Local audio formats shared by scanning, playback and sidecar discovery. */
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
