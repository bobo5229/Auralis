<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import MainPageStatus from '@renderer/shared/components/MainPageStatus.vue'
import type { LibraryStatusKind } from '../types/libraryInteraction'

const props = withDefaults(
  defineProps<{
    kind: LibraryStatusKind
    query?: string
    scanProgressText?: string
    errorMessage?: string
    emptyError?: string
    emptyAction?: 'select-folder' | 'retry-scan' | 'retry-roots' | null
    actionPending?: boolean
    isPlaylist?: boolean
    isSmartPlaylist?: boolean
    isRecentAdded?: boolean
  }>(),
  {
    query: '',
    scanProgressText: '',
    errorMessage: '',
    emptyError: '',
    emptyAction: null,
    actionPending: false,
    isPlaylist: false,
    isSmartPlaylist: false,
    isRecentAdded: false,
  },
)

const emit = defineEmits<{
  selectFolder: []
  retryScan: []
  retryRoots: []
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
  if (props.kind === 'empty' && props.isRecentAdded) return t('library.recentAdded.empty')
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
  if (props.kind === 'empty' && props.emptyAction === 'select-folder')
    return t('settings.library.selectFolder')
  if (props.kind === 'empty' && props.emptyAction === 'retry-scan')
    return t('settings.library.scanLibrary')
  if (props.kind === 'empty' && props.emptyAction === 'retry-roots')
    return t('library.status.retry')
  return ''
})

function onAction(): void {
  if (props.kind === 'error') emit('retry')
  else if (props.kind === 'no-search-match') emit('clearSearch')
  else if (props.emptyAction === 'select-folder') emit('selectFolder')
  else if (props.emptyAction === 'retry-scan') emit('retryScan')
  else if (props.emptyAction === 'retry-roots') emit('retryRoots')
}
</script>

<template>
  <MainPageStatus
    class="library-status-state"
    :class="{
      'library-status-state--initial': kind === 'empty' && emptyAction === 'select-folder',
    }"
    :kind="statusKind"
    :title="title"
    :description="statusKind === 'loading' ? scanProgressText : emptyError"
    :action-label="actionLabel"
    :action-disabled="actionPending"
    :show-icon="kind !== 'empty'"
    :icon="kind === 'no-search-match' ? 'i-lucide-search-x' : 'i-lucide-music-4'"
    @action="onAction"
  />
</template>

<style scoped>
.library-status-state--initial :deep(button) {
  min-height: 40px;
  padding: 0 20px;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  color: var(--auralis-control-primary-text);
  background: var(--auralis-control-primary-bg);
}

.library-status-state--initial :deep(button:hover:not(:disabled)) {
  background: color-mix(in srgb, var(--auralis-control-primary-bg) 88%, white);
}
</style>
