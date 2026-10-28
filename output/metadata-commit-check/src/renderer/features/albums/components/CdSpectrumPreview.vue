<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { SpectrumEnvelope } from '@renderer/features/playback/utils/spectrumEnvelope'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { SPECTRUM_BANDS } from '@shared/types/playbackSpectrum'
import type { PlaybackSpectrumFrame } from '@shared/types/playbackSpectrum'

const props = defineProps<{ frame: PlaybackSpectrumFrame | null }>()
const { t } = useI18n()
const barsRef = ref<HTMLElement | null>(null)
const envelope = new SpectrumEnvelope()
const motion = createReducedMotionQuery()
const reducedMotion = ref(motion.matches)
const onMotionChange = (): void => {
  reducedMotion.value = motion.matches
}
motion.addEventListener('change', onMotionChange)
let target: readonly number[] = Array(SPECTRUM_BANDS).fill(0)
let animation = 0
let lastAt = 0
let disposed = false

function paint(now: number): void {
  animation = 0
  if (disposed || !barsRef.value) return
  if (reducedMotion.value) envelope.reset()
  const values = reducedMotion.value
    ? envelope.values
    : envelope.update(target, lastAt ? (now - lastAt) / 1000 : 1 / 30)
  lastAt = now
  Array.from(barsRef.value.children).forEach((bar, index) => {
    ;(bar as HTMLElement).style.transform = `scaleY(${Math.max(0.025, values[index])})`
  })
  if (values.some((value, index) => Math.abs(value - target[index]) > 0.002))
    animation = requestAnimationFrame(paint)
}

watch(
  () => props.frame,
  (value) => {
    target = motion.matches || !value ? Array(SPECTRUM_BANDS).fill(0) : value.bands
    if (!animation && !disposed) animation = requestAnimationFrame(paint)
  },
)
onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(animation)
  motion.removeEventListener('change', onMotionChange)
})
</script>

<template>
  <aside
    class="cd-spectrum-preview"
    :aria-label="t('albums.cd.spectrum.title')"
    :data-spectrum-status="props.frame?.status ?? 'waiting'"
  >
    <div class="cd-spectrum-caption">
      <span>{{ t('albums.cd.spectrum.title') }}</span>
      <span role="status">{{
        t(
          `albums.cd.spectrum.${reducedMotion ? 'motionDisabled' : (props.frame?.status ?? 'waiting')}`,
        )
      }}</span>
    </div>
    <div ref="barsRef" class="cd-spectrum-bars" aria-hidden="true">
      <span v-for="index in SPECTRUM_BANDS" :key="index"></span>
    </div>
    <div class="cd-spectrum-caption"><span>40 Hz</span><span>11 kHz</span></div>
  </aside>
</template>

<style scoped>
.cd-spectrum-preview {
  position: absolute;
  left: 32px;
  bottom: 84px;
  z-index: 8;
  width: min(340px, calc(100% - 64px));
  color: var(--cd-text-muted);
  pointer-events: none;
}
.cd-spectrum-caption {
  display: flex;
  justify-content: space-between;
  font-size: var(--cd-type-debug-size);
  line-height: var(--cd-type-debug-line-height);
  font-family: var(--cd-font-text);
}
.cd-spectrum-bars {
  display: flex;
  gap: 4px;
  height: 64px;
  margin: 8px 0;
}
.cd-spectrum-bars span {
  flex: 1;
  background: var(--cd-wave-accent, var(--cd-text-muted));
  transform: scaleY(0.025);
  transform-origin: bottom;
}
</style>
