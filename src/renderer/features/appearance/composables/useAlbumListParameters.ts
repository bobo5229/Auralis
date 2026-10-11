import { computed, readonly, ref, watch } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import {
  ALBUM_LIST_PARAMETER_STORAGE_KEY,
  ALBUM_LIST_FONT_FIELDS,
  ALBUM_LIST_DEFAULT_SIZES,
  ALBUM_LIST_DEFAULT_WEIGHTS,
  ALBUM_LIST_METADATA_GAP,
  ALBUM_LIST_TEXT_GAP,
  albumListMetadataHeight,
  defaultAlbumListParameters,
  parseAlbumListParameters,
  isAlbumListSize,
  isAlbumListWeight,
  isAlbumListRadius,
  type AlbumListFontField,
  type AlbumListFontWeight,
} from '../constants/albumListParameters'

function readInitial() {
  try {
    return parseAlbumListParameters(localStorage.getItem(ALBUM_LIST_PARAMETER_STORAGE_KEY))
  } catch {
    return defaultAlbumListParameters()
  }
}
const preference = ref(readInitial())
const persistFailed = ref(false)
// Browser defaults are read from the semantic CSS before applying user overrides.
const defaultSizes = ref<Record<AlbumListFontField, number>>({ ...ALBUM_LIST_DEFAULT_SIZES })
const defaultWeights = ref<Record<AlbumListFontField, number>>({ ...ALBUM_LIST_DEFAULT_WEIGHTS })
const sizes = computed(() => ({ ...defaultSizes.value, ...preference.value.sizes }))
const metadataHeight = computed(() => albumListMetadataHeight(sizes.value))
const metadataOccupancy = computed(() => metadataHeight.value + ALBUM_LIST_METADATA_GAP)

function persist() {
  try {
    localStorage.setItem(
      ALBUM_LIST_PARAMETER_STORAGE_KEY,
      JSON.stringify({ version: 1, ...preference.value }),
    )
    persistFailed.value = false
  } catch (cause) {
    persistFailed.value = true
    rendererDiagnostics.warn({
      scope: 'appearance.album-list-parameters',
      message: 'Could not save album list parameters; keeping them for this session',
      cause,
    })
  }
}

export function initAlbumListParameters(): () => void {
  const root = document.documentElement
  for (const field of ALBUM_LIST_FONT_FIELDS) {
    root.style.removeProperty(`--album-list-type-${field}-size`)
    root.style.removeProperty(`--album-list-type-${field}-weight`)
  }
  const style = getComputedStyle(root)
  for (const field of ALBUM_LIST_FONT_FIELDS) {
    const size = Number.parseFloat(style.getPropertyValue(`--album-list-type-${field}-size`))
    const weight = Number.parseFloat(style.getPropertyValue(`--album-list-type-${field}-weight`))
    if (Number.isFinite(size)) defaultSizes.value[field] = size
    if (Number.isFinite(weight)) defaultWeights.value[field] = weight
  }
  const apply = () => {
    for (const field of ALBUM_LIST_FONT_FIELDS) {
      for (const [suffix, value] of [
        ['size', preference.value.sizes[field]],
        ['weight', preference.value.weights[field]],
      ] as const) {
        const name = `--album-list-type-${field}-${suffix}`
        if (value === undefined) root.style.removeProperty(name)
        else root.style.setProperty(name, `${value}${suffix === 'size' ? 'px' : ''}`)
      }
    }
    root.style.setProperty(
      '--album-list-cover-radius',
      preference.value.rounded ? `${preference.value.radius}px` : '0px',
    )
    root.style.setProperty('--album-list-meta-height', `${metadataHeight.value}px`)
    root.style.setProperty('--album-list-meta-gap', `${ALBUM_LIST_METADATA_GAP}px`)
    root.style.setProperty('--album-list-text-gap', `${ALBUM_LIST_TEXT_GAP}px`)
  }
  apply()
  return watch(preference, apply, { flush: 'sync' })
}

export function useAlbumListParameters() {
  return {
    preference: readonly(preference),
    sizes,
    defaultWeights: readonly(defaultWeights),
    metadataHeight,
    metadataOccupancy,
    persistFailed: readonly(persistFailed),
    setSize(field: AlbumListFontField, value: number) {
      if (!isAlbumListSize(field, value)) return
      const overrides = { ...preference.value.sizes }
      if (value === defaultSizes.value[field]) delete overrides[field]
      else overrides[field] = value
      preference.value = { ...preference.value, sizes: overrides }
      persist()
    },
    setWeight(field: AlbumListFontField, value: 'default' | AlbumListFontWeight) {
      if (value !== 'default' && !isAlbumListWeight(value)) return
      const overrides = { ...preference.value.weights }
      if (value === 'default') delete overrides[field]
      else overrides[field] = value
      preference.value = { ...preference.value, weights: overrides }
      persist()
    },
    setRounded(value: boolean) {
      preference.value = { ...preference.value, rounded: value }
      persist()
    },
    setRadius(value: number) {
      if (!isAlbumListRadius(value)) return
      preference.value = { ...preference.value, radius: value }
      persist()
    },
    reset() {
      preference.value = defaultAlbumListParameters()
      persist()
    },
  }
}
