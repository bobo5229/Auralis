import { describe, expect, it } from 'vitest'
import { SpectrumAnalyzer } from './spectrumAnalysis'
import { SPECTRUM_BANDS, SPECTRUM_FFT_SIZE, SPECTRUM_SAMPLE_RATE } from '../types/playbackSpectrum'

describe('real audio spectrum', () => {
  it.each([70, 220, 1000, 8000])(
    'locates a %i Hz tone in its logarithmic frequency band',
    (frequency) => {
      const samples = Float32Array.from(
        { length: SPECTRUM_FFT_SIZE },
        (_, i) => 0.15 * Math.sin((2 * Math.PI * frequency * i) / SPECTRUM_SAMPLE_RATE),
      )
      const result = new SpectrumAnalyzer().analyze(samples)
      const peak = result.bands.indexOf(Math.max(...result.bands))
      const expected = Math.floor(
        (Math.log(frequency / 40) / Math.log(11000 / 40)) * SPECTRUM_BANDS,
      )
      expect(Math.abs(peak - expected)).toBeLessThanOrEqual(1)
      expect(result.rms).toBeCloseTo(0.15 / Math.sqrt(2), 2)
      expect(
        result.bands.every((value) => Number.isFinite(value) && value >= 0 && value <= 1),
      ).toBe(true)
    },
  )
  it('returns silence as zero and responds to amplitude without inventing beats', () => {
    const analyzer = new SpectrumAnalyzer()
    expect(analyzer.analyze(new Float32Array(SPECTRUM_FFT_SIZE))).toEqual({
      bands: Array(SPECTRUM_BANDS).fill(0),
      rms: 0,
      bass: 0,
    })
    const tone = (amplitude: number) =>
      Float32Array.from(
        { length: SPECTRUM_FFT_SIZE },
        (_, i) => amplitude * Math.sin((2 * Math.PI * 70 * i) / SPECTRUM_SAMPLE_RATE),
      )
    const quiet = analyzer.analyze(tone(0.005))
    const loud = analyzer.analyze(tone(0.2))
    expect(Math.max(...loud.bands)).toBeGreaterThan(Math.max(...quiet.bands))
    expect(analyzer.analyze(tone(0.2))).toEqual(loud)
    expect(analyzer.analyze(new Float32Array(SPECTRUM_FFT_SIZE))).toEqual({
      bands: Array(SPECTRUM_BANDS).fill(0),
      rms: 0,
      bass: 0,
    })
  })

  it('measures linear low-band strength and rejects distant high frequencies', () => {
    const analyzer = new SpectrumAnalyzer()
    const tone = (frequency: number, amplitude: number) =>
      Float32Array.from(
        { length: SPECTRUM_FFT_SIZE },
        (_, i) => amplitude * Math.sin((2 * Math.PI * frequency * i) / SPECTRUM_SAMPLE_RATE),
      )
    const quiet = analyzer.analyze(tone(70, 0.02)).bass
    const loud = analyzer.analyze(tone(70, 0.2)).bass
    expect(loud).toBeCloseTo(0.2 / Math.sqrt(2), 3)
    expect(loud / quiet).toBeCloseTo(10, 5)
    expect(analyzer.analyze(tone(1000, 0.2)).bass).toBeLessThan(0.00025)
  })

  it('matches a direct Fourier sum for an off-bin multitone signal', () => {
    const samples = Float32Array.from(
      { length: SPECTRUM_FFT_SIZE },
      (_, i) =>
        0.01 * Math.sin((2 * Math.PI * 70.25 * i) / SPECTRUM_SAMPLE_RATE) +
        0.018 * Math.cos((2 * Math.PI * 996.1 * i) / SPECTRUM_SAMPLE_RATE) +
        0.006 * Math.sin((2 * Math.PI * 8200.3 * i) / SPECTRUM_SAMPLE_RATE),
    )
    const windowed = Float64Array.from(
      samples,
      (sample, i) => sample * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (SPECTRUM_FFT_SIZE - 1))),
    )
    // Independent O(N²) DFT oracle, rather than another FFT or the library under test.
    const magnitudes = Array.from({ length: SPECTRUM_FFT_SIZE / 2 }, (_, bin) => {
      let real = 0,
        imaginary = 0
      for (let i = 0; i < windowed.length; i++) {
        const angle = (2 * Math.PI * bin * i) / SPECTRUM_FFT_SIZE
        real += windowed[i] * Math.cos(angle)
        imaginary -= windowed[i] * Math.sin(angle)
      }
      return Math.hypot(real, imaginary)
    })
    const boundaries = Array.from({ length: SPECTRUM_BANDS + 1 }, (_, band) =>
      Math.max(
        1,
        Math.round(
          (40 * (11000 / 40) ** (band / SPECTRUM_BANDS) * SPECTRUM_FFT_SIZE) / SPECTRUM_SAMPLE_RATE,
        ),
      ),
    )
    const actual = new SpectrumAnalyzer().analyze(samples)
    for (let band = 0; band < SPECTRUM_BANDS; band++) {
      const first = boundaries[band]
      const end = Math.max(first + 1, boundaries[band + 1])
      const amplitude = (Math.max(...magnitudes.slice(first, end)) * 4) / SPECTRUM_FFT_SIZE
      const expected =
        amplitude < 0.00025 ? 0 : Math.max(0, Math.min(1, (20 * Math.log10(amplitude) + 72) / 60))
      expect(actual.bands[band]).toBeCloseTo(expected, 10)
    }
  })
})
