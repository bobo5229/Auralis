<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  albumCount: number
  trackCount: number
}>()

const { t } = useI18n()
const formattedAlbumCount = computed(() => props.albumCount.toLocaleString())
const formattedTrackCount = computed(() => props.trackCount.toLocaleString())
</script>

<template>
  <header class="album-catalog-header select-none">
    <div class="album-catalog-heading">
      <h1>{{ t('albums.manuscript.title') }}</h1>
      <p>{{ t('albums.manuscript.subtitle') }}</p>
    </div>
    <div class="album-catalog-counts" aria-live="polite">
      <span>{{ t('albums.manuscript.albumCount', { count: formattedAlbumCount }) }}</span>
      <span aria-hidden="true">/</span>
      <span>{{ t('albums.manuscript.trackCount', { count: formattedTrackCount }) }}</span>
    </div>
  </header>
</template>
