import FFT from 'fft.js'
import { SPECTRUM_BANDS, SPECTRUM_FFT_SIZE, SPECTRUM_SAMPLE_RATE } from '../types/playbackSpectrum'

/** Reuses FFT scratch buffers; analysis is independent of the output volume. */
export class SpectrumAnalyzer {
  private readonly fft = new FFT(SPECTRUM_FFT_SIZE)
  private readonly input = new Float64Array(SPECTRUM_FFT_SIZE)
  // fft.js interleaves real and imaginary values; only its positive-frequency half is used.
  private readonly spectrum = new Float64Array(SPECTRUM_FFT_SIZE * 2)
  private readonly window = Float64Array.from(
    { length: SPECTRUM_FFT_SIZE },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (SPECTRUM_FFT_SIZE - 1)),
  )
  private readonly windowPower = this.window.reduce((sum, value) => sum + value * value, 0)
  private readonly bins = Array.from({ length: SPECTRUM_BANDS + 1 }, (_, i) =>
    Math.max(
      1,
      Math.round(
        (40 * (11000 / 40) ** (i / SPECTRUM_BANDS) * SPECTRUM_FFT_SIZE) / SPECTRUM_SAMPLE_RATE,
      ),
    ),
  )

  analyze(samples: Float32Array): { bands: number[]; rms: number; bass: number } {
    if (samples.length !== SPECTRUM_FFT_SIZE) throw new Error('Invalid spectrum window')
    let energy = 0
    for (let i = 0; i < SPECTRUM_FFT_SIZE; i++) {
      const sample = Number.isFinite(samples[i]) ? samples[i] : 0
      energy += sample * sample
      this.input[i] = sample * this.window[i]
    }
    this.fft.realTransform(this.spectrum, this.input)
    // Linear band RMS, corrected for Hann window power. Reuse the same FFT;
    // the compressed display bars cannot represent physical low-frequency strength.
    let bassPower = 0
    const firstBassBin = Math.ceil((40 * SPECTRUM_FFT_SIZE) / SPECTRUM_SAMPLE_RATE)
    const lastBassBin = Math.floor((150 * SPECTRUM_FFT_SIZE) / SPECTRUM_SAMPLE_RATE)
    for (let bin = firstBassBin; bin <= lastBassBin; bin++) {
      bassPower += this.spectrum[bin * 2] ** 2 + this.spectrum[bin * 2 + 1] ** 2
    }
    const bass = Math.min(1, Math.sqrt((2 * bassPower) / (SPECTRUM_FFT_SIZE * this.windowPower)))
    const bands = Array.from({ length: SPECTRUM_BANDS }, (_, band) => {
      const first = this.bins[band]
      const end = Math.max(first + 1, this.bins[band + 1])
      let peakPower = 0
      for (let bin = first; bin < end; bin++) {
        peakPower = Math.max(
          peakPower,
          this.spectrum[bin * 2] ** 2 + this.spectrum[bin * 2 + 1] ** 2,
        )
      }
      const amplitude = (Math.sqrt(peakPower) * 4) / SPECTRUM_FFT_SIZE
      // Log compression is for display only; silence remains exactly zero.
      return amplitude < 0.00025
        ? 0
        : Math.max(0, Math.min(1, (20 * Math.log10(amplitude) + 72) / 60))
    })
    return { bands, rms: Math.min(1, Math.sqrt(energy / SPECTRUM_FFT_SIZE)), bass }
  }
}
