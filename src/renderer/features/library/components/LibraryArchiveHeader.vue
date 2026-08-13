<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatFolioNumber } from '../constants/libraryArchivePresentation'
import type { LibraryPageIdentity } from '../types/libraryPresentation'

const props = defineProps<{
  identity: LibraryPageIdentity | null
  trackCount: number
  currentFolio: number
  totalFolios: number
  isLoading: boolean
}>()

const { t } = useI18n()

const isIdentityPending = computed(() => props.identity === null)

const titleText = computed(() => {
  if (!props.identity) return t('library.manuscript.header.loadingTitle')
  if (props.identity.kind === 'library') return t('library.manuscript.header.title')
  const name = props.identity.name.trim()
  return name || t('library.manuscript.header.untitled')
})

const subtitleText = computed(() => {
  if (!props.identity) return t('library.manuscript.header.loadingSubtitle')
  if (props.identity.kind === 'playlist') return t('library.manuscript.header.playlistSubtitle')
  if (props.identity.kind === 'smart-playlist') {
    return t('library.manuscript.header.smartPlaylistSubtitle')
  }
  return t('library.manuscript.header.subtitle')
})

const kindLabel = computed(() => {
  if (props.identity?.kind === 'playlist') return t('library.manuscript.header.playlistKind')
  if (props.identity?.kind === 'smart-playlist') {
    return t('library.manuscript.header.smartPlaylistKind')
  }
  return null
})

const membershipLabel = computed(() => {
  if (props.identity?.kind === 'playlist') return t('library.manuscript.header.playlistMembership')
  if (props.identity?.kind === 'smart-playlist') {
    return t('library.manuscript.header.smartPlaylistMembership')
  }
  return t('library.manuscript.header.libraryMembership')
})

const formattedTrackCount = computed(() => {
  if (props.isLoading) return '---'
  return props.trackCount.toLocaleString()
})

const formattedCurrentFolio = computed(() => {
  if (props.isLoading) return '000'
  return formatFolioNumber(props.currentFolio)
})

const formattedTotalFolios = computed(() => {
  if (props.isLoading) return '000'
  return formatFolioNumber(props.totalFolios)
})
</script>

<template>
  <header
    class="library-archive-header select-none border-b border-[var(--manuscript-border-ledger)] px-8 pt-6 pb-4 transition-colors"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-4 pr-32">
      <div class="flex flex-col gap-1">
        <h1
          class="library-archive-header__title font-[var(--manuscript-font-body)] text-2xl font-semibold tracking-wide text-[var(--manuscript-content-primary)]"
          :title="titleText"
        >
          {{ titleText }}
        </h1>
        <p
          class="library-archive-header__meta font-[var(--manuscript-font-body)] text-xs tracking-wider text-[var(--manuscript-content-ledger-label)]"
        >
          <span>{{ subtitleText }}</span>
          <span
            v-if="kindLabel"
            class="library-archive-header__kind"
            :data-membership="props.identity?.kind ?? undefined"
          >
            {{ kindLabel }}
          </span>
          <span v-if="!isIdentityPending" class="library-archive-header__membership">
            {{ membershipLabel }}
          </span>
        </p>
      </div>

      <div
        class="flex items-center gap-6 font-[var(--manuscript-font-numeric)] text-xs text-[var(--manuscript-content-ledger-label)]"
      >
        <span class="tabular-nums">
          {{ t('library.manuscript.header.trackCount', { count: formattedTrackCount }) }}
        </span>
        <span class="opacity-40">|</span>
        <span class="tabular-nums tracking-widest">
          {{
            t('library.manuscript.header.folio', {
              current: formattedCurrentFolio,
              total: formattedTotalFolios,
            })
          }}
        </span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.library-archive-header {
  container-type: inline-size;
  container-name: archive-header;
}

.library-archive-header__title {
  display: -webkit-box;
  min-height: 3.5rem;
  max-height: 3.5rem;
  overflow: hidden;
  line-height: 1.75rem;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  word-break: break-word;
}

.library-archive-header__meta {
  display: flex;
  min-height: 1.25rem;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
}

.library-archive-header__kind,
.library-archive-header__membership {
  flex: 0 1 auto;
}
</style>
