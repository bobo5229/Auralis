<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import VisualStylePreference from '@renderer/features/appearance/components/VisualStylePreference.vue'
import { type PlayerBarMaterial, usePlayerBarMaterial } from '../composables/usePlayerBarMaterial'
import { type AppLocale, useLocale } from '@renderer/composables/useLocale'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'

const { t } = useI18n()
const { locale, setLocale, localeOptions } = useLocale()
const { playerBarMaterial, setPlayerBarMaterial } = usePlayerBarMaterial()
const { gaplessPlaybackEnabled, setGaplessPlaybackEnabled } = usePlayback()

const playerBarMaterialOptions = computed<Array<{ value: PlayerBarMaterial; label: string }>>(
  () => [
    {
      value: 'cover-tint',
      label: t('settings.appearance.playerBarMaterialOption.coverTint'),
    },
    {
      value: 'liquid-glass',
      label: t('settings.appearance.playerBarMaterialOption.liquidGlass'),
    },
  ],
)

const coverTintButtonRef = ref<HTMLButtonElement | null>(null)
const liquidGlassButtonRef = ref<HTMLButtonElement | null>(null)
const localeButtonRefs = new Map<AppLocale, HTMLButtonElement>()

function getPlayerBarMaterialButton(value: PlayerBarMaterial): HTMLButtonElement | null {
  return value === 'cover-tint' ? coverTintButtonRef.value : liquidGlassButtonRef.value
}

function selectPlayerBarMaterial(value: PlayerBarMaterial, focusSelectedOption = false): void {
  setPlayerBarMaterial(value)
  if (focusSelectedOption) {
    void nextTick(() => getPlayerBarMaterialButton(value)?.focus())
  }
}

function handlePlayerBarMaterialKeydown(event: KeyboardEvent, value: PlayerBarMaterial): void {
  const currentIndex = playerBarMaterialOptions.value.findIndex((option) => option.value === value)
  if (currentIndex < 0) return

  let nextIndex: number | null = null
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex =
        (currentIndex - 1 + playerBarMaterialOptions.value.length) %
        playerBarMaterialOptions.value.length
      break
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (currentIndex + 1) % playerBarMaterialOptions.value.length
      break
    case 'Home':
      nextIndex = 0
      break
    case 'End':
      nextIndex = playerBarMaterialOptions.value.length - 1
      break
    default:
      return
  }

  event.preventDefault()
  const nextOption = playerBarMaterialOptions.value[nextIndex]
  if (nextOption) selectPlayerBarMaterial(nextOption.value, true)
}

function setLocaleButtonRef(value: AppLocale, el: unknown): void {
  if (el instanceof HTMLButtonElement) localeButtonRefs.set(value, el)
  else localeButtonRefs.delete(value)
}

function selectLocale(value: AppLocale, focusSelectedOption = false): void {
  setLocale(value)
  if (focusSelectedOption) {
    void nextTick(() => localeButtonRefs.get(value)?.focus())
  }
}

function handleLocaleKeydown(event: KeyboardEvent, value: AppLocale): void {
  const currentIndex = localeOptions.value.findIndex((option) => option.value === value)
  if (currentIndex < 0) return

  let nextIndex: number | null = null
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex = (currentIndex - 1 + localeOptions.value.length) % localeOptions.value.length
      break
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (currentIndex + 1) % localeOptions.value.length
      break
    case 'Home':
      nextIndex = 0
      break
    case 'End':
      nextIndex = localeOptions.value.length - 1
      break
    default:
      return
  }

  event.preventDefault()
  const nextOption = localeOptions.value[nextIndex]
  if (nextOption) selectLocale(nextOption.value, true)
}
</script>

<template>
  <section class="settings-section">
    <div class="settings-list">
      <div class="settings-row settings-row--visual-style">
        <VisualStylePreference />
      </div>

      <div class="settings-row">
        <div>
          <strong id="locale-label">{{ t('settings.appearance.language') }}</strong>
          <span id="locale-description">{{ t('settings.appearance.languageDescription') }}</span>
        </div>
        <div
          class="settings-segmented-control"
          role="radiogroup"
          aria-labelledby="locale-label"
          aria-describedby="locale-description"
        >
          <button
            v-for="option in localeOptions"
            :key="option.value"
            :ref="(el) => setLocaleButtonRef(option.value, el)"
            type="button"
            role="radio"
            class="settings-segmented-option"
            :class="{ 'is-selected': locale === option.value }"
            :aria-checked="locale === option.value"
            :tabindex="locale === option.value ? 0 : -1"
            @click="selectLocale(option.value)"
            @keydown="handleLocaleKeydown($event, option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="settings-row">
        <div>
          <strong id="player-bar-material-label">{{
            t('settings.appearance.playerBarMaterial')
          }}</strong>
          <span id="player-bar-material-description">{{
            t('settings.appearance.playerBarMaterialDescription')
          }}</span>
        </div>
        <div
          class="settings-segmented-control"
          role="radiogroup"
          aria-labelledby="player-bar-material-label"
          aria-describedby="player-bar-material-description"
        >
          <button
            ref="coverTintButtonRef"
            type="button"
            role="radio"
            class="settings-segmented-option"
            :class="{ 'is-selected': playerBarMaterial === 'cover-tint' }"
            :aria-checked="playerBarMaterial === 'cover-tint'"
            :tabindex="playerBarMaterial === 'cover-tint' ? 0 : -1"
            @click="selectPlayerBarMaterial('cover-tint')"
            @keydown="handlePlayerBarMaterialKeydown($event, 'cover-tint')"
          >
            {{ t('settings.appearance.playerBarMaterialOption.coverTint') }}
          </button>
          <button
            ref="liquidGlassButtonRef"
            type="button"
            role="radio"
            class="settings-segmented-option"
            :class="{ 'is-selected': playerBarMaterial === 'liquid-glass' }"
            :aria-checked="playerBarMaterial === 'liquid-glass'"
            :tabindex="playerBarMaterial === 'liquid-glass' ? 0 : -1"
            @click="selectPlayerBarMaterial('liquid-glass')"
            @keydown="handlePlayerBarMaterialKeydown($event, 'liquid-glass')"
          >
            {{ t('settings.appearance.playerBarMaterialOption.liquidGlass') }}
          </button>
        </div>
      </div>

      <div class="settings-row">
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
    </div>
  </section>
</template>
