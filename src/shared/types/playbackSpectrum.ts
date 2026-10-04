export const SPECTRUM_BANDS = 32
export const SPECTRUM_SAMPLE_RATE = 24000
export const SPECTRUM_FFT_SIZE = 2048
export const SPECTRUM_HOP_SIZE = 1024
export const SPECTRUM_CHANNELS = 2

/** Closed subscription: the main process resolves IDs; no paths or decoder options. */
export interface SpectrumSubscription {
  subscriptionId: number
  revision: number
  enabled: boolean
  trackId: number | null
  currentTime: number
  isPlaying: boolean
}

export interface PlaybackSpectrumFrame {
  subscriptionId: number
  epoch: number
  sequence: number
  trackId: number | null
  currentTime: number
  status: 'ready' | 'waiting' | 'paused' | 'unavailable'
  /** Bounded display magnitudes, low to high frequency. Not beat/onset events. */
  bands: number[]
  rms: number
  /** Linear RMS in 40–150 Hz, independent of display compression and output volume. */
  bass: number
}
