export interface AudioDecodeProbe {
  fileSize: number
  fileMtimeMs: number
  durationSeconds: number
  numberOfChannels: number
  sampleRate: number
}

export interface AudioResource {
  url: string
  decodeProbe?: AudioDecodeProbe | null
}

export const AUDIO_FILE_SIZE_HEADER = 'X-Auralis-File-Size'
export const AUDIO_FILE_MTIME_HEADER = 'X-Auralis-File-Mtime'
