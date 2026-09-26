<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import MainPageStatus from '@renderer/app/layout/MainPageStatus.vue'
import type { LibraryStatusKind } from '../types/libraryInteraction'

const props = withDefaults(
  defineProps<{
    kind: LibraryStatusKind
    query?: string
    scanProgressText?: string
    errorMessage?: string
    isPlaylist?: boolean
    isSmartPlaylist?: boolean
  }>(),
  {
    query: '',
    scanProgressText: '',
    errorMessage: '',
    isPlaylist: false,
    isSmartPlaylist: false,
  },
)

const emit = defineEmits<{
  openSettings: []
  clearSearch: []
  retry: []
}>()

const { t } = useI18n()
const statusKind = computed(() => {
  if (props.kind === 'loading' || props.kind === 'scanning') return 'loading'
  return props.kind === 'error' ? 'error' : 'empty'
})
const title = computed(() => {
  if (statusKind.value === 'loading') return t('library.status.loading')
  if (props.kind === 'error') return props.errorMessage || t('library.status.loadError')
  if (props.kind === 'no-search-match') return t('library.search.notFound')
  return t(
    props.isSmartPlaylist
      ? 'library.status.emptySmartPlaylist'
      : props.isPlaylist
        ? 'library.status.emptyPlaylist'
        : 'library.status.emptyAll',
  )
})
const actionLabel = computed(() => {
  if (props.kind === 'error') return t('library.status.retry')
  if (props.kind === 'no-search-match') return t('library.search.clearSearch')
  if (props.kind === 'empty' && !props.isPlaylist && !props.isSmartPlaylist) {
    return t('settings.musicLibrary.addFolder')
  }
  return ''
})

function onAction(): void {
  if (props.kind === 'error') emit('retry')
  else if (props.kind === 'no-search-match') emit('clearSearch')
  else emit('openSettings')
}
</script>

<template>
  <MainPageStatus
    class="library-status-state"
    :kind="statusKind"
    :title="title"
    :description="statusKind === 'loading' ? scanProgressText : ''"
    :action-label="actionLabel"
    :icon="kind === 'no-search-match' ? 'i-lucide-search-x' : 'i-lucide-music-4'"
    @action="onAction"
  />
</template>
