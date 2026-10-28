<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  SOFT_TRANSITION_MIN_SECONDS,
  SOFT_TRANSITION_MAX_SECONDS,
  SOFT_TRANSITION_STEP_SECONDS,
} from '@shared/audio/softTransitionSettings'
import { useI18n } from 'vue-i18n'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

const { t } = useI18n()
const {
  gaplessPlaybackEnabled,
  setGaplessPlaybackEnabled,
  skipDigitalSilenceEnabled,
  setSkipDigitalSilenceEnabled,
  softTransitionEnabled,
  setSoftTransitionEnabled,
  softTransitionDurationSeconds,
  setSoftTransitionDurationSeconds,
} = usePlayback()
const nativeAvailable = ref<boolean | null>(null)
const durationPreview = ref(softTransitionDurationSeconds.value)
watch(softTransitionDurationSeconds, (seconds) => {
  durationPreview.value = seconds
})
const durationDisabled = computed(
  () =>
    !softTransitionEnabled.value ||
    !gaplessPlaybackEnabled.value ||
    nativeAvailable.value === false,
)
const durationProgress = computed(
  () =>
    `${
      ((durationPreview.value - SOFT_TRANSITION_MIN_SECONDS) /
        (SOFT_TRANSITION_MAX_SECONDS - SOFT_TRANSITION_MIN_SECONDS)) *
      100
    }%`,
)
const durationText = computed(() =>
  t('settings.playback.softTransitionDurationValue', { seconds: durationPreview.value }),
)
const durationTicks = Array.from(
  {
    length:
      (SOFT_TRANSITION_MAX_SECONDS - SOFT_TRANSITION_MIN_SECONDS) / SOFT_TRANSITION_STEP_SECONDS -
      1,
  },
  (_, index) => SOFT_TRANSITION_MIN_SECONDS + (index + 1) * SOFT_TRANSITION_STEP_SECONDS,
)
function commitDuration(event: Event): void {
  setSoftTransitionDurationSeconds(Number((event.target as HTMLInputElement).value))
  durationPreview.value = softTransitionDurationSeconds.value
}
onMounted(async () => {
  try {
    nativeAvailable.value = (await auralis.playback.nativeAvailability()).available
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'settings.playback',
      message: 'Could not check native playback availability',
      cause,
    })
  }
})
</script>

<template>
  <section class="settings-section">
    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">{{ t('settings.nav.playback') }}</h2>
      </div>
      <div class="settings-group-card">
        <div class="settings-row settings-row--with-desc">
          <div>
            <strong>{{ t('settings.playback.gapless') }}</strong>
            <span id="gapless-playback-description">{{
              t('settings.playback.gaplessDescription')
            }}</span>
          </div>
          <button
            type="button"
            class="settings-switch"
            role="switch"
            :aria-checked="gaplessPlaybackEnabled"
            aria-describedby="gapless-playback-description"
            :aria-label="
              gaplessPlaybackEnabled
                ? t('settings.playback.gaplessAriaOn')
                : t('settings.playback.gaplessAriaOff')
            "
            :class="{ 'is-enabled': gaplessPlaybackEnabled }"
            @click="setGaplessPlaybackEnabled(!gaplessPlaybackEnabled)"
          >
            <span class="settings-switch-thumb" aria-hidden="true"></span>
          </button>
        </div>
        <div class="settings-row settings-row--with-desc">
          <div>
            <strong>{{ t('settings.playback.digitalSilence') }}</strong>
            <span id="digital-silence-description">
              {{ t('settings.playback.digitalSilenceDescription') }}
              <template v-if="gaplessPlaybackEnabled && nativeAvailable === false">{{
                t('settings.playback.nativeUnavailable')
              }}</template>
            </span>
          </div>
          <button
            type="button"
            class="settings-switch"
            role="switch"
            :aria-label="t('settings.playback.digitalSilence')"
            aria-describedby="digital-silence-description"
            :aria-checked="skipDigitalSilenceEnabled"
            :disabled="!gaplessPlaybackEnabled"
            :class="{ 'is-enabled': skipDigitalSilenceEnabled }"
            @click="setSkipDigitalSilenceEnabled(!skipDigitalSilenceEnabled)"
          >
            <span class="settings-switch-thumb" aria-hidden="true"></span>
          </button>
        </div>
        <div class="settings-row settings-row--with-desc">
          <div>
            <strong>{{ t('settings.playback.softTransition') }}</strong>
            <span id="soft-transition-description">
              {{ t('settings.playback.softTransitionDescription') }}
              <template v-if="nativeAvailable === false">{{
                t('settings.playback.nativeUnavailable')
              }}</template>
            </span>
          </div>
          <button
            type="button"
            class="settings-switch"
            role="switch"
            :aria-label="t('settings.playback.softTransition')"
            aria-describedby="soft-transition-description"
            :aria-checked="softTransitionEnabled"
            :disabled="!gaplessPlaybackEnabled || nativeAvailable === false"
            :class="{ 'is-enabled': softTransitionEnabled }"
            @click="setSoftTransitionEnabled(!softTransitionEnabled)"
          >
            <span class="settings-switch-thumb" aria-hidden="true"></span>
          </button>
        </div>
        <div class="settings-row soft-transition-duration-row">
          <div>
            <strong id="soft-transition-duration-label">{{
              t('settings.playback.softTransitionDuration')
            }}</strong>
          </div>
          <div class="settings-range-control">
            <input
              id="soft-transition-duration"
              type="range"
              :min="SOFT_TRANSITION_MIN_SECONDS"
              :max="SOFT_TRANSITION_MAX_SECONDS"
              :step="SOFT_TRANSITION_STEP_SECONDS"
              :value="durationPreview"
              :disabled="durationDisabled"
              :style="{ '--settings-range-progress': durationProgress }"
              aria-labelledby="soft-transition-duration-label"
              :aria-valuetext="durationText"
              @input="durationPreview = Number(($event.target as HTMLInputElement).value)"
              @change="commitDuration"
            />
            <div
              class="soft-transition-ticks"
              :class="{ 'is-disabled': durationDisabled }"
              aria-hidden="true"
            >
              <span
                v-for="seconds in durationTicks"
                :key="seconds"
                class="soft-transition-tick"
                :class="{
                  'is-major': Number.isInteger(seconds),
                  'is-passed': seconds < durationPreview,
                  'is-current': seconds === durationPreview,
                }"
                :style="{
                  left: `calc(8px + (100% - 16px) * ${(seconds - SOFT_TRANSITION_MIN_SECONDS) / (SOFT_TRANSITION_MAX_SECONDS - SOFT_TRANSITION_MIN_SECONDS)})`,
                }"
              ></span>
            </div>
            <output for="soft-transition-duration">{{ durationText }}</output>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Leave room above the shared slider's keyboard focus outline. */
.settings-surface .settings-row.soft-transition-duration-row {
  height: 72px;
  min-height: 72px;
  max-height: 72px;
  row-gap: 8px;
}

.settings-surface .soft-transition-duration-row input::-webkit-slider-runnable-track {
  height: 7px;
}

.settings-surface .soft-transition-duration-row input::-webkit-slider-thumb {
  margin-top: -4.5px;
}

.settings-surface .soft-transition-duration-row input::-moz-range-track {
  height: 7px;
}

.soft-transition-ticks {
  position: relative;
  grid-column: 1 / -1;
  grid-row: 2;
  align-self: center;
  height: 20px;
  pointer-events: none;
}

.soft-transition-ticks.is-disabled {
  opacity: 0.38;
}

.soft-transition-tick {
  position: absolute;
  top: 50%;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--auralis-text) 45%, transparent);
  transform: translate(-50%, -50%);
}

.soft-transition-tick.is-major {
  width: 5px;
  height: 5px;
}

.soft-transition-tick.is-passed {
  background: color-mix(in srgb, var(--settings-range-fill) 25%, var(--auralis-main-bg));
}

.soft-transition-tick.is-current {
  visibility: hidden;
}
</style>
