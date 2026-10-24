import { computed, shallowRef, watch, type Ref } from 'vue'
import { usePlaybackSpectrum } from '@renderer/features/playback/composables/usePlaybackSpectrum'
import type { PlaybackSpectrumFrame } from '@shared/types/playbackSpectrum'
import { createCdVibrationMotion, type CdVibrationStyle } from '../utils/cdVibrationMotion'

interface Options {
  focusSettled: Readonly<Ref<boolean>>
  trackMatches: Readonly<Ref<boolean>>
  loading: Readonly<Ref<boolean>>
  failed: Readonly<Ref<boolean>>
  motionReduced: Readonly<Ref<boolean>>
  enabled: Readonly<Ref<boolean>>
  style: Readonly<Ref<CdVibrationStyle>>
  showPreview: () => boolean
  setOffset: (offset: number) => void
}

/** Adapts playback spectrum frames to the scene without owning playback or stage resources. */
export function useCdPlaybackVibration(options: Options) {
  const spectrumFrame = shallowRef<PlaybackSpectrumFrame | null>(null)
  const vibration = createCdVibrationMotion(options.setOffset, () => options.style.value)
  const active = computed(
    () =>
      options.focusSettled.value &&
      options.trackMatches.value &&
      !options.loading.value &&
      !options.failed.value &&
      !options.motionReduced.value &&
      (options.enabled.value || options.showPreview()),
  )
  usePlaybackSpectrum({
    enabled: active,
    onFrame(frame) {
      if (options.showPreview()) spectrumFrame.value = frame
      if (options.enabled.value && active.value) vibration.receive(frame)
      else vibration.stop()
    },
  })
  watch([options.enabled, active, options.style], () => vibration.stop(), { flush: 'sync' })

  return { spectrumFrame, stopVibration: () => vibration.stop() }
}
