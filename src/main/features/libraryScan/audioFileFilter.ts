import { extname } from 'node:path'

const audioExtensions = new Set(['.mp3', '.flac', '.m4a', '.aac', '.wav', '.ogg', '.opus'])

export function isSupportedAudioFile(filePath: string): boolean {
  return audioExtensions.has(extname(filePath).toLowerCase())
}
