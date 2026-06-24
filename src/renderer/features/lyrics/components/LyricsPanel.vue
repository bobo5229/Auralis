<script setup lang="ts">
import { useTrackLyrics } from '../composables/useTrackLyrics'
import SyncedLyricsView from './SyncedLyricsView.vue'
import PlainLyricsView from './PlainLyricsView.vue'
import LyricsEmptyState from './LyricsEmptyState.vue'

const { status, rawLyrics, parsedLines, activeIndex, isPrelude } = useTrackLyrics()
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex-1 overflow-hidden pt-4">
      <div v-if="status === 'no-track'" class="flex h-full items-center justify-center">
        <p class="text-sm text-[var(--auralis-text-faint)]">No track selected</p>
      </div>

      <div v-else-if="status === 'loading'" class="flex h-full items-center justify-center">
        <p class="text-sm text-[var(--auralis-text-faint)]">Loading lyrics...</p>
      </div>

      <LyricsEmptyState v-else-if="status === 'empty'" />

      <PlainLyricsView v-else-if="status === 'plain' && rawLyrics" :text="rawLyrics" />

      <SyncedLyricsView
        v-else-if="status === 'lrc'"
        :lines="parsedLines"
        :active-index="activeIndex"
        :is-prelude="isPrelude"
      />
    </div>
  </div>
</template>
