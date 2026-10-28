import { SPECTRUM_BANDS } from '@shared/types/playbackSpectrum'

/** Fast attack, slower release, bounded output. This is a display envelope, not onset detection. */
export class SpectrumEnvelope {
  readonly values = new Float32Array(SPECTRUM_BANDS)
  update(bands: readonly number[], seconds: number): Float32Array {
    const dt = Math.max(0, Math.min(0.1, seconds))
    for (let index = 0; index < this.values.length; index++) {
      const target = Number.isFinite(bands[index]) ? Math.max(0, Math.min(1, bands[index])) : 0
      const tau = target > this.values[index] ? 0.025 : 0.18
      this.values[index] += (target - this.values[index]) * (1 - Math.exp(-dt / tau))
    }
    return this.values
  }
  reset(): void {
    this.values.fill(0)
  }
}
