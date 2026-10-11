<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  SONG_FONT_WEIGHT_OPTIONS,
  type SongFontWeightChoice,
} from '@renderer/features/appearance/constants/songFontWeights'
import SettingsSelect from './SettingsSelect.vue'

const props = defineProps<{
  id: string
  labelledby: string
  modelValue: SongFontWeightChoice
  defaultWeight: number
}>()
const emit = defineEmits<{ 'update:modelValue': [value: SongFontWeightChoice] }>()
const { t } = useI18n()
const options = computed(() => [
  {
    value: 'default',
    label: t('settings.appearance.songFontWeight.options.default', { weight: props.defaultWeight }),
  },
  ...SONG_FONT_WEIGHT_OPTIONS.map((value) => ({
    value: String(value),
    label: t(`settings.appearance.songFontWeight.options.${value}`),
  })),
])

function select(value: string): void {
  emit(
    'update:modelValue',
    value === 'default' ? 'default' : (Number(value) as SongFontWeightChoice),
  )
}
</script>

<template>
  <SettingsSelect
    :id="id"
    :labelledby="labelledby"
    :model-value="String(modelValue)"
    :options="options"
    @update:model-value="select"
  />
</template>
