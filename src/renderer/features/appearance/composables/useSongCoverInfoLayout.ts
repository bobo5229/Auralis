import { computed, readonly, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { DEFAULT_COVER_METADATA_LAYOUT } from '@renderer/features/library/constants/libraryLayoutMetrics'
import {
  DEFAULT_SONG_COVER_INFO_LAYOUT,
  SONG_COVER_INFO_LAYOUT_STORAGE_KEY,
  isCoverInfoAlignment,
  isCoverInfoSpacing,
  parseSongCoverInfoLayout,
  type CoverInfoSpacingField,
} from '../constants/songCoverInfoLayout'
import { useSongFontSizes } from './useSongFontSizes'

function readInitial() {
  try {
    return parseSongCoverInfoLayout(localStorage.getItem(SONG_COVER_INFO_LAYOUT_STORAGE_KEY))
  } catch (cause) {
    rendererDiagnostics.warn({
      scope: 'appearance.song-cover-info-layout',
      message: 'Could not read cover info layout',
      cause,
    })
    return { ...DEFAULT_SONG_COVER_INFO_LAYOUT }
  }
}
const preference = ref(readInitial())
const persistFailed = ref(false)
function persist() {
  try {
    localStorage.setItem(
      SONG_COVER_INFO_LAYOUT_STORAGE_KEY,
      JSON.stringify({ version: 2, ...preference.value }),
    )
    persistFailed.value = false
  } catch (cause) {
    persistFailed.value = true
    rendererDiagnostics.warn({
      scope: 'appearance.song-cover-info-layout',
      message: 'Could not save cover info layout; keeping it for this session',
      cause,
    })
  }
}
function setSpacing(field: CoverInfoSpacingField, value: number) {
  if (!isCoverInfoSpacing(field, value)) return
  if (preference.value[field] === value && !persistFailed.value) return
  preference.value = { ...preference.value, [field]: value }
  persist()
}
function setAlignment(value: string) {
  if (!isCoverInfoAlignment(value)) return
  if (preference.value.alignment === value && !persistFailed.value) return
  preference.value = { ...preference.value, alignment: value }
  persist()
}
function reset() {
  preference.value = { ...DEFAULT_SONG_COVER_INFO_LAYOUT }
  persist()
}

export function useSongCoverInfoLayout(enabled: MaybeRefOrGetter<boolean> = true) {
  const { songFontSize } = useSongFontSizes()
  const applied = computed(() =>
    toValue(enabled) ? preference.value : DEFAULT_SONG_COVER_INFO_LAYOUT,
  )
  const metadataLayout = computed(() => {
    const lineHeight = (field: string, minimum: number) =>
      toValue(enabled) ? Math.max(minimum, Math.ceil(songFontSize('cover', field) * 1.25)) : minimum
    return {
      artworkGap: applied.value.artworkGap,
      albumArtistGap: applied.value.albumArtistGap,
      artistDateGap: applied.value.artistDateGap,
      albumLineHeight: lineHeight('album', DEFAULT_COVER_METADATA_LAYOUT.albumLineHeight),
      artistLineHeight: lineHeight('albumArtist', DEFAULT_COVER_METADATA_LAYOUT.artistLineHeight),
      dateLineHeight: lineHeight('releaseDate', DEFAULT_COVER_METADATA_LAYOUT.dateLineHeight),
    }
  })
  const style = computed(() => ({
    '--library-cover-meta-gap': `${metadataLayout.value.artworkGap}px`,
    '--library-cover-meta-album-artist-gap': `${metadataLayout.value.albumArtistGap}px`,
    '--library-cover-meta-artist-date-gap': `${metadataLayout.value.artistDateGap}px`,
    '--library-cover-meta-album-line-height': `${metadataLayout.value.albumLineHeight}px`,
    '--library-cover-meta-artist-line-height': `${metadataLayout.value.artistLineHeight}px`,
    '--library-cover-meta-date-line-height': `${metadataLayout.value.dateLineHeight}px`,
    '--library-cover-meta-align': applied.value.alignment,
  }))
  return {
    preference: readonly(preference),
    persistFailed: readonly(persistFailed),
    metadataLayout,
    style,
    setSpacing,
    setAlignment,
    reset,
  }
}
