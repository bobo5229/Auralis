<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PickerColorChange } from '@renderer/shared/color/pickerColor'
import AuralisColorPicker from '@renderer/shared/components/AuralisColorPicker.vue'
import { syncPickerAccessibility } from '@renderer/shared/color/pickerAccessibility'

const props = defineProps<{ color: string }>()
const emit = defineEmits<{ select: [color: string]; ready: [] }>()
const { t, locale } = useI18n()
const host = ref<HTMLElement | null>(null)
const issue = ref(false)

function update(value: PickerColorChange): void {
  issue.value = false
  emit('select', value.color.toLowerCase())
}

function syncAccessibility(): void {
  if (host.value)
    syncPickerAccessibility(
      host.value,
      t('albums.detail.colorPreference'),
      props.color,
      (key, values) => t(key, values ?? {}),
    )
}
onMounted(() => {
  syncAccessibility()
  emit('ready')
})
watch([() => props.color, locale], async () => {
  await nextTick()
  syncAccessibility()
})
</script>

<template>
  <div
    ref="host"
    class="album-picker-host"
    role="group"
    :aria-label="t('albums.detail.colorPreference')"
  >
    <AuralisColorPicker
      :color="color"
      :preset-colors="[]"
      @change="update"
      @invalid="issue = true"
    />
    <p v-if="issue" class="album-picker-error" role="status">
      {{ t('colorPicker.invalidColor') }}
    </p>
  </div>
</template>

<style scoped>
.album-picker-host {
  --vc-body-bg: transparent;
  --vc-picker-bg: var(--album-detail-main, var(--auralis-main-bg));
  --vc-input-bg: color-mix(in srgb, var(--auralis-text) 8%, transparent);
  --vc-input-text: var(--auralis-text);
  --vc-input-label: var(--auralis-text-muted);
  --vc-input-border: color-mix(in srgb, var(--auralis-text) 25%, transparent);
  --vc-sketch-input-label: var(--auralis-text-muted);
  --vc-sketch-presets-border: transparent;
}
.album-picker-host :deep(.vc-sketch-picker) {
  width: 100%;
  box-sizing: border-box;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  font-family: var(--auralis-font-ui);
}
.album-picker-host :deep(.saturation) {
  border-radius: 8px;
  overflow: hidden;
  padding-bottom: 55%;
}
.album-picker-host :deep(.vc-saturation-slider) {
  border-radius: 8px;
  overflow: hidden;
}
.album-picker-host :deep(.controls) {
  margin: 12px 0;
}
.album-picker-host :deep(.presets) {
  display: none;
}
.album-picker-host :deep(.field) {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.album-picker-host :deep(.field_single),
.album-picker-host :deep(.field_double) {
  min-width: 0;
  padding: 0;
}
.album-picker-host :deep(.vc-input-input) {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 5px 4px;
  border-radius: 6px;
  font-family: var(--auralis-font-color-value);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  font-variant-numeric: tabular-nums;
}
.album-picker-host :deep(.vc-input-label) {
  font-family: var(--auralis-font-ui);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}
.album-picker-host :deep([role='slider']:focus-visible),
.album-picker-host :deep(.vc-input-input:focus-visible) {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}
.album-picker-error {
  margin: 8px 0 0;
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  color: var(--auralis-text);
}
</style>
