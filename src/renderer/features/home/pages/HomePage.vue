<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <section class="home-page" :aria-label="t('nav.home')">
    <h1>{{ t('nav.home') }}</h1>
  </section>
</template>

<style scoped>
.home-page {
  display: grid;
  place-items: center;
  height: 100%;
  min-height: 0;
  color: var(--auralis-text);
}

.home-page h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 500;
}
</style>
