<script setup lang="ts">
import { computed } from 'vue'
import { onBeforeRouteUpdate, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ year: number }>()
const { t } = useI18n()
const title = computed(() => t('archive.annualSummaryPageTitle', { year: props.year }))
// Route-level beforeEnter does not run when only the current route's params change.
onBeforeRouteUpdate((to) => {
  if (Number(to.params.year) < 1900) return { name: 'archive' }
})
</script>

<template>
  <section class="archive-summary-page" :aria-label="title">
    <div class="summary-page-content">
      <header class="summary-page-header">
        <RouterLink
          class="summary-back-link auralis-type-control"
          :to="{ name: 'archive', query: { year: String(year) } }"
        >
          <span class="i-lucide-chevron-left" aria-hidden="true"></span>
          {{ t('archive.backToYear', { year }) }}
        </RouterLink>
        <h1 class="auralis-type-page">{{ title }}</h1>
      </header>
      <div class="summary-placeholder auralis-type-body">
        {{ t('archive.annualSummaryPending') }}
      </div>
    </div>
  </section>
</template>

<style scoped>
.archive-summary-page {
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 24px;
  padding-bottom: calc(var(--auralis-playbar-safe-area) + 24px);
  color: var(--auralis-text);
}

.summary-page-content {
  width: 100%;
  max-width: 1600px;
  margin-inline: auto;
}

.summary-page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.summary-page-header h1 {
  margin: 0;
  font-weight: 500;
}

.summary-back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--auralis-text-muted);
  text-decoration: none;
}

.summary-back-link > span {
  width: 16px;
  height: 16px;
}

.summary-back-link:hover {
  color: var(--auralis-text);
}

.summary-back-link:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 4px;
}

.summary-placeholder {
  display: grid;
  place-items: center;
  min-height: 220px;
  padding: 32px 16px;
  color: var(--auralis-text-muted);
  text-align: center;
}
</style>
