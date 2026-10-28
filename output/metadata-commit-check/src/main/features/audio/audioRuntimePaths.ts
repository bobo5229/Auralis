import { join } from 'node:path'

export function resolveAudioRuntimePaths(environment: {
  isPackaged: boolean
  appPath: string
  resourcesPath: string
}): { mpvPath: string; ffmpegPath: string } {
  const directory = environment.isPackaged
    ? join(environment.resourcesPath, 'audio')
    : join(environment.appPath, 'resources', 'audio')
  return {
    mpvPath: join(directory, 'mpv.exe'),
    ffmpegPath: join(directory, 'ffmpeg.exe'),
  }
}
