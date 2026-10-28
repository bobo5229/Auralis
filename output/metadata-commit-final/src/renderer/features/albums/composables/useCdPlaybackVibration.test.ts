import { afterEach, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { PlaybackSpectrumFrame } from '@shared/types/playbackSpectrum'
import { usePlaybackSpectrum } from '@renderer/features/playback/composables/usePlaybackSpectrum'
import { createCdVibrationMotion } from '../utils/cdVibrationMotion'
import { useCdPlaybackVibration } from './useCdPlaybackVibration'

vi.mock('@renderer/features/playback/composables/usePlaybackSpectrum', () => ({
  usePlaybackSpectrum: vi.fn(),
}))
vi.mock('../utils/cdVibrationMotion', () => ({ createCdVibrationMotion: vi.fn() }))
const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
})

it('gates spectrum and vibration by focus, track, load, preference and preview state', () => {
  const receive = vi.fn(),
    stop = vi.fn(),
    setOffset = vi.fn()
  vi.mocked(createCdVibrationMotion).mockReturnValue({ receive, stop })
  const options = {
    focusSettled: ref(false),
    trackMatches: ref(true),
    loading: ref(false),
    failed: ref(false),
    motionReduced: ref(false),
    enabled: ref(true),
    style: ref<'smooth' | 'elastic'>('smooth'),
    showPreview: () => preview.value,
    setOffset,
  }
  const preview = ref(false)
  const scope = effectScope()
  scopes.push(scope)
  const session = scope.run(() => useCdPlaybackVibration(options))!
  const spectrum = vi.mocked(usePlaybackSpectrum).mock.calls.at(-1)![0]
  const active = spectrum.enabled as { value: boolean }
  const frame = { sequence: 1 } as unknown as PlaybackSpectrumFrame
  expect(active.value).toBe(false)
  options.focusSettled.value = true
  expect(active.value).toBe(true)
  spectrum.onFrame(frame)
  expect(receive).toHaveBeenCalledWith(frame)
  expect(session.spectrumFrame.value).toBeNull()
  for (const gate of [
    options.trackMatches,
    options.loading,
    options.failed,
    options.motionReduced,
  ]) {
    const previous = gate.value
    stop.mockClear()
    gate.value = !previous
    expect(active.value).toBe(false)
    expect(stop).toHaveBeenCalled()
    gate.value = previous
    expect(active.value).toBe(true)
  }
  options.enabled.value = false
  expect(active.value).toBe(false)
  preview.value = true
  expect(active.value).toBe(true)
  receive.mockClear()
  stop.mockClear()
  spectrum.onFrame(frame)
  expect(session.spectrumFrame.value).toBe(frame)
  expect(receive).not.toHaveBeenCalled()
  expect(stop).toHaveBeenCalledOnce()
  stop.mockClear()
  options.style.value = 'elastic'
  expect(stop).toHaveBeenCalledOnce()
  stop.mockClear()
  session.stopVibration()
  expect(stop).toHaveBeenCalledOnce()
  expect(vi.mocked(createCdVibrationMotion).mock.calls.at(-1)![0]).toBe(setOffset)
  expect(vi.mocked(createCdVibrationMotion).mock.calls.at(-1)![1]!()).toBe('elastic')
})
