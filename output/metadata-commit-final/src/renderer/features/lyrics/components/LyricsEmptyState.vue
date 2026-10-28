<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <div class="flex h-full items-center justify-center">
    <p class="text-sm text-[var(--auralis-lyrics-inactive)]">{{ t('player.lyricsEmpty') }}</p>
  </div>
</template>
