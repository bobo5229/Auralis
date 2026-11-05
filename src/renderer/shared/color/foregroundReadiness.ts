import type { RgbColor } from './types'

/** Foreground coordination result, expressed in the document's performance clock. */
export interface ForegroundReadiness {
  target: RgbColor
  readyAt: number
}
