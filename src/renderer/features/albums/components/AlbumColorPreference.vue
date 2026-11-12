<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useArtworkPalette } from '@renderer/shared/artwork/useArtworkPalette'
import AppDialog from '@renderer/shared/dialog/AppDialog.vue'
import { createCoverColorSampler } from '../utils/sampleCoverColor'
import {
  getAlbumColorPreference,
  setAlbumColorPreference,
  type AlbumColorAnchor,
} from '../albumColorPreferences'

const props = defineProps<{
  anchors: AlbumColorAnchor[]
  artworkKey: string | null
  coverImage: HTMLImageElement | null
  coverReady: boolean
}>()
const emit = defineEmits<{ 'sampling-change': [active: boolean] }>()
const { t } = useI18n()
const isOpen = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const resetButton = ref<HTMLButtonElement | null>(null)
const samplingCover = ref<HTMLImageElement | null>(null)
const samplingCoverUrl = ref('')
const samplingPosition = ref<Record<string, string>>({})
const error = ref(false)
const sampleError = ref(false)
const sampling = ref(false)
const preview = ref<{ color: string; left: number; top: number } | null>(null)
let sampler: ReturnType<typeof createCoverColorSampler> | null = null
let previewFrame: number | null = null
let pointer: { x: number; y: number } | null = null
const preference = computed(() => getAlbumColorPreference(props.anchors))
const { palette } = useArtworkPalette(toRef(props, 'artworkKey'))
const automaticColor = computed(() =>
  palette.value.key === props.artworkKey && palette.value.quality !== 'fallback'
    ? palette.value.dominant
    : null,
)
function matchesAutomatic(color: { r: number; g: number; b: number }): boolean {
  const automatic = automaticColor.value
  return !!automatic && color.r === automatic.r && color.g === automatic.g && color.b === automatic.b
}
const canReset = computed(() => !!preference.value && !matchesAutomatic(preference.value))
watch(canReset, (visible) => {
  if (!visible && resetButton.value && document.activeElement === resetButton.value)
    trigger.value?.focus()
})
const currentColor = computed(() => {
  const color = preference.value ?? automaticColor.value
  return color
    ? `#${[color.r, color.g, color.b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
    : '#808080'
})
function selectColor(hex: string): void {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return
  const color = {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
  error.value = !setAlbumColorPreference(props.anchors, matchesAutomatic(color) ? null : color)
}
function resetColor(): void {
  error.value = !setAlbumColorPreference(props.anchors, null)
  if (!error.value) close(true)
}
function close(restoreFocus = false): void {
  isOpen.value = false
  if (restoreFocus) void nextTick(() => trigger.value?.focus())
}
function toggle(): void {
  if (isOpen.value) return close()
  isOpen.value = true
}
function clearPreview(): void {
  if (previewFrame !== null) cancelAnimationFrame(previewFrame)
  previewFrame = null
  pointer = null
  preview.value = null
}
function setSampling(active: boolean): void {
  sampling.value = active
  if (!active) {
    clearPreview()
    sampler = null
  }
  emit('sampling-change', active)
}
function positionSamplingCover(): void {
  const image = props.coverImage
  if (!image || typeof window === 'undefined') return
  const rect = image.getBoundingClientRect()
  samplingPosition.value = {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    '--album-cover-sampling-height': `${rect.height}px`,
  }
}
watch(sampling, (active, _previous, onCleanup) => {
  if (!active || typeof window === 'undefined') return
  const scroll = props.coverImage?.closest?.<HTMLElement>('.album-detail-scroll-wrapper')
  const onWheel = (event: WheelEvent) => {
    if (!scroll || !event.deltaY) return
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientHeight : 1
    scroll.scrollBy({ top: event.deltaY * unit })
    event.preventDefault()
  }
  window.addEventListener('resize', positionSamplingCover)
  scroll?.addEventListener('scroll', positionSamplingCover, { passive: true })
  document.addEventListener('wheel', onWheel, { passive: false, capture: true })
  onCleanup(() => {
    window.removeEventListener('resize', positionSamplingCover)
    scroll?.removeEventListener('scroll', positionSamplingCover)
    document.removeEventListener('wheel', onWheel, true)
  })
})
function startSampling(): void {
  const image = props.coverImage
  if (!image || !image.complete || !image.naturalWidth) return
  samplingCoverUrl.value = image.currentSrc || image.src
  positionSamplingCover()
  sampleError.value = false
  close()
  setSampling(true)
}
function cancelSampling(): void {
  setSampling(false)
}
function prepareSampler(): void {
  const image = samplingCover.value
  if (!image || !image.complete || !image.naturalWidth) return
  try {
    sampler = createCoverColorSampler(image, 'contain')
  } catch {
    sampleError.value = true
    cancelSampling()
  }
}
function onCoverError(): void {
  sampleError.value = true
  cancelSampling()
}
function sampleCover(event: PointerEvent): void {
  if (!sampler) return
  event.preventDefault()
  try {
    const color = sampler(event.clientX, event.clientY)
    if (!color) return
    selectColor(color)
  } catch {
    sampleError.value = true
  }
  setSampling(false)
}
function previewCover(event: PointerEvent): void {
  if (event.target !== samplingCover.value) return clearPreview()
  pointer = { x: event.clientX, y: event.clientY }
  if (previewFrame !== null) return
  previewFrame = requestAnimationFrame(() => {
    previewFrame = null
    if (!pointer || !sampler || !sampling.value) return
    try {
      const color = sampler(pointer.x, pointer.y)
      if (!color) {
        preview.value = null
        return
      }
      const width = 112,
        height = 36,
        gap = 16,
        edge = 8
      const left =
        pointer.x + gap + width <= window.innerWidth - edge
          ? pointer.x + gap
          : pointer.x - gap - width
      const top =
        pointer.y + gap + height <= window.innerHeight - edge
          ? pointer.y + gap
          : pointer.y - gap - height
      preview.value = { color, left: Math.max(edge, left), top: Math.max(edge, top) }
    } catch {
      preview.value = null
    }
  })
}
function onOutside(event: PointerEvent): void {
  if (isOpen.value && event.target instanceof Node && !root.value?.contains(event.target)) close()
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close(true)
  }
}
function onFocusOut(event: FocusEvent): void {
  if (
    isOpen.value &&
    event.relatedTarget instanceof Node &&
    !root.value?.contains(event.relatedTarget)
  )
    close()
}
watch(isOpen, (open, _previous, onCleanup) => {
  if (typeof document === 'undefined') return
  if (!open) return
  document.addEventListener('pointerdown', onOutside, true)
  onCleanup(() => {
    document.removeEventListener('pointerdown', onOutside, true)
  })
})
watch([() => props.artworkKey, () => props.anchors], () => {
  if (isOpen.value) close()
  if (sampling.value) setSampling(false)
})
onBeforeUnmount(() => {
  clearPreview()
  sampler = null
  if (typeof document !== 'undefined') {
    document.removeEventListener('pointerdown', onOutside, true)
  }
})
</script>

<template>
  <div ref="root" class="album-color-preference" @keydown.esc="onKeydown" @focusout="onFocusOut">
    <button
      ref="trigger"
      v-tooltip="t('albums.detail.colorPreference')"
      class="album-color-trigger"
      type="button"
      :aria-label="t('albums.detail.colorPreference')"
      :aria-expanded="isOpen"
      :aria-controls="isOpen ? 'album-color-actions' : undefined"
      @click="toggle"
    >
      <span
        class="album-color-swatch"
        :style="{ backgroundColor: currentColor }"
        aria-hidden="true"
      ></span>
    </button>
    <Transition name="album-color-expand">
      <div
        v-if="isOpen"
        id="album-color-actions"
        class="album-color-actions"
        :class="{ 'has-reset': canReset }"
        role="group"
        :aria-label="t('albums.detail.colorPreference')"
      >
        <button
          v-tooltip.right="t('albums.detail.colorSampleCover')"
          type="button"
          class="album-color-action album-color-sample"
          :disabled="!coverReady"
          :aria-label="t('albums.detail.colorSampleCover')"
          @click="startSampling"
        >
          <span class="i-lucide-pipette" aria-hidden="true"></span>
        </button>
        <button
          v-if="canReset"
          ref="resetButton"
          v-tooltip="t('albums.detail.colorReset')"
          type="button"
          class="album-color-action album-color-reset"
          :aria-label="t('albums.detail.colorReset')"
          @click="resetColor"
        >
          <span class="i-lucide-rotate-ccw" aria-hidden="true"></span>
        </button>
      </div>
    </Transition>
    <span v-if="error" class="album-color-status" role="alert">{{
      t('albums.detail.colorSaveError')
    }}</span>
    <AppDialog
      :open="sampling"
      :title="t('albums.detail.colorSampleCover')"
      title-id="album-cover-sampling-title"
      panel-class="album-cover-sampling-dialog"
      backdrop-class="album-cover-sampling-backdrop"
      :style="samplingPosition"
      :padded="false"
      :return-focus-to="trigger"
      @close="cancelSampling"
    >
      <template #header>
        <h2 id="album-cover-sampling-title" class="album-cover-sampling-title">
          {{ t('albums.detail.colorSampleCover') }}
        </h2>
      </template>
      <img
        ref="samplingCover"
        class="album-cover-sampling-image"
        :src="samplingCoverUrl"
        :alt="t('albums.detail.colorSampleCover')"
        crossorigin="anonymous"
        draggable="false"
        @load="prepareSampler"
        @error="onCoverError"
        @pointerdown="sampleCover"
        @pointermove="previewCover"
        @pointerleave="clearPreview"
      />
      <p class="album-cover-sampling-hint">{{ t('albums.detail.colorSampleHint') }}</p>
    </AppDialog>
    <span v-if="sampleError" class="album-color-status" role="alert">{{
      t('albums.detail.colorSampleError')
    }}</span>
    <Teleport v-if="preview" to="body">
      <div
        class="album-color-cursor-preview"
        :style="{ left: `${preview.left}px`, top: `${preview.top}px` }"
        aria-hidden="true"
      >
        <span class="album-color-cursor-swatch" :style="{ backgroundColor: preview.color }"></span>
        <span>{{ preview.color.toUpperCase() }}</span>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.album-color-preference {
  position: relative;
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  border-radius: 999px;
  background: color-mix(in srgb, var(--auralis-text) 10%, transparent);
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-caption-size);
}
.album-color-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--auralis-text);
  font-size: var(--auralis-type-control-size);
  font-weight: 650;
  transition:
    filter 0.2s ease,
    opacity 0.2s ease;
  cursor: pointer;
}
.album-color-trigger:hover {
  background: color-mix(in srgb, var(--auralis-text) 9%, transparent);
}
.album-color-trigger:active {
  opacity: 0.72;
}
.album-color-trigger:focus-visible,
.album-color-action:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}
.album-color-swatch {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--auralis-text) 35%, transparent);
}
.album-color-actions {
  display: flex;
  flex: 0 0 36px;
  width: 36px;
  overflow: hidden;
}
.album-color-actions.has-reset {
  flex-basis: 72px;
  width: 72px;
}
.album-color-action {
  display: inline-flex;
  flex: 0 0 36px;
  width: 36px;
  height: 40px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--auralis-text);
  cursor: pointer;
}
.album-color-action > span {
  width: 16px;
  height: 16px;
}
.album-color-action:hover:not(:disabled) {
  background: color-mix(in srgb, var(--auralis-text) 9%, transparent);
}
.album-color-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.album-color-action:focus-visible {
  outline-offset: -3px;
}
.album-color-expand-enter-active,
.album-color-expand-leave-active {
  transition:
    width 180ms ease,
    flex-basis 180ms ease,
    opacity 140ms ease;
}
.album-color-actions.album-color-expand-enter-from,
.album-color-actions.album-color-expand-leave-to {
  flex-basis: 0;
  width: 0;
  opacity: 0;
}
:where([data-reduced-motion='true']) .album-color-expand-enter-active,
:where([data-reduced-motion='true']) .album-color-expand-leave-active {
  transition: none;
}
.album-color-status {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  padding: 5px 8px;
  border-radius: 6px;
  white-space: nowrap;
  color: #fff;
  background: rgb(20 27 25 / 85%);
  font-size: var(--auralis-type-caption-size);
}
:global(.album-cover-sampling-backdrop) {
  display: block;
  padding: 0;
}
:global(.album-cover-sampling-dialog) {
  position: fixed;
  display: block;
  max-width: none;
  max-height: none;
  overflow: visible;
  border: 0;
  background: transparent;
  color: #fff;
  box-shadow: none;
}
:global(.album-cover-sampling-dialog .auralis-dialog-body) {
  overflow: visible;
}
.album-cover-sampling-title {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.album-cover-sampling-hint {
  margin: 8px 0 0;
  color: #fff;
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  text-align: center;
  text-shadow: 0 1px 4px rgb(0 0 0 / 80%);
}
.album-cover-sampling-image {
  display: block;
  width: 100%;
  height: var(--album-cover-sampling-height);
  object-fit: contain;
  border-radius: 0;
  box-shadow: 0 18px 60px rgb(0 0 0 / 35%);
  cursor: crosshair;
  user-select: none;
}
.album-color-cursor-preview {
  position: fixed;
  z-index: 10000;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 112px;
  height: 36px;
  padding: 6px 8px;
  border: 1px solid rgb(255 255 255 / 20%);
  border-radius: 9px;
  color: #fff;
  background: rgb(24 26 29 / 94%);
  box-shadow: 0 4px 14px rgb(0 0 0 / 25%);
  font-family: var(--auralis-font-color-value);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
.album-color-cursor-swatch {
  flex: 0 0 20px;
  height: 20px;
  border-radius: 5px;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 25%);
}
</style>
