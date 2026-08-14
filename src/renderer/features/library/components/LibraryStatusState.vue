<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { LibraryStatusKind } from '../types/libraryInteraction'
import type { LibraryPresentation } from '../types/libraryPresentation'

withDefaults(
  defineProps<{
    kind: LibraryStatusKind
    presentation?: LibraryPresentation
    query?: string
    scanProgressText?: string
    errorMessage?: string
    isPlaylist?: boolean
    isSmartPlaylist?: boolean
  }>(),
  {
    presentation: 'modern',
    query: '',
    scanProgressText: '',
    errorMessage: '',
    isPlaylist: false,
    isSmartPlaylist: false,
  },
)

defineEmits<{
  openSettings: []
  clearSearch: []
  retry: []
}>()

const { t } = useI18n()
</script>

<template>
  <div
    class="library-status-state flex flex-1 flex-col items-center justify-center p-8 text-center select-none"
    :data-visual-style="presentation"
    role="status"
    aria-live="polite"
  >
    <!-- Loading / Scanning state -->
    <template v-if="kind === 'loading' || kind === 'scanning'">
      <span
        class="i-lucide-loader-2 mb-3 text-2xl text-[var(--auralis-text-muted)] animate-spin"
      ></span>
      <h3 class="status-title text-base font-semibold text-[var(--auralis-text)]">
        {{ t('library.status.loading') }}
      </h3>
      <p
        v-if="scanProgressText"
        class="status-subtitle mt-1.5 max-w-md text-xs text-[var(--auralis-text-muted)]"
      >
        {{ scanProgressText }}
      </p>
    </template>

    <!-- Empty state -->
    <template v-else-if="kind === 'empty'">
      <div
        class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--auralis-control-hover-bg)]"
      >
        <span class="i-lucide-music-4 text-2xl text-[var(--auralis-text-muted)]"></span>
      </div>

      <h3 class="status-title text-base font-semibold text-[var(--auralis-text)]">
        {{
          isSmartPlaylist
            ? t('library.status.emptySmartPlaylist')
            : isPlaylist
              ? t('library.status.emptyPlaylist')
              : t('library.status.emptyAll')
        }}
      </h3>

      <button
        v-if="!isPlaylist && !isSmartPlaylist"
        class="status-action-btn mt-4 inline-flex items-center gap-2 rounded-md bg-[var(--auralis-control-hover-bg)] px-3.5 py-1.5 text-xs font-semibold text-[var(--auralis-text)] transition hover:bg-[var(--auralis-border-subtle)]"
        type="button"
        @click="$emit('openSettings')"
      >
        <span class="i-lucide-folder-plus text-sm"></span>
        {{ t('settings.musicLibrary.addFolder') }}
      </button>
    </template>

    <!-- Error state -->
    <template v-else-if="kind === 'error'">
      <div
        class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500"
      >
        <span class="i-lucide-alert-circle text-2xl"></span>
      </div>
      <h3 class="status-title text-base font-semibold text-[var(--auralis-text)]">
        {{ errorMessage || t('library.status.loadError') }}
      </h3>
      <button
        class="status-action-btn mt-4 inline-flex items-center gap-2 rounded-md bg-[var(--auralis-control-hover-bg)] px-3.5 py-1.5 text-xs font-semibold text-[var(--auralis-text)] transition hover:bg-[var(--auralis-border-subtle)]"
        type="button"
        @click="$emit('retry')"
      >
        <span class="i-lucide-refresh-cw text-sm"></span>
        {{ t('library.status.retry') }}
      </button>
    </template>

    <!-- No search match state -->
    <template v-else-if="kind === 'no-search-match'">
      <div
        class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--auralis-control-hover-bg)]"
      >
        <span class="i-lucide-search-x text-2xl text-[var(--auralis-text-muted)]"></span>
      </div>
      <h3 class="status-title text-base font-semibold text-[var(--auralis-text)]">
        {{ t('library.search.notFound') }}
      </h3>
      <button
        class="status-action-btn mt-4 inline-flex items-center gap-2 rounded-md bg-[var(--auralis-control-hover-bg)] px-3.5 py-1.5 text-xs font-semibold text-[var(--auralis-text)] transition hover:bg-[var(--auralis-border-subtle)]"
        type="button"
        @click="$emit('clearSearch')"
      >
        <span class="i-lucide-x text-sm"></span>
        {{ t('library.search.clearSearch') }}
      </button>
    </template>
  </div>
</template>
