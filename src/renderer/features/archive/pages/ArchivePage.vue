<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <section class="archive-page" :aria-label="t('archive.title')">
    <p class="archive-placeholder auralis-type-body">{{ t('archive.placeholder') }}</p>
  </section>
</template>

<style scoped>
.archive-page {
  display: grid;
  place-items: center;
  height: 100%;
  min-height: 0;
  padding: 24px;
  color: var(--auralis-text-muted);
}

.archive-placeholder {
  margin: 0;
  text-align: center;
}
</style>
