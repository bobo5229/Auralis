<script setup lang="ts">
import '../styles/cdTypography.css'
import { useI18n } from 'vue-i18n'

defineProps<{ loading: boolean; failed: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="cd-page-status" role="status">
    <template v-if="failed">
      <p>{{ t('albums.status.loadError') }}</p>
      <button class="cd-page-status__retry" type="button" @click="emit('retry')">
        {{ t('albums.status.retry') }}
      </button>
    </template>
    <p v-else>{{ t(loading ? 'albums.status.loading' : 'albums.status.empty') }}</p>
  </div>
</template>

<style scoped>
.cd-page-status {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--cd-text-muted);
  font-family: var(--cd-font-text);
  font-size: var(--cd-type-status-size);
  line-height: var(--cd-type-status-line-height);
  pointer-events: none;
}

.cd-page-status p {
  margin: 0;
}

.cd-page-status .cd-page-status__retry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid var(--cd-border);
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
}

.cd-page-status .cd-page-status__retry:hover {
  background: var(--cd-hover-bg);
}

.cd-page-status .cd-page-status__retry:focus-visible {
  outline: 2px solid var(--cd-focus-ring);
  outline-offset: 3px;
}
</style>
